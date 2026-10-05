import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { ExtensionAPI, ExtensionCommandContext, ExtensionToolContext } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { discoverBriefs, validateBrief } from '../briefs.js';
import { findConfigFile, loadConfig, resolveAgentPath } from '../config.js';
import { loadAgentDefinition } from '../agents.js';
import { renderAgentPrompt } from '../prompt-renderer.js';
import { BoardOrchestrator } from '../orchestrator.js';
import type { PiAgentClientFactory } from '../pi.js';
import { acquireProjectLock, createRun, type ProjectLock, type RunSession } from '../run.js';

interface ActiveDecision {
  run: RunSession;
  lock: ProjectLock;
  orchestrator: BoardOrchestrator;
  lastTurn?: Awaited<ReturnType<BoardOrchestrator['runBoardRound']>>;
}

export interface CeoBoardExtensionOptions {
  clientFactory?: PiAgentClientFactory;
}

function result(text: string, isError = false) {
  return {
    content: [{ type: 'text' as const, text }],
    details: {},
    isError,
  };
}

async function findConfig(projectRoot: string): Promise<string> {
  const configPath = await findConfigFile(projectRoot);
  if (!configPath) {
    throw new Error(`No CEO–Board configuration found in ${projectRoot}.`);
  }
  return configPath;
}

async function findCeoAgentPath(projectRoot: string): Promise<string | undefined> {
  const candidates = [
    join(projectRoot, 'expertise', 'ceo.md'),
    join(projectRoot, '.pi', 'ceo-agents', 'expertise', 'ceo.md'),
  ];
  for (const path of candidates) {
    try {
      await access(path);
      return path;
    } catch {
      continue;
    }
  }
  return undefined;
}

