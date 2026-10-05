import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { BoardTurnResult, BoardTurnMemberResult } from './orchestrator.js';
import { normalizeLifecycleState, type RunSession } from './run.js';

export type BoardMemberStatusView = {
  name: string;
  status: BoardTurnMemberResult['status'];
  latestOutput: string | null;
  attempts: number;
  healthy: boolean;
};

export type BoardStatusSummary = {
  lifecycle: string;
  runId: string;
  runName: string;
  totalMembers: number;
  completedMembers: number;
  failedMembers: number;
  members: BoardMemberStatusView[];
};

function compactText(value: string | null, maxLength = 180): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

async function readPersistedLifecycle(run: RunSession): Promise<string> {
  try {
    const sessionPath = join(run.sessionPath, 'session.json');
    const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, unknown>;
    const lifecycle = typeof sessionJson.lifecycle_state === 'string'
      ? sessionJson.lifecycle_state
      : typeof sessionJson.status === 'string'
        ? sessionJson.status
        : 'DELIBERATING';

    return normalizeLifecycleState(lifecycle);
  } catch {
    return 'DELIBERATING';
  }
}

export async function summarizeBoardStatus(
  run: RunSession,
  turn: BoardTurnResult,
): Promise<BoardStatusSummary> {
  const memberNames = Object.keys(turn.memberResults).length > 0
    ? Object.keys(turn.memberResults)
    : Object.keys(run.board);

  const members: BoardMemberStatusView[] = memberNames.map((memberName) => {
    const memberResult = turn.memberResults[memberName] ?? {
      status: 'COMPLETED',
      output: turn.outputs[memberName] ?? null,
      attempts: 0,
      healthy: true,
    } as BoardTurnMemberResult;

    return {
      name: memberName,
      status: memberResult.status,
      latestOutput: compactText(memberResult.output ?? null),
      attempts: memberResult.attempts ?? 0,
      healthy: memberResult.healthy,
    };
  });

  const completedMembers = members.filter((member) => member.status === 'COMPLETED').length;
  const failedMembers = members.filter((member) => member.status === 'FAILED').length;

  return {
    lifecycle: await readPersistedLifecycle(run),
    runId: turn.runId,
    runName: run.sessionName,
    totalMembers: members.length,
    completedMembers,
    failedMembers,
    members,
  };
}

export type PersistedRunSummary = {
  sessionId: string;
  sessionName: string;
  sessionPath: string;
  lifecycle: string;
  createdAt: string;
};

export async function listPersistedRuns(projectRoot: string): Promise<PersistedRunSummary[]> {
  const deliberationsDir = join(projectRoot, '.pi', 'ceo-agents', 'deliberations');

  try {
    const entries = await readdir(deliberationsDir, { withFileTypes: true });
    const runEntries = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const summaries: PersistedRunSummary[] = [];

    for (const name of runEntries) {
      const sessionPath = join(deliberationsDir, name);
      try {
        const sessionJson = JSON.parse(await readFile(join(sessionPath, 'session.json'), 'utf8')) as Record<string, any>;
        const directoryStat = await stat(sessionPath);

        summaries.push({
          sessionId: sessionJson.session_id ?? name,
          sessionName: sessionJson.session_name ?? name,
          sessionPath,
          lifecycle: normalizeLifecycleState(
            typeof sessionJson.lifecycle_state === 'string'
              ? sessionJson.lifecycle_state
              : typeof sessionJson.status === 'string'
                ? sessionJson.status
                : 'INITIALIZING',
          ),
          createdAt: sessionJson.created_at ?? new Date(directoryStat.mtimeMs).toISOString(),
        });
      } catch {
        // Skip unreadable run directories to keep the listing resilient.
      }
    }

    summaries.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    return summaries;
  } catch {
    return [];
  }
}

export async function summarizePersistedRunStatus(
  projectRoot: string,
  sessionName?: string,
): Promise<BoardStatusSummary> {
  const deliberationsDir = join(projectRoot, '.pi', 'ceo-agents', 'deliberations');
  const resolvedSessionName = sessionName ?? await (async () => {
    const entries = await readdir(deliberationsDir, { withFileTypes: true });
    const directoryNames = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    if (directoryNames.length === 0) {
      throw new Error(`No deliberation sessions found under ${deliberationsDir}.`);
    }

    return directoryNames[directoryNames.length - 1];
  })();

  const sessionDir = join(deliberationsDir, resolvedSessionName);
  const sessionPath = join(sessionDir, 'session.json');
  const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;

  const memberNames = Object.keys(sessionJson.board ?? {});
  const outputs = Object.fromEntries(
    memberNames.map((memberName) => {
      const tracked = sessionJson.board[memberName] ?? {};
      return [memberName, tracked.last_output ?? null];
    }),
  );

  const run: RunSession = {
    sessionId: sessionJson.session_id,
    sessionName: sessionJson.session_name,
    sessionPath: sessionDir,
    memoPath: join(projectRoot, '.pi', 'ceo-agents', 'memos', sessionJson.session_name, 'memo.md'),
    lockPath: join(projectRoot, '.pi', 'ceo-agents', '.active-run.lock'),
    board: sessionJson.board ?? {},
  };

  const memberResults = Object.fromEntries(
    memberNames.map((memberName) => {
      const tracked = sessionJson.board[memberName] ?? {};
      const status: 'COMPLETED' | 'FAILED' = tracked.status === 'FAILED' ? 'FAILED' : 'COMPLETED';

      return [memberName, {
        sessionId: sessionJson.session_id,
        sessionDir,
        prompt: tracked.prompt ?? '',
        output: tracked.last_output ?? null,
        healthy: status !== 'FAILED',
        status,
        attempts: Number(tracked.attempts ?? 0),
        error: tracked.last_error ?? null,
      }];
    }),
  );

  return summarizeBoardStatus(run, {
    runId: sessionJson.session_id,
    outputs,
    memberResults,
  });
}

export function renderBoardStatus(status: BoardStatusSummary): string {
  const parts: string[] = [
    `Board status: ${status.lifecycle}`,
    `Run: ${status.runName} (${status.runId})`,
    `Members: ${status.completedMembers}/${status.totalMembers} completed`,
  ];

  for (const member of status.members) {
    const output = member.latestOutput ? ` — ${member.latestOutput}` : '';
    parts.push(`- ${member.name}: ${member.status}${output}`);
  }

  return parts.join('\n');
}
