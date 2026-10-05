import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BoardOrchestrator } from '../src/orchestrator.js';
import { ScriptedPiAgentClient } from '../src/pi.js';
import { acquireProjectLock, createRun, evaluateConstraintState, finalizeForcedClose, InactivityWatchdog, markForcedClose, type ProjectLock } from '../src/run.js';

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

  it('tracks inactivity and forced-close state in the run checkpoint', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-constraint-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'budget-review',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue'],
      });

      const watchdog = new InactivityWatchdog({ timeoutMs: 5 });
      watchdog.start();
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(watchdog.isExpired()).toBe(true);

      await markForcedClose(run, 'max_time');
      const sessionJson = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8'));
      expect(sessionJson.forced_close.active).toBe(true);
      expect(sessionJson.forced_close.reason).toBe('max_time');
      expect(sessionJson.round_state).toBe('FORCED_CLOSE_PENDING');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('enforces max-time and max-budget hard closures before synthesis finishes', async () => {
    const timeClose = evaluateConstraintState({
      elapsedMinutes: 12,
      totalBudget: 75,
      minTimeMinutes: 2,
      maxTimeMinutes: 10,
      maxBudget: 100,
    });

    expect(timeClose.forcedClose).toBe(true);
    expect(timeClose.reason).toBe('max_time');
    expect(timeClose.voluntaryCloseAllowed).toBe(false);

    const budgetClose = evaluateConstraintState({
      elapsedMinutes: 9,
      totalBudget: 101,
      minTimeMinutes: 2,
      maxTimeMinutes: 10,
      maxBudget: 100,
    });

    expect(budgetClose.forcedClose).toBe(true);
    expect(budgetClose.reason).toBe('max_budget');
    expect(budgetClose.voluntaryCloseAllowed).toBe(false);
  });

  it('transitions a forced-close run into the final-closing lifecycle', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-final-close-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'forced-close-review',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue', 'Contrarian'],
      });

      await markForcedClose(run, 'max_budget');
      await finalizeForcedClose(run, 'max_budget');

      const sessionJson = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8'));
      expect(sessionJson.forced_close.active).toBe(true);
      expect(sessionJson.forced_close.reason).toBe('max_budget');
      expect(sessionJson.lifecycle_state).toBe('FINAL_CLOSING');
      expect(sessionJson.round_state).toBe('FINAL_CLOSING');
      expect(sessionJson.final_close_reason).toBe('max_budget');
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
