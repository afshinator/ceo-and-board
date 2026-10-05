import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { BoardOrchestrator, BoardRoundRequest, BoardRoundResult } from './orchestrator.js';
import type { RunSession } from './run.js';

export interface BoardLifecycleOptions {
  roundRequests: BoardRoundRequest[];
  conclusion?: string;
}

export interface BoardLifecycleResult {
  status: 'COMPLETED';
  rounds: number;
  finalStatements: Record<string, string>;
  memo: string;
}

export async function runBoardLifecycle(
  run: RunSession,
  orchestrator: BoardOrchestrator,
  options: BoardLifecycleOptions,
): Promise<BoardLifecycleResult> {
  if (options.roundRequests.length === 0) {
    throw new Error('At least one board round request is required.');
  }

  let lastTurn: BoardRoundResult | undefined;
  let completedRounds = 0;

  try {
    for (const request of options.roundRequests) {
      try {
        lastTurn = await orchestrator.runBoardRound(run, request);
        completedRounds += 1;
      } catch (error) {
        const sessionJson = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8')) as Record<string, any>;
        if (lastTurn && sessionJson.forced_close?.active) {
          break;
        }
        throw error;
      }

      if (lastTurn.constraint.forced_close) {
        break;
      }
    }

    if (!lastTurn) {
      throw new Error('The board lifecycle ended before any round completed.');
    }

    const sessionPath = join(run.sessionPath, 'session.json');
    const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
    const forcedClose = Boolean(sessionJson.forced_close?.active);
    if (!forcedClose && !lastTurn.constraint.voluntary_close_allowed) {
      throw new Error('The CEO must continue deliberation until min_time is reached or a maximum forces closing.');
    }

    const finalStatements = await orchestrator.endDeliberation(run, lastTurn);
    const memo = await orchestrator.writeCEOConclusion(run, lastTurn, options.conclusion);
    return {
      status: 'COMPLETED',
      rounds: completedRounds,
      finalStatements,
      memo,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/min_time/i.test(message)) {
      try {
        const sessionPath = join(run.sessionPath, 'session.json');
        const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
        if (sessionJson.lifecycle_state !== 'COMPLETED' && sessionJson.lifecycle_state !== 'FAILED') {
          sessionJson.status = 'FAILED';
          sessionJson.lifecycle_state = 'FAILED';
          sessionJson.round_state = sessionJson.round_state === 'CEO_SYNTHESIS_FAILED'
            ? 'CEO_SYNTHESIS_FAILED'
            : 'FAILED';
          sessionJson.failure_reason = message;
          sessionJson.updated_at = new Date().toISOString();
          await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');
        }
      } catch {
        // Preserve the original lifecycle error if checkpoint recovery also fails.
      }
    }
    throw error;
  }
}
