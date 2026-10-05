import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig, resolveRunPaths } from '../src/config.js';
import { acquireProjectLock, captureRunSnapshot, createRun } from '../src/run.js';
import {
  exportPersistedRunSnapshot,
  listPersistedRuns,
  readPersistedMemo,
  summarizePersistedRunStatus,
} from '../src/status.js';
import { loadLatestBoardRuntimeInput } from '../src/tui/extension.js';

function customConfigYaml(): string {
  return [
    'meeting:',
    '  constraints:',
    '    min_time_minutes: 1',
    '    max_time_minutes: 3',
    '    min_budget: 1',
    '    max_budget: 5',
    '  editor: "code"',
    'paths:',
    '  briefs: custom/briefs',
    '  deliberations: custom/deliberations',
    '  memos: custom/memos',
    '  agents: custom/agents',
    'board:',
    '  - name: Revenue',
    '    path: revenue.md',
    '    color: "#ff7edb"',
  ].join('\n');
}

describe('config-driven run paths (implementation-1.5 F9)', () => {
  it('resolves custom paths and persists them as the single source of truth', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-custom-paths-'));
    try {
      await writeFile(join(projectRoot, 'ceo-and-board-configuration.yaml'), customConfigYaml(), 'utf8');

      const resolved = await resolveRunPaths(projectRoot);
      expect(resolved.deliberationsDir).toBe(join(projectRoot, 'custom', 'deliberations'));
      expect(resolved.memosDir).toBe(join(projectRoot, 'custom', 'memos'));

      const run = await createRun(projectRoot, {
        briefName: 'custom-path-run',
        briefContent: '# Brief\n\n## Situation\nCustom path resolution.',
        boardMembers: ['Revenue'],
      });

      const sessionJson = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8'));
      expect(sessionJson.project_root).toBe(projectRoot);
      expect(sessionJson.session_path).toBe(run.sessionPath);
      expect(sessionJson.memo_path).toBe(run.memoPath);
      expect(run.sessionPath).toContain(join('custom', 'deliberations'));
      expect(run.memoPath).toContain(join('custom', 'memos'));
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('lists, summarizes, reads, and exports runs under custom paths', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-custom-read-'));
    try {
      await writeFile(join(projectRoot, 'ceo-and-board-configuration.yaml'), customConfigYaml(), 'utf8');
      const config = await loadConfig(join(projectRoot, 'ceo-and-board-configuration.yaml'));

      const run = await createRun(projectRoot, {
        briefName: 'custom-read-run',
        briefContent: '# Brief\n\n## Situation\nRead back from custom paths.',
        boardMembers: ['Revenue'],
        paths: config.paths,
      });

      const memo = '# Board Memo: CEO Decision\n\n## Final Decision\nProceed with the custom-path plan.\n';
      await writeFile(run.memoPath, memo, 'utf8');

      const runs = await listPersistedRuns(projectRoot);
      expect(runs).toEqual(expect.arrayContaining([
        expect.objectContaining({ sessionName: run.sessionName, sessionPath: run.sessionPath }),
      ]));
      expect((runs.find((candidate) => candidate.sessionName === run.sessionName)?.memoPath ?? '')).toBe(run.memoPath);

      const status = await summarizePersistedRunStatus(projectRoot, run.sessionName);
      expect(status.memoPreview).toContain('custom-path plan');

      expect(await readPersistedMemo(projectRoot, run.sessionName)).toContain('Proceed with the custom-path plan.');

      const tuiInput = await loadLatestBoardRuntimeInput(projectRoot);
      expect(tuiInput?.lifecycleState).toBe('INITIALIZING');

      const destination = join(projectRoot, 'custom-exports', 'out');
      await exportPersistedRunSnapshot(projectRoot, run.sessionName, destination);
      expect(await readFile(join(destination, 'session.json'), 'utf8')).toContain('custom-read-run');
      expect(await readFile(join(destination, 'memo.md'), 'utf8')).toContain('custom-path plan');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('recovers a stale-locked run under custom paths', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-custom-recovery-'));
    try {
      await writeFile(join(projectRoot, 'ceo-and-board-configuration.yaml'), customConfigYaml(), 'utf8');
      const config = await loadConfig(join(projectRoot, 'ceo-and-board-configuration.yaml'));

      const run = await createRun(projectRoot, {
        briefName: 'custom-recovery-run',
        briefContent: '# Brief\n\n## Situation\nStale lock recovery.',
        boardMembers: ['Revenue'],
        paths: config.paths,
      });

      await mkdir(join(projectRoot, '.pi', 'ceo-agents'), { recursive: true });
      await writeFile(join(projectRoot, '.pi', 'ceo-agents', '.active-run.lock'), JSON.stringify({
        owner: 'dead-owner',
        pid: 99999999,
        session_name: run.sessionName,
      }, null, 2), 'utf8');

      const lock = await acquireProjectLock(projectRoot, { owner: 'test-owner' });
      await lock.release();

      const sessionJson = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8'));
      expect(sessionJson.lifecycle_state).toBe('FAILED');
      expect(sessionJson.failure_reason).toBe('interrupted');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('captures a run snapshot using the persisted project root', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-custom-snapshot-'));
    try {
      await mkdir(join(projectRoot, 'custom', 'agents'), { recursive: true });
      await writeFile(join(projectRoot, 'ceo-and-board-configuration.yaml'), customConfigYaml(), 'utf8');
      await writeFile(join(projectRoot, 'custom', 'agents', 'revenue.md'), '---\nname: Revenue\nmodel: test/model\n---\nYou are Revenue.\n', 'utf8');
      const config = await loadConfig(join(projectRoot, 'ceo-and-board-configuration.yaml'));

      const run = await createRun(projectRoot, {
        briefName: 'custom-snapshot-run',
        briefContent: '# Brief\n\n## Situation\nSnapshot under custom paths.',
        boardMembers: ['Revenue'],
        paths: config.paths,
        boardMemberPaths: { Revenue: join(projectRoot, 'custom', 'agents', 'revenue.md') },
      });

      const snapshotDir = await captureRunSnapshot(run, { briefContent: 'snapshot brief' });
      expect(await readFile(join(snapshotDir, 'brief.md'), 'utf8')).toBe('snapshot brief');
      expect(await readFile(join(snapshotDir, 'ceo-and-board-configuration.yaml'), 'utf8')).toContain('name: Revenue');
      expect(await readFile(join(snapshotDir, 'agents', 'revenue.md'), 'utf8')).toContain('You are Revenue.');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
