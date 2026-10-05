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
      if (!conclusion || !conclusion.trim()) {
        throw new Error('CEO synthesis produced no decision text.');
      }

      return conclusion.trim();
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  async runBoardTurn(
    run: RunSession,
    promptsByMember: Record<string, string>,
  ): Promise<BoardTurnResult> {
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

  async writeCEOConclusion(
    run: RunSession,
    turn: BoardTurnResult,
    conclusion?: string,
  ): Promise<string> {
    const finalConclusion = conclusion ?? (await this.synthesizeCEOConclusion(run, turn));

    const memo = [
      '# CEO Decision Memo',
      '',
      `- Run: ${run.sessionName}`,
      `- Session ID: ${run.sessionId}`,
      '',
      '## Board inputs',
      '',
      ...Object.entries(turn.outputs).map(([memberName, output]) => `### ${memberName}\n\n${output ?? 'No output recorded.'}\n`),
      '',
      '## CEO conclusion',
      '',
      finalConclusion,
      '',
    ].join('\n');

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
    sessionJson.updated_at = new Date().toISOString();
    sessionJson.ceo_conclusion = finalConclusion;

    await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');
    return memo;
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
