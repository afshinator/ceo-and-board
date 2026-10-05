import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BoardOrchestrator } from '../src/orchestrator.js';
import { ScriptedPiAgentClient } from '../src/pi.js';
import { createRun } from '../src/run.js';
import { listPersistedRuns, readPersistedMemo, renderBoardStatus, renderPersistedRunList, summarizeBoardStatus, summarizePersistedRunStatus } from '../src/status.js';

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

  it('summarizes a persisted run directory from the checkpoint itself', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-persisted-status-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'persisted-status',
        briefContent: '# Brief\n\n## Situation\nCheck current status',
        boardMembers: ['Eng', 'Ops'],
      });

      const sessionPath = join(run.sessionPath, 'session.json');
      const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
      sessionJson.lifecycle_state = 'CEO_FRAMING';
      sessionJson.status = 'RUNNING';
      sessionJson.board = {
        Eng: {
          status: 'COMPLETED',
          attempts: 1,
          last_output: 'Ship the minimal route.',
          last_error: null,
          last_updated: new Date().toISOString(),
        },
        Ops: {
          status: 'FAILED',
          attempts: 2,
          last_output: null,
          last_error: 'Timed out.',
          last_updated: new Date().toISOString(),
        },
      };
      await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');

      const persistedStatus = await summarizePersistedRunStatus(projectRoot, run.sessionName);
      expect(persistedStatus.lifecycle).toBe('CEO_FRAMING');
      expect(persistedStatus.completedMembers).toBe(1);
      expect(persistedStatus.failedMembers).toBe(1);
      expect(renderBoardStatus(persistedStatus)).toContain('CEO_FRAMING');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('lists persisted board runs in reverse chronological order', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-list-status-'));

    try {
      const first = await createRun(projectRoot, {
        briefName: 'first-run',
        briefContent: '# Brief\n\n## Situation\nOne',
        boardMembers: ['Revenue'],
      });

      const second = await createRun(projectRoot, {
        briefName: 'second-run',
        briefContent: '# Brief\n\n## Situation\nTwo',
        boardMembers: ['Revenue'],
      });

      const runs = await listPersistedRuns(projectRoot);
      expect(runs.map((run) => run.sessionName)).toEqual([second.sessionName, first.sessionName]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('reads the persisted CEO memo for a completed run', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-memo-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'memo-run',
        briefContent: '# Brief\n\n## Situation\nRead memo',
        boardMembers: ['Revenue'],
      });

      const memo = '# Board Memo\n\n## Final Decision\nProceed with the change.\n';
      await writeFile(run.memoPath, memo, 'utf8');

      const persistedMemo = await readPersistedMemo(projectRoot, run.sessionName);
      expect(persistedMemo).toContain('## Final Decision');
      expect(persistedMemo).toContain('Proceed with the change.');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('offers richer persisted-run metadata for selection', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-run-metadata-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'metadata-run',
        briefContent: '# Brief\n\n## Situation\nCheck metadata',
        boardMembers: ['Revenue', 'Ops'],
      });

      const sessionPath = join(run.sessionPath, 'session.json');
      const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
      sessionJson.lifecycle_state = 'COMPLETED';
      sessionJson.board = {
        Revenue: { status: 'COMPLETED', attempts: 1, last_output: 'Proceed.', last_error: null, last_updated: new Date().toISOString() },
        Ops: { status: 'FAILED', attempts: 2, last_output: null, last_error: 'Time limit reached', last_updated: new Date().toISOString() },
      };
      await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');

      const runs = await listPersistedRuns(projectRoot);
      expect(runs[0]).toMatchObject({
        sessionName: run.sessionName,
        lifecycle: 'COMPLETED',
        memberCount: 2,
        completedMembers: 1,
        failedMembers: 1,
      });
      expect(renderPersistedRunList(runs)).toContain(run.sessionName);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('includes a memo preview in the persisted run summary', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-memo-preview-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'memo-preview',
        briefContent: '# Brief\n\n## Situation\nCheck preview',
        boardMembers: ['Revenue'],
      });

      const memo = '# Board Memo\n\n## Final Decision\nProceed with the strategic pivot while preserving operational safety.\n';
      await writeFile(run.memoPath, memo, 'utf8');

      const summary = await summarizePersistedRunStatus(projectRoot, run.sessionName);
      expect(summary.memoPreview).toContain('Proceed with the strategic pivot');
      expect(renderBoardStatus(summary)).toContain('Proceed with the strategic pivot');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