export function registerCeoBoardExtension(
  pi: ExtensionAPI,
  options: CeoBoardExtensionOptions = {},
): void {
  let activeDecision: ActiveDecision | undefined;

  const releaseActiveDecision = async () => {
    const active = activeDecision;
    activeDecision = undefined;
    if (active) {
      await active.orchestrator.closeRun(active.run);
      await active.lock.release();
    }
  };

  pi.on('session_shutdown', () => releaseActiveDecision());

  pi.registerCommand('ceo-begin', {
    description: 'Start a CEO–Board decision from a validated brief.',
    handler: async (args: string, context: ExtensionCommandContext) => {
      if (activeDecision) {
        context.ui.notify(`A CEO–Board run is already active: ${activeDecision.run.sessionName}`, 'warning');
        return;
      }

      try {
        const projectRoot = resolve(context.cwd);
        const config = await loadConfig(await findConfig(projectRoot));
        const briefsDirectory = resolve(projectRoot, config.paths.briefs);
        const briefs = await discoverBriefs(briefsDirectory);
        if (briefs.length === 0) {
          throw new Error(`No valid brief packages found in ${briefsDirectory}.`);
        }

        const requestedBriefName = args.trim();
        const selectedBriefName = requestedBriefName || (context.hasUI
          ? await context.ui.select('Choose a CEO–Board brief', briefs.map((candidate) => candidate.name))
          : undefined);
        const brief = selectedBriefName
          ? briefs.find((candidate) => candidate.name === selectedBriefName)
          : undefined;
        if (!brief) {
          throw new Error(selectedBriefName
            ? `Unknown brief "${selectedBriefName}".`
            : 'Brief selection requires TUI mode or an explicit brief name.');
        }

        const briefContent = await readFile(brief.path, 'utf8');
        const validation = validateBrief(briefContent, config.brief_sections ?? [
          { section: 'Situation' },
          { section: 'Stakes' },
          { section: 'Constraints' },
          { section: 'Key Question' },
        ]);
        if (!validation.ok) {
          throw new Error(`Brief validation failed: ${validation.errors.join('; ')}`);
        }

        const lock = await acquireProjectLock(projectRoot, { owner: 'ceo-board-extension' });
        try {
          const run = await createRun(projectRoot, {
            briefName: brief.name,
            briefContent,
            boardMembers: config.board.map((member) => member.name),
            boardMemberPaths: Object.fromEntries(config.board.map((member) => [
              member.name,
              resolveAgentPath(member.path, config, projectRoot),
            ])),
            constraints: config.meeting.constraints,
            paths: config.paths,
          });
          await lock.associateRun(run);
          const ceoAgentPath = await findCeoAgentPath(projectRoot);
          if (ceoAgentPath) {
            run.ceoAgentPath = ceoAgentPath;
            try {
              const ceoAgent = await loadAgentDefinition(ceoAgentPath);
              run.ceoModel = ceoAgent.frontmatter.model;
            } catch {
              // A CEO definition without valid frontmatter does not block framing.
            }
          }
          const orchestrator = new BoardOrchestrator(options.clientFactory, { autoRetry: true, cwd: projectRoot });
          activeDecision = { run, lock, orchestrator };

          const constraints = config.meeting.constraints;
          const numeric = (value: unknown) => Number.parseFloat(String(value)) || 0;
          let framingBody: string;
          if (run.ceoAgentPath) {
            try {
              const ceoAgent = await loadAgentDefinition(run.ceoAgentPath);
              framingBody = renderAgentPrompt(ceoAgent, {
                sessionId: run.sessionId,
                briefContent,
                boardMembers: config.board.map((member) => member.name),
                memoPath: run.memoPath,
                minTime: constraints.min_time_minutes,
                maxTime: constraints.max_time_minutes,
                minBudget: numeric(constraints.min_budget),
                maxBudget: numeric(constraints.max_budget),
                supportingFiles: brief.supportingFiles,
                conversationPath: join(run.sessionPath, 'conversation.jsonl'),
                expertise: [],
                skills: [],
              });
            } catch {
              framingBody = '';
            }
          } else {
            framingBody = '';
          }
          const supportingContents = await Promise.all(brief.supportingFiles.map(async (fileName) => {
            try {
              const contents = await readFile(join(briefsDirectory, brief.name, fileName), 'utf8');
              return `### Supporting file: ${fileName}\n${contents}`;
            } catch {
              return null;
            }
          }));
          const framingRequest = [
            framingBody || `You are the CEO for decision session ${run.sessionName}.`,
            '',
            `Session ID: ${run.sessionId}`,
            `Brief: ${brief.name}`,
            `Board members: ${config.board.map((member) => member.name).join(', ')}`,
            `Minimum time: ${constraints.min_time_minutes} minutes.`,
            `Maximum time: ${constraints.max_time_minutes} minutes.`,
            `Minimum budget (display only): ${constraints.min_budget}.`,
            `Maximum budget: ${constraints.max_budget}.`,
            '',
            'Review the complete brief, frame the decision, and use converse to consult the board. Continue deliberating until voluntary closing is eligible or a maximum forces closing. Then call end_deliberation.',
            '',
            '## Brief',
            briefContent,
            ...supportingContents.filter((block): block is string => block !== null).length
              ? ['', '## Supporting Context', ...supportingContents.filter((block): block is string => block !== null)]
              : [],
          ].flat().join('\n\n');
          context.ui.setStatus('ceo-board', `Active: ${brief.name}`);
          pi.sendUserMessage(framingRequest);
          context.ui.notify(`CEO–Board run started: ${run.sessionName}.`, 'info');
        } catch (error) {
          await lock.release();
          throw error;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.ui.notify(message, 'error');
      }
    },
  });

  pi.registerTool({
    name: 'converse',
    label: 'Board deliberation',
    description: 'Send a CEO message to all, one, or a subset of available board members and wait for the round barrier.',
    promptSnippet: 'converse({ to, message }) runs a parallel board round and returns accepted responses plus constraint state.',
    parameters: Type.Object({
      to: Type.Union([Type.Literal('all'), Type.String(), Type.Array(Type.String())]),
      message: Type.String({ minLength: 1 }),
    }),
    async execute(_toolCallId, params: { to: 'all' | string | string[]; message: string }, _signal, _onUpdate, context: ExtensionToolContext) {
      const active = activeDecision;
      if (!active) {
        return result('No active CEO–Board run. Start one with /ceo-begin.', true);
      }

      try {
        const round = await active.orchestrator.runBoardRound(active.run, params);
        active.lastTurn = round;
        context.ui.setStatus('ceo-board', `Round ${round.responses.length ? 'complete' : 'unavailable'} | ${round.constraint.forced_close ? 'closing' : 'deliberating'}`);
        return result(JSON.stringify({ responses: round.responses, constraint: round.constraint }, null, 2));
      } catch (error) {
        return result(error instanceof Error ? error.message : String(error), true);
      }
    },
  });

  pi.registerTool({
    name: 'end_deliberation',
    label: 'End deliberation',
    description: 'Collect final statements from available board members, then synthesize and validate the CEO decision memo.',
    promptSnippet: 'Call end_deliberation when ready to collect final positions and produce the validated CEO memo.',
    parameters: Type.Object({}),
    async execute(_toolCallId, _params: Record<string, never>, _signal, _onUpdate, _context: ExtensionToolContext) {
      const active = activeDecision;
      if (!active?.lastTurn) {
        return result('No completed board round is available to close. Run converse first.', true);
      }

      try {
        const finalStatements = await active.orchestrator.endDeliberation(active.run, active.lastTurn);
        const memo = await active.orchestrator.writeCEOConclusion(active.run, active.lastTurn);
        await releaseActiveDecision();
        return result(JSON.stringify({ final_statements: finalStatements, memo_path: active.run.memoPath, memo }, null, 2));
      } catch (error) {
        try {
          const checkpoint = JSON.parse(await readFile(join(active.run.sessionPath, 'session.json'), 'utf8')) as Record<string, any>;
          if (checkpoint.lifecycle_state === 'FAILED') {
            await releaseActiveDecision();
          }
        } catch {
          // Return the original tool error if checkpoint inspection fails.
        }
        return result(error instanceof Error ? error.message : String(error), true);
      }
    },
  });
}

export default function registerExtension(pi: ExtensionAPI): void {
  registerCeoBoardExtension(pi);
}
