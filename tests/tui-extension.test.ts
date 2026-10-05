import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadLatestBoardRuntimeInput, registerBoardRuntimeWidget } from '../src/tui/extension.js';
import { appendJsonlRecord, createRun } from '../src/run.js';

describe('Pi TUI runtime adapter', () => {
  it('loads widget state from the latest persisted run, accepted conversation, and tool log', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-tui-extension-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'runtime-widget',
        briefContent: '# Brief\n\n## Situation\nLoad persisted widget state.',
        boardMembers: ['Revenue', 'Contrarian'],
        constraints: { min_time_minutes: 2, max_time_minutes: 10, min_budget: 3, max_budget: 12 },
      });
      await appendJsonlRecord(join(run.sessionPath, 'conversation.jsonl'), {
        from: 'Revenue', to: 'all', message: 'Accepted Revenue position.',
      });
      await appendJsonlRecord(join(run.sessionPath, 'tool-use.jsonl'), {
        agent: 'Revenue', timestamp: new Date().toISOString(), tool_name: 'read',
      });
      const sessionPath = join(run.sessionPath, 'session.json');
      const checkpoint = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
      checkpoint.lifecycle_state = 'FINAL_CLOSING';
      checkpoint.total_cost = 4.5;
      checkpoint.telemetry = {
        Revenue: { usage: { costDelta: 1.25, remainingContextTokens: 2048 } },
      };
      await writeFile(sessionPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');

      const input = await loadLatestBoardRuntimeInput(projectRoot, new Date(checkpoint.created_at).getTime() + 90_000);

      expect(input).toMatchObject({
        lifecycleState: 'FINAL_CLOSING',
        elapsedMinutes: 1.5,
        totalCost: 4.5,
        constraints: { minTimeMinutes: 2, maxTimeMinutes: 10, minBudget: 3, maxBudget: 12 },
      });
      expect(input?.members[0]).toMatchObject({
        name: 'Revenue',
        acceptedResponseCount: 1,
        latestAcceptedResponse: 'Accepted Revenue position.',
        activities: [{ kind: 'tool', label: 'read' }],
        telemetry: { costDelta: 1.25, remainingContextTokens: 2048 },
      });
      expect(input?.members[1]?.telemetry).toEqual({ costDelta: null, remainingContextTokens: null });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('returns no runtime model when the project has no persisted run', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-tui-empty-'));
    try {
      await expect(loadLatestBoardRuntimeInput(projectRoot)).resolves.toBeNull();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('polls persisted state while mounted, clears without a run, and stops polling on shutdown', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-tui-poll-'));
    const events = new Map<string, Array<(event: any, context: any) => void>>();
    const widgets = new Map<string, string[] | undefined>();
    let intervalCallback: (() => unknown) | undefined;
    let intervalCleared = false;
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    const pi: any = {
      on(event: string, handler: (event: unknown, context: unknown) => void) {
        events.set(event, [...(events.get(event) ?? []), handler]);
        return () => {};
      },
    };
    const context: any = {
      mode: 'tui',
      hasUI: true,
      cwd: projectRoot,
      ui: {
        setWidget(key: string, content: string[] | undefined) { widgets.set(key, content); },
        onTerminalInput() { return () => {}; },
      },
    };

    try {
      globalThis.setInterval = ((callback: () => unknown) => {
        intervalCallback = callback;
        return 999 as any;
      }) as typeof setInterval;
      globalThis.clearInterval = ((_timer: ReturnType<typeof setInterval>) => {
        intervalCleared = true;
      }) as typeof clearInterval;

      registerBoardRuntimeWidget(pi);
      for (const handler of events.get('session_start') ?? []) {
        await handler({}, context);
      }
      expect(widgets.get('ceo-board-runtime')).toBeUndefined();

      const run = await createRun(projectRoot, {
        briefName: 'polling-run',
        briefContent: '# Brief\n\n## Situation\nPoll the persisted run state.',
        boardMembers: ['Revenue'],
      });
      await intervalCallback?.();
      expect(widgets.get('ceo-board-runtime')?.join('\n')).toContain('Revenue');

      await rm(run.sessionPath, { recursive: true, force: true });
      await intervalCallback?.();
      expect(widgets.get('ceo-board-runtime')).toBeUndefined();

      for (const handler of events.get('session_shutdown') ?? []) {
        await handler({}, context);
      }
      expect(intervalCleared).toBe(true);
    } finally {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
