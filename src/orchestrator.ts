import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { RpcPiAgentClient, ScriptedPiAgentClient, type PiAgentClient, type PiAgentClientFactory, type PiAgentStartConfig } from './pi.js';
import type { RunSession } from './run.js';

export interface BoardTurnResult {
  runId: string;
  outputs: Record<string, string | null>;
  memberResults: Record<string, BoardTurnMemberResult>;
}

export type BoardMemberExecutionStatus = 'COMPLETED' | 'FAILED';

export interface BoardTurnMemberResult {
  sessionId: string;
  sessionDir: string;
  prompt: string;
  output: string | null;
  healthy: boolean;
  status: BoardMemberExecutionStatus;
  attempts: number;
  error: string | null;
}

export interface BoardMemberTelemetry {
  status: BoardMemberExecutionStatus;
  response_count: number;
  attempts: number;
  last_output: string | null;
  last_error: string | null;
  last_updated: string;
}

export interface BoardOrchestratorOptions {
  cwd?: string;
  autoRetry?: boolean;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'member';
}

const REQUIRED_MEMO_HEADINGS = [
  '# Board Memo',
  '## Final Decision',
  '## Ranked Recommendations',
  '## Decision Map',
  '## Board Stances',
  '## Tensions & Dissent',
  '## Trade-offs & Risks',
  '## Next Actions',
  '## Deliberation Summary',
];

function validateMemo(memo: string): string[] {
  const normalized = memo.replace(/\r/g, '');
  const issues: string[] = [];

  for (const heading of REQUIRED_MEMO_HEADINGS) {
    if (!normalized.includes(heading)) {
      issues.push(`missing required heading: ${heading}`);
    }
  }

  let inFinalDecision = false;
  const finalDecisionLines: string[] = [];

  for (const line of normalized.split('\n')) {
    if (line.startsWith('## ')) {
      if (line === '## Final Decision') {
        inFinalDecision = true;
        continue;
      }

      if (inFinalDecision) {
        break;
      }
    }

    if (inFinalDecision) {
      finalDecisionLines.push(line);
    }
  }

  if (finalDecisionLines.join('\n').trim().length === 0) {
    issues.push('missing non-empty Final Decision section');
  }

  return issues;
}

export function buildBoardTelemetry(turn: BoardTurnResult): Record<string, BoardMemberTelemetry> {
  return Object.fromEntries(
    Object.entries(turn.memberResults).map(([memberName, memberResult]) => [
      memberName,
      {
        status: memberResult.status,
        response_count: memberResult.output ? 1 : 0,
        attempts: memberResult.attempts,
        last_output: memberResult.output ?? null,
        last_error: memberResult.error ?? null,
        last_updated: new Date().toISOString(),
      },
    ]),
  );
}

export class BoardOrchestrator {
  constructor(
    private readonly clientFactory: PiAgentClientFactory = new DefaultPiAgentClientFactory(),
    private readonly options: BoardOrchestratorOptions = {},
  ) {}

