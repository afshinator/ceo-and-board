import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BoardOrchestrator } from '../src/orchestrator.js';
import { ScriptedPiAgentClient } from '../src/pi.js';
import { createRun } from '../src/run.js';
import { cleanupStalePersistedRuns, exportPersistedRunSnapshot, listPersistedRuns, readPersistedMemo, renderBoardStatus, renderPersistedRunList, summarizeBoardStatus, summarizePersistedRunStatus } from '../src/status.js';

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
      expect(renderPersistedRunList([])).toBe('- No persisted board runs found.');
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

  it('removes stale persisted runs older than a retention threshold', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-cleanup-'));

    try {
      const staleRun = await createRun(projectRoot, {
        briefName: 'stale-run',
        briefContent: '# Brief\n\n## Situation\nOld',
        boardMembers: ['Revenue'],
      });

      const freshRun = await createRun(projectRoot, {
        briefName: 'fresh-run',
        briefContent: '# Brief\n\n## Situation\nNew',
        boardMembers: ['Ops'],
      });

      const staleSessionPath = join(projectRoot, '.pi', 'ceo-agents', 'deliberations', staleRun.sessionName, 'session.json');
      const staleSessionJson = JSON.parse(await readFile(staleSessionPath, 'utf8')) as Record<string, any>;
      staleSessionJson.created_at = new Date(Date.now() - 1000 * 60 * 60 * 24 * 40).toISOString();
      await writeFile(staleSessionPath, `${JSON.stringify(staleSessionJson, null, 2)}\n`, 'utf8');

      const removed = await cleanupStalePersistedRuns(projectRoot, { maxAgeDays: 30 });
      expect(removed).toContain(staleRun.sessionName);
      expect(await listPersistedRuns(projectRoot)).toEqual(expect.arrayContaining([
        expect.objectContaining({ sessionName: freshRun.sessionName }),
      ]));
      expect(await listPersistedRuns(projectRoot)).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ sessionName: staleRun.sessionName }),
      ]));
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('captures the brief, rendered prompts, config, and source agent definitions in the run snapshot', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-snapshot-inputs-'));

    try {
      await mkdir(join(projectRoot, '.pi', 'ceo-agents', 'agents'), { recursive: true });
      await mkdir(join(projectRoot, 'expertise'), { recursive: true });
      await writeFile(join(projectRoot, 'ceo-and-board-configuration.yaml'), `meeting:\n  constraints:\n    min_time_minutes: 1\n    max_time_minutes: 3\n    min_budget: 1\n    max_budget: 5\n  editor: "code"\npaths:\n  briefs: .pi/ceo-agents/briefs/\n  deliberations: .pi/ceo-agents/deliberations/\n  memos: .pi/ceo-agents/memos/\n  agents: .pi/ceo-agents/agents/\nboard:\n  - name: Revenue\n    path: .pi/ceo-agents/agents/revenue.md\n    color: "#ff7edb"\n  - name: Contrarian\n    path: .pi/ceo-agents/agents/contrarian.md\n    color: "#ff9e64"\n`, 'utf8');
      await writeFile(join(projectRoot, '.pi', 'ceo-agents', 'agents', 'revenue.md'), '---\nname: Revenue\n---\nYou are Revenue.\n', 'utf8');
      await writeFile(join(projectRoot, '.pi', 'ceo-agents', 'agents', 'contrarian.md'), '---\nname: Contrarian\n---\nYou are Contrarian.\n', 'utf8');
      await writeFile(join(projectRoot, 'expertise', 'ceo.md'), '---\nname: CEO\n---\nYou are the CEO.\n', 'utf8');

      const run = await createRun(projectRoot, {
        briefName: 'snapshot-run',
        briefContent: '# Brief\n\n## Situation\nExport this run and keep the prompt archive.',
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

      await orchestrator.runBoardTurn(run, {
        Revenue: 'Analyze the acquisition case and capture the exact prompt used.',
        Contrarian: 'We should choose the lower-risk path and record the dissent in the package.',
      });

      const snapshotDir = join(run.sessionPath, 'snapshot');
      expect(await readFile(join(snapshotDir, 'brief.md'), 'utf8')).toContain('Export this run and keep the prompt archive.');
      expect(await readFile(join(snapshotDir, 'ceo-and-board-configuration.yaml'), 'utf8')).toContain('name: Revenue');
      expect(await readFile(join(snapshotDir, 'ceo.md'), 'utf8')).toContain('You are the CEO.');
      expect(await readFile(join(snapshotDir, 'agents', 'revenue.md'), 'utf8')).toContain('You are Revenue.');
      expect(await readFile(join(snapshotDir, 'prompts', 'revenue.txt'), 'utf8')).toContain('Analyze the acquisition case and capture the exact prompt used.');
      expect(await readFile(join(snapshotDir, 'prompts', 'contrarian.txt'), 'utf8')).toContain('lower-risk path');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('exports a persisted run snapshot to a portable archive directory', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-export-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'export-run',
        briefContent: '# Brief\n\n## Situation\nExport this run',
        boardMembers: ['Revenue'],
      });

      const memo = '# Board Memo\n\n## Final Decision\nProceed with the export plan.\n';
      await writeFile(run.memoPath, memo, 'utf8');

      const destination = join(projectRoot, 'exports', 'run-export');
      const snapshotDir = await exportPersistedRunSnapshot(projectRoot, run.sessionName, destination);

      expect(snapshotDir).toBe(destination);
      expect(await readFile(join(snapshotDir, 'session.json'), 'utf8')).toContain('export-run');
      expect(await readFile(join(snapshotDir, 'memo.md'), 'utf8')).toContain('Proceed with the export plan.');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
