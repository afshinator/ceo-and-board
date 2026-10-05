import { mkdir, writeFile } from 'node:fs/promises';
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

      const client = await this.clientFactory.create(config);
      try {
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
      } finally {
        await client.close();
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
