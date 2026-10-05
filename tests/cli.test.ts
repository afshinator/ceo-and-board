import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

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

  it('exports a persisted run snapshot from the CLI', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-cli-export-'));

    try {
      const created = await runBoardFromBrief(projectRoot, {
        briefName: 'export-decision',
        briefContent: '# Brief\n\n## Situation\nThe team needs a decision.\n\n## Recommendation\nWe should proceed with the export plan.',
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

      const destination = join(projectRoot, 'exports', 'cli-export');
      const result = await import('../src/cli.js').then(({ main }) => main([
        '--project-root', projectRoot,
        '--session-name', created.run.sessionName,
        '--export',
        '--export-dir', destination,
      ]));

      expect(result).toMatchObject({ lifecycle: 'SNAPSHOT' });
      expect(await readFile(join(destination, 'session.json'), 'utf8')).toContain('export-decision');
      expect(await readFile(join(destination, 'memo.md'), 'utf8')).toContain('The board should proceed with the offer.');
    } finally {
      await import('node:fs/promises').then(({ rm }) => rm(projectRoot, { recursive: true, force: true }));
    }
  });

  it('supports JSON output for persisted run status and list commands', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-cli-json-'));

    try {
      const created = await runBoardFromBrief(projectRoot, {
        briefName: 'json-status-decision',
        briefContent: '# Brief\n\n## Situation\nWe need a decision.\n\n## Recommendation\nProceed with the JSON route.',
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

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const statusResult = await import('../src/cli.js').then(({ main }) => main([
        '--project-root', projectRoot,
        '--session-name', created.run.sessionName,
        '--status',
        '--json',
      ]));

      const listResult = await import('../src/cli.js').then(({ main }) => main([
        '--project-root', projectRoot,
        '--list',
        '--json',
      ]));

      expect(statusResult).toMatchObject({ lifecycle: expect.any(String) });
      expect(Array.isArray(listResult)).toBe(true);
      expect((listResult as Array<{ sessionName: string }>)[0]?.sessionName).toBe(created.run.sessionName);
      expect(logSpy.mock.calls.some(([payload]) => typeof payload === 'string' && payload.startsWith('{'))).toBe(true);
      logSpy.mockRestore();
    } finally {
      await import('node:fs/promises').then(({ rm }) => rm(projectRoot, { recursive: true, force: true }));
    }
  });
});
