import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { listSharedArtifacts, prepareMemberWorkspace, promoteMemberWorkspaceChanges, snapshotMemberWorkspace } from '../src/artifacts/visibility.js';

describe('round artifact visibility', () => {
  it('promotes successful changes only after the barrier and seeds them into later workspaces', async () => {
    const runPath = await mkdtemp(join(tmpdir(), 'ceo-board-artifact-visibility-'));

    try {
      const sessionPath = join(runPath, 'pi-sessions', 'revenue');
      const revenueWorkspace = await prepareMemberWorkspace(runPath, sessionPath);
      const beforeRound = await snapshotMemberWorkspace(revenueWorkspace);
      const contrarianWorkspace = await prepareMemberWorkspace(runPath, join(runPath, 'pi-sessions', 'contrarian'));

      await writeFile(join(revenueWorkspace, 'decision.svg'), '<svg>accepted</svg>', 'utf8');
      expect(await listSharedArtifacts(runPath)).toEqual([]);
      await expect(readFile(join(contrarianWorkspace, 'decision.svg'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      const promoted = await promoteMemberWorkspaceChanges(runPath, revenueWorkspace, beforeRound);
      expect(promoted).toEqual(['decision.svg']);
      expect(await readFile(join(runPath, 'decision.svg'), 'utf8')).toBe('<svg>accepted</svg>');

      const nextRoundWorkspace = await prepareMemberWorkspace(runPath, join(runPath, 'pi-sessions', 'contrarian'));
      expect(await readFile(join(nextRoundWorkspace, 'decision.svg'), 'utf8')).toBe('<svg>accepted</svg>');
    } finally {
      await rm(runPath, { recursive: true, force: true });
    }
  });

  it('does not overwrite shared name collisions when promoting accepted changes', async () => {
    const runPath = await mkdtemp(join(tmpdir(), 'ceo-board-artifact-collision-'));

    try {
      await writeFile(join(runPath, 'existing.svg'), '<svg>first</svg>', 'utf8');
      const workspace = await prepareMemberWorkspace(runPath, join(runPath, 'pi-sessions', 'member'));
      const beforeAttempt = await snapshotMemberWorkspace(workspace);
      await writeFile(join(workspace, 'existing.svg'), '<svg>replacement</svg>', 'utf8');
      await mkdir(join(workspace, 'nested'), { recursive: true });
      await writeFile(join(workspace, 'nested', 'failed.svg'), '<svg>failed</svg>', 'utf8');

      expect(await promoteMemberWorkspaceChanges(runPath, workspace, beforeAttempt)).toEqual(['nested/failed.svg']);
      expect(await readFile(join(runPath, 'existing.svg'), 'utf8')).toBe('<svg>first</svg>');
      expect(await readFile(join(runPath, 'nested', 'failed.svg'), 'utf8')).toBe('<svg>failed</svg>');
    } finally {
      await rm(runPath, { recursive: true, force: true });
    }
  });

  it('keeps harness-owned run records out of member workspaces and shared artifacts', async () => {
    const runPath = await mkdtemp(join(tmpdir(), 'ceo-board-artifact-exclusions-'));

    try {
      await writeFile(join(runPath, 'conversation.jsonl'), '{"from":"CEO"}\n', 'utf8');
      await writeFile(join(runPath, 'tool-use.jsonl'), '{"agent":"CEO"}\n', 'utf8');
      await writeFile(join(runPath, 'session.json'), '{}\n', 'utf8');
      await mkdir(join(runPath, 'snapshot'), { recursive: true });
      await writeFile(join(runPath, 'snapshot', 'brief.md'), '# Brief', 'utf8');
      await mkdir(join(runPath, 'pi-sessions'), { recursive: true });
      await writeFile(join(runPath, 'pi-sessions', 'private.jsonl'), '{}\n', 'utf8');

      const workspace = await prepareMemberWorkspace(runPath, join(runPath, 'pi-sessions', 'member'));
      expect(await listSharedArtifacts(runPath)).toEqual([]);
      await expect(readFile(join(workspace, 'conversation.jsonl'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(join(workspace, 'snapshot', 'brief.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(runPath, { recursive: true, force: true });
    }
  });
});
