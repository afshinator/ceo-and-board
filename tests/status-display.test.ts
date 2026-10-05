import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BoardOrchestrator } from '../src/orchestrator.js';
import { ScriptedPiAgentClient } from '../src/pi.js';
import { createRun } from '../src/run.js';
import { renderBoardStatus, summarizeBoardStatus } from '../src/status.js';

describe('runtime status display', () => {
  it('summarizes board state and member telemetry for a live run', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-status-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'risk-review',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue', 'Contrarian'],
      });

      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new ScriptedPiAgentClient({
            agentName: config.agentName,
            piSessionId: config.sessionId,
          });
        },
      });

      const turn = await orchestrator.runBoardTurn(run, {
        Revenue: 'Analyze the acquisition case.',
        Contrarian: 'We should take the lower-risk path.',
      });

      const status = await summarizeBoardStatus(run, turn);
      expect(status.lifecycle).toBe('DELIBERATING');
      expect(status.members).toHaveLength(2);
      expect(status.members[0].name).toBe('Revenue');
      expect(status.members[0].status).toBe('COMPLETED');
      expect(status.members[0].latestOutput).toContain('The board should proceed with the offer.');

      const rendered = renderBoardStatus(status);
      expect(rendered).toContain('Revenue');
      expect(rendered).toContain('COMPLETED');
      expect(rendered).toContain('board should proceed');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('reflects the persisted run lifecycle state rather than a constant fallback', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-lifecycle-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'closing-review',
        briefContent: '# Brief\n\n## Situation\nFinal close test',
        boardMembers: ['Revenue'],
      });

      const sessionPath = join(run.sessionPath, 'session.json');
      const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, unknown>;
      sessionJson.lifecycle_state = 'FINAL_CLOSING';
      sessionJson.status = 'RUNNING';
      await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');

      const status = await summarizeBoardStatus(run, {
        runId: run.sessionId,
        outputs: { Revenue: 'Final statement.' },
        memberResults: {
          Revenue: {
            sessionId: 'session-1',
            sessionDir: run.sessionPath,
            prompt: 'Prompt',
            output: 'Final statement.',
            healthy: true,
            status: 'COMPLETED',
            attempts: 1,
            error: null,
          },
        },
      });

      expect(status.lifecycle).toBe('FINAL_CLOSING');
      expect(renderBoardStatus(status)).toContain('FINAL_CLOSING');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
