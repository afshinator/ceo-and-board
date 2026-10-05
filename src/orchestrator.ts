import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { RpcPiAgentClient, ScriptedPiAgentClient, type PiAgentClient, type PiAgentClientFactory, type PiAgentStartConfig } from './pi.js';
import type { RunSession } from './run.js';

export interface BoardTurnResult {
  runId: string;
  outputs: Record<string, string | null>;
  memberResults: Record<string, BoardTurnMemberResult>;
}

export interface BoardTurnMemberResult {
  sessionId: string;
  sessionDir: string;
  prompt: string;
  output: string | null;
  healthy: boolean;
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
          };
          break;
        } catch (error) {
          if (client) {
            await client.close().catch(() => undefined);
          }

          if (attemptCount >= 2 || !this.options.autoRetry) {
            throw error;
          }
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
    conclusion: string,
  ): Promise<string> {
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
      conclusion,
      '',
    ].join('\n');

    await mkdir(join(run.sessionPath, 'snapshot'), { recursive: true });
    await writeFile(run.memoPath, memo, 'utf8');

    const sessionPath = join(run.sessionPath, 'session.json');
    const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;

    for (const [memberName, memberResult] of Object.entries(turn.memberResults)) {
      const tracked = sessionJson.board[memberName] ?? {};
      tracked.status = memberResult.healthy ? 'COMPLETED' : 'FAILED';
      tracked.last_output = memberResult.output ?? null;
      tracked.last_updated = new Date().toISOString();
      sessionJson.board[memberName] = tracked;
    }

    sessionJson.round = Number(sessionJson.round ?? 0) + 1;
    sessionJson.round_state = 'CEO_SYNTHESIS_COMPLETE';
    sessionJson.status = 'READY';
    sessionJson.updated_at = new Date().toISOString();
    sessionJson.ceo_conclusion = conclusion;

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
