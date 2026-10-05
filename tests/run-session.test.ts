import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BoardOrchestrator } from '../src/orchestrator.js';
import { ScriptedPiAgentClient } from '../src/pi.js';
import { acquireProjectLock, createRun, evaluateConstraintState, finalizeForcedClose, InactivityWatchdog, markForcedClose, normalizeLifecycleState, type ProjectLock } from '../src/run.js';

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

  it('creates runs under the configured deliberations and memos paths (implementation-1.4 N5)', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-custom-paths-'));

    try {
      const configPath = join(projectRoot, 'ceo-and-board-configuration.yaml');
      await writeFile(configPath, [
        'meeting:',
        '  constraints:',
        '    min_time_minutes: 0',
        '    max_time_minutes: 60',
        '    min_budget: 1',
        '    max_budget: 25',
        '  editor: code',
        'paths:',
        '  briefs: briefs',
        '  deliberations: runs/deliberations',
        '  memos: runs/memos',
        '  agents: agents',
        'board:',
        '  - name: Revenue',
        '    path: revenue.md',
      ].join('\n'), 'utf8');
      const { loadConfig } = await import('../src/config.js');
      const config = await loadConfig(configPath);

      const run = await createRun(projectRoot, {
        briefName: 'custom-paths',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue'],
        constraints: config.meeting.constraints,
        paths: config.paths,
      } as Parameters<typeof createRun>[1]);

      expect(run.sessionPath).toBe(join(projectRoot, 'runs', 'deliberations', run.sessionName));
      expect(run.memoPath).toBe(join(projectRoot, 'runs', 'memos', run.sessionName, 'memo.md'));
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('creates shared conversation and tool-use logs with the run checkpoint', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-logs-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'log-review',
        briefContent: '# Brief\n\n## Situation\nTest the logs.',
        boardMembers: ['Revenue', 'Contrarian'],
      });

      const conversationPath = join(run.sessionPath, 'conversation.jsonl');
      const toolUsePath = join(run.sessionPath, 'tool-use.jsonl');

      const conversation = await readFile(conversationPath, 'utf8');
      const toolUse = await readFile(toolUsePath, 'utf8');

      expect(conversation).toContain('meeting_start');
      expect(conversation).toContain(run.sessionId);
      expect(toolUse).toBe('');
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
      expect(normalizeLifecycleState('CEO_SYNTHESIS')).toBe('SYNTHESIS');
      expect(normalizeLifecycleState('SYNTHESIS')).toBe('SYNTHESIS');
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

  it('recovers a dead-owner lock, marks its run interrupted, and ignores incomplete JSONL tails', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-lock-recovery-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'interrupted-review',
        briefContent: '# Brief\n\n## Situation\nRecover safely.',
        boardMembers: ['Revenue'],
      });
      const conversationPath = join(run.sessionPath, 'conversation.jsonl');
      const toolUsePath = join(run.sessionPath, 'tool-use.jsonl');
      const initialConversation = await readFile(conversationPath, 'utf8');
      const completeToolRecord = `${JSON.stringify({ agent: 'Revenue', timestamp: '2026-01-01T00:00:00.000Z', tool_name: 'read' })}\n`;
      await writeFile(toolUsePath, completeToolRecord, 'utf8');
      await appendFile(conversationPath, '{"from":"Revenue"', 'utf8');
      await appendFile(toolUsePath, '{"agent":"Revenue"', 'utf8');

      await writeFile(run.lockPath, `${JSON.stringify({
        owner: 'previous-run',
        pid: process.pid,
        acquired_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        session_name: run.sessionName,
      })}\n`, 'utf8');

      await expect(acquireProjectLock(projectRoot, { owner: 'still-live' })).rejects.toThrow(/already held/i);

      await writeFile(run.lockPath, `${JSON.stringify({
        owner: 'previous-run',
        pid: 2_147_483_647,
        acquired_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        session_name: run.sessionName,
      })}\n`, 'utf8');

      const recoveredLock = await acquireProjectLock(projectRoot, { owner: 'recovery-owner' });
      const sessionJson = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8'));

      expect(sessionJson.lifecycle_state).toBe('FAILED');
      expect(sessionJson.status).toBe('FAILED');
      expect(sessionJson.failure_reason).toBe('interrupted');
      expect(await readFile(conversationPath, 'utf8')).toBe(initialConversation);
      expect(await readFile(toolUsePath, 'utf8')).toBe(completeToolRecord);
      await recoveredLock.release();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
