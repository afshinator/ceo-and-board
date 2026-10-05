import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

import { listPersistedRuns } from '../status.js';
import type { BoardRuntimeActivity, BoardRuntimeInput } from './state.js';
import { mountBoardRuntimeWidget, type MountedBoardRuntimeWidget, type RuntimeWidgetUI } from './runtime-widget.js';

function parseJsonl(contents: string): Array<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = [];
  for (const line of contents.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    try {
      records.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      // Ignore an incomplete trailing append if the process was interrupted.
    }
  }
  return records;
}

async function readOptional(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function numericValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const amount = Number(value.trim().replace(/^\$/, '').replaceAll(',', ''));
    if (Number.isFinite(amount)) {
      return amount;
    }
  }
  return fallback;
}

function activityKind(toolName: string): BoardRuntimeActivity['kind'] {
  if (toolName === 'write' || toolName === 'edit') {
    return 'file';
  }
  return 'tool';
}

export async function loadLatestBoardRuntimeInput(projectRoot: string, now = Date.now()): Promise<BoardRuntimeInput | null> {
  const latestRun = (await listPersistedRuns(projectRoot))[0];
  if (!latestRun) {
    return null;
  }

  const sessionJson = JSON.parse(await readFile(join(latestRun.sessionPath, 'session.json'), 'utf8')) as Record<string, any>;
  const conversation = parseJsonl(await readOptional(join(latestRun.sessionPath, 'conversation.jsonl')));
  const toolUse = parseJsonl(await readOptional(join(latestRun.sessionPath, 'tool-use.jsonl')));
  const elapsedMinutes = Math.max(0, (now - new Date(sessionJson.created_at).getTime()) / 60_000);
  const constraints = sessionJson.constraints ?? {};
  const maxTimeMinutes = numericValue(constraints.max_time_minutes, 1);
  const maxBudget = numericValue(constraints.max_budget, 1);
  const minTimeMinutes = numericValue(constraints.min_time_minutes, 0);
  const minBudget = numericValue(constraints.min_budget, 0);

  return {
    lifecycleState: typeof sessionJson.lifecycle_state === 'string' ? sessionJson.lifecycle_state : 'INITIALIZING',
    elapsedMinutes,
    totalCost: numericValue(sessionJson.total_cost, 0),
    constraints: { minTimeMinutes, maxTimeMinutes, minBudget, maxBudget },
    members: Object.entries(sessionJson.board ?? {}).map(([name, state]: [string, any]) => {
      const activities = toolUse
        .filter((record) => record.agent === name && typeof record.tool_name === 'string')
        .map((record) => ({
          kind: activityKind(String(record.tool_name)),
          label: `${record.tool_name}`,
          timestamp: typeof record.timestamp === 'string' ? record.timestamp : '',
        } as BoardRuntimeActivity));
      const acceptedMessages = conversation.filter((record) => record.from === name && typeof record.message === 'string');
      const usage = sessionJson.telemetry?.[name]?.usage ?? {};

      return {
        name,
        state: typeof state?.status === 'string' ? state.status : 'READY',
        acceptedResponseCount: acceptedMessages.length,
        latestAcceptedResponse: typeof acceptedMessages.at(-1)?.message === 'string'
          ? String(acceptedMessages.at(-1)?.message)
          : state?.last_output ?? null,
        activities,
        telemetry: {
          costDelta: typeof usage.costDelta === 'number' ? usage.costDelta : null,
          remainingContextTokens: typeof usage.remainingContextTokens === 'number'
            ? usage.remainingContextTokens
            : null,
        },
      };
    }),
  };
}

export function registerBoardRuntimeWidget(pi: ExtensionAPI): void {
  let widget: MountedBoardRuntimeWidget | undefined;
  let activeContext: ExtensionContext | undefined;
  let refreshPending = false;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;

  const dispose = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = undefined;
    }
    widget?.dispose();
    widget = undefined;
    activeContext = undefined;
  };

  const refresh = async () => {
    const context = activeContext;
    if (!context || context.mode !== 'tui' || !context.hasUI || refreshPending) {
      return;
    }
    refreshPending = true;
    try {
      const input = await loadLatestBoardRuntimeInput(context.cwd);
      if (activeContext !== context) {
        return;
      }
      if (!input) {
        widget?.dispose();
        widget = undefined;
        return;
      }
      if (!widget) {
        widget = mountBoardRuntimeWidget(context.ui as RuntimeWidgetUI, input);
      } else {
        widget.update(input);
      }
    } catch {
      // Persisted run inspection must not interrupt the parent Pi session.
    } finally {
      refreshPending = false;
    }
  };

  const poll = () => refresh();

  pi.on('session_start', async (_event, context) => {
    dispose();
    if (context.mode !== 'tui' || !context.hasUI) {
      return;
    }
    activeContext = context;
    await refresh();
    refreshTimer = setInterval(() => poll(), 1_000);
  });

  pi.on('turn_end', () => { void refresh(); });
  pi.on('message_end', () => { void refresh(); });
  pi.on('tool_execution_end', () => { void refresh(); });
  pi.on('session_shutdown', () => { dispose(); });
}