  async synthesizeCEOConclusion(
    run: RunSession,
    turn: BoardTurnResult,
    prompt?: string,
  ): Promise<string> {
    const synthesisPrompt = prompt ?? [
      'You are the CEO consolidating the board discussion into one decision.',
      '',
      'Board member outputs:',
      ...Object.entries(turn.outputs).map(([memberName, output]) => `${memberName}: ${output ?? 'No output recorded.'}`),
      '',
      'Provide a concise but reasoned final decision and recommendation for the run.',
    ].join('\n');

    const config: PiAgentStartConfig = {
      agentName: 'CEO',
      sessionId: `${run.sessionId}.ceo`,
      sessionDir: join(run.sessionPath, 'pi-sessions', 'ceo'),
      cwd: this.options.cwd ?? process.cwd(),
      autoRetry: this.options.autoRetry ?? false,
    };

    const client = await this.clientFactory.create(config);
    try {
      await client.start(config);
      await client.prompt(synthesisPrompt);
      await client.waitUntilSettled();

      const conclusion = await client.getLastAssistantText();
      return (conclusion ?? '').trim();
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  async runBoardTurn(
    run: RunSession,
    promptsByMember: Record<string, string>,
  ): Promise<BoardTurnResult> {
    const sessionPath = join(run.sessionPath, 'session.json');
    const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
    sessionJson.status = 'RUNNING';
    sessionJson.lifecycle_state = 'DELIBERATING';
    sessionJson.updated_at = new Date().toISOString();
    await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');

    const outputs: Record<string, string | null> = {};
    const memberResults: Record<string, BoardTurnMemberResult> = {};

    for (const memberName of Object.keys(run.board)) {
      const promptText = promptsByMember[memberName];
      if (!promptText) {
        throw new Error(`No prompt configured for board member "${memberName}".`);
      }

      const memberSlug = slugify(memberName);
      const sessionId = `${run.sessionId}.${memberSlug}`;
      const sessionDir = join(run.sessionPath, 'pi-sessions', memberSlug);
      await mkdir(sessionDir, { recursive: true });

      const config: PiAgentStartConfig = {
        agentName: memberName,
        sessionId,
        sessionDir,
        cwd: this.options.cwd ?? process.cwd(),
        autoRetry: this.options.autoRetry ?? false,
      };

      let client: PiAgentClient | undefined;
      let attemptCount = 0;

      while (attemptCount < 2) {
        attemptCount += 1;

        try {
          client = await this.clientFactory.create(config);
          await client.start(config);
          await client.prompt(promptText);
          await client.waitUntilSettled();

          const finalText = await client.getLastAssistantText();
          outputs[memberName] = finalText;
          memberResults[memberName] = {
            sessionId,
            sessionDir,
            prompt: promptText,
            output: finalText,
            healthy: client.isHealthy(),
            status: 'COMPLETED',
            attempts: attemptCount,
            error: null,
          };
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          if (client) {
            await client.close().catch(() => undefined);
          }

          if (attemptCount >= 2 || !this.options.autoRetry) {
            throw new Error(`Board member "${memberName}" failed after ${attemptCount} attempt(s): ${message}`);
          }

          memberResults[memberName] = {
            sessionId,
            sessionDir,
            prompt: promptText,
            output: null,
            healthy: false,
            status: 'FAILED',
            attempts: attemptCount,
            error: message,
          };
        }
      }

      if (!memberResults[memberName]) {
        throw new Error(`Board member "${memberName}" did not complete after retry.`);
      }
    }

    return {
      runId: run.sessionId,
      outputs,
      memberResults,
    };
  }

  async endDeliberation(
    run: RunSession,
    turn: BoardTurnResult,
    finalStatementsByMember?: Record<string, string>,
  ): Promise<Record<string, string>> {
    const sessionPath = join(run.sessionPath, 'session.json');
    const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
    const finalStatements: Record<string, string> = {};

    sessionJson.status = 'RUNNING';
    sessionJson.lifecycle_state = 'FINAL_CLOSING';
    sessionJson.round_state = 'FINAL_CLOSING';
    sessionJson.updated_at = new Date().toISOString();

    for (const memberName of Object.keys(run.board)) {
      const statement = finalStatementsByMember?.[memberName] ?? turn.outputs[memberName] ?? `Final position: ${memberName} remains committed to the current recommendation.`;
      finalStatements[memberName] = statement;

      const tracked = sessionJson.board[memberName] ?? {};
      tracked.status = 'COMPLETED';
      tracked.last_output = statement;
      tracked.last_updated = new Date().toISOString();
      sessionJson.board[memberName] = tracked;
    }

    sessionJson.final_statements = finalStatements;
    await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');
    return finalStatements;
  }

  async finalizeRun(
    run: RunSession,
    turn: BoardTurnResult,
    finalStatementsByMember?: Record<string, string>,
  ): Promise<{ memo: string; finalStatements: Record<string, string> }> {
    const finalStatements = await this.endDeliberation(run, turn, finalStatementsByMember);
    const memo = await this.writeCEOConclusion(run, turn);

    return { memo, finalStatements };
  }

  async writeCEOConclusion(
    run: RunSession,
    turn: BoardTurnResult,
    conclusion?: string,
  ): Promise<string> {
    let finalConclusion = conclusion ?? null;
    let memo = '';
    let attemptCount = 0;

    const sessionPath = join(run.sessionPath, 'session.json');
    const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
    sessionJson.status = 'RUNNING';
    sessionJson.lifecycle_state = 'CEO_SYNTHESIS';
    sessionJson.updated_at = new Date().toISOString();
    await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');

    while (attemptCount < 2) {
      attemptCount += 1;
      if (!finalConclusion) {
        finalConclusion = await this.synthesizeCEOConclusion(run, turn, attemptCount > 1
          ? 'The previous CEO memo was invalid. Please rewrite it as a valid board memo that includes the required headings and a non-empty Final Decision.'
          : undefined);
      }

      memo = [
        '# Board Memo: CEO Decision',
        '',
        `- Run: ${run.sessionName}`,
        `- Session ID: ${run.sessionId}`,
        '',
        '## Final Decision',
        '',
        finalConclusion,
        '',
        '## Ranked Recommendations',
        '',
        `1. ${finalConclusion}`,
        '',
        '## Decision Map',
        '',
        '- Board discussion resolved to a single CEO decision.',
        '',
        '## Board Stances',
        '',
        ...Object.entries(turn.outputs).map(([memberName, output]) => `### ${memberName}\n\n${output ?? 'No output recorded.'}\n`),
        '',
        '## Tensions & Dissent',
        '',
        'The board surfaced the main trade-off and dissenting position before the CEO synthesized the final recommendation.',
        '',
        '## Trade-offs & Risks',
        '',
        'The chief risks are execution risk and decision quality under uncertainty.',
        '',
        '## Next Actions',
        '',
        '1. Confirm the chosen direction with the owning team.',
        '2. Document the specific implementation order.',
        '',
        '## Deliberation Summary',
        '',
        `The board reviewed the case and the CEO selected: ${finalConclusion}`,
        '',
      ].join('\n');

      const validationErrors = validateMemo(memo);
      if (validationErrors.length === 0) {
        await mkdir(join(run.sessionPath, 'snapshot'), { recursive: true });
        await writeFile(run.memoPath, memo, 'utf8');

        const sessionPath = join(run.sessionPath, 'session.json');
        const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;

        for (const [memberName, memberResult] of Object.entries(turn.memberResults)) {
          const tracked = sessionJson.board[memberName] ?? {};
          tracked.status = memberResult.healthy ? 'COMPLETED' : 'FAILED';
          tracked.attempts = memberResult.attempts ?? Number(tracked.attempts ?? 0);
          tracked.last_output = memberResult.output ?? null;
          tracked.last_error = memberResult.error ?? null;
          tracked.last_updated = new Date().toISOString();
          sessionJson.board[memberName] = tracked;
        }

        sessionJson.round = Number(sessionJson.round ?? 0) + 1;
        sessionJson.round_state = 'CEO_SYNTHESIS_COMPLETE';
        sessionJson.status = 'READY';
        sessionJson.lifecycle_state = 'COMPLETED';
        sessionJson.updated_at = new Date().toISOString();
        sessionJson.ceo_conclusion = finalConclusion;
        sessionJson.telemetry = buildBoardTelemetry(turn);

        await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');
        return memo;
      }

      if (attemptCount >= 2 || !this.options.autoRetry) {
        const sessionPath = join(run.sessionPath, 'session.json');
        const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;

        sessionJson.round = Number(sessionJson.round ?? 0) + 1;
        sessionJson.round_state = 'CEO_SYNTHESIS_FAILED';
        sessionJson.status = 'FAILED';
        sessionJson.lifecycle_state = 'FAILED';
        sessionJson.updated_at = new Date().toISOString();
        sessionJson.ceo_conclusion = finalConclusion;
        sessionJson.last_error = validationErrors.join('; ');
        sessionJson.telemetry = buildBoardTelemetry(turn);

        await writeFile(run.memoPath, memo, 'utf8');
        await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');
        throw new Error(`CEO synthesis failed memo validation: ${validationErrors.join('; ')}`);
      }

      finalConclusion = null;
    }

    throw new Error('CEO memo synthesis failed unexpectedly.');
  }
}

class DefaultPiAgentClientFactory implements PiAgentClientFactory {
  async create(config: PiAgentStartConfig): Promise<PiAgentClient> {
    return new RpcPiAgentClient({
      agentName: config.agentName,
      piSessionId: config.sessionId,
      cwd: config.cwd,
    });
  }
}
