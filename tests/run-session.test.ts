import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BoardOrchestrator } from '../src/orchestrator.js';
import { ScriptedPiAgentClient } from '../src/pi.js';
import { acquireProjectLock, createRun, type ProjectLock } from '../src/run.js';

describe('run/session lifecycle', () => {
  it('creates the run directory tree and session checkpoint', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-run-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'acquisition-decision',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue', 'Contrarian'],
      });

      expect(run.sessionName).toContain('acquisition-decision');
      expect(run.sessionPath).toContain('.pi/ceo-agents/deliberations/');
      expect(run.memoPath).toContain('.pi/ceo-agents/memos/');

      const sessionFile = join(run.sessionPath, 'session.json');
      const sessionJson = JSON.parse(await readFile(sessionFile, 'utf8'));
      expect(sessionJson.session_id).toBe(run.sessionId);
      expect(sessionJson.session_name).toBe(run.sessionName);
      expect(sessionJson.board).toHaveProperty('Revenue');
      expect(sessionJson.board).toHaveProperty('Contrarian');
      expect(run.memoPath).toContain(run.sessionName);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('tracks lifecycle state in the checkpoint during deliberation and synthesis', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-state-machine-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'risk-review',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue'],
      });

      const initialSession = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8'));
      expect(initialSession.lifecycle_state).toBe('INITIALIZING');

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
      });

      const midTurnSession = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8'));
      expect(midTurnSession.lifecycle_state).toBe('DELIBERATING');
      expect(turn.outputs.Revenue).toBe('The board should proceed with the offer.');

      await orchestrator.writeCEOConclusion(run, turn, 'The board should proceed with the offer.');

      const finalSession = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8'));
      expect(finalSession.lifecycle_state).toBe('COMPLETED');
      expect(finalSession.ceo_conclusion).toBe('The board should proceed with the offer.');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('acquires a project lock and rejects a second live owner', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-lock-'));

    try {
      const firstLock = await acquireProjectLock(projectRoot, { owner: 'ceo-board-test' });

      await expect(
        acquireProjectLock(projectRoot, { owner: 'ceo-board-test-2' }),
      ).rejects.toThrow(/lock/i);

      await firstLock.release();
      const secondLock = await acquireProjectLock(projectRoot, { owner: 'ceo-board-test-2' });
      await secondLock.release();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
