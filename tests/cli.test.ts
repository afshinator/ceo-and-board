import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runBoardFromBrief } from '../src/cli.js';
import { ScriptedPiAgentClient } from '../src/pi.js';

describe('board CLI runner', () => {
  it('creates a run, executes the board, and writes the CEO memo from a brief', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-cli-'));

    try {
      const result = await runBoardFromBrief(projectRoot, {
        briefName: 'acquisition-decision',
        briefContent: '# Brief\n\n## Situation\nThe team needs a decision.\n\n## Recommendation\nWe should proceed with the offer.',
        boardMembers: ['Revenue', 'Contrarian'],
        autoRetry: true,
        factory: {
          async create(config) {
            return new ScriptedPiAgentClient({
              agentName: config.agentName,
              piSessionId: config.sessionId,
            });
          },
        },
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.memo).toContain('## Final Decision');
      expect(result.memo).toContain('The board should proceed with the offer.');
      expect(await readFile(result.run.memoPath, 'utf8')).toContain('## Final Decision');
      expect(result.run.sessionId).toBeTruthy();
    } finally {
      await import('node:fs/promises').then(({ rm }) => rm(projectRoot, { recursive: true, force: true }));
    }
  });
});
