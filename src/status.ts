import { cp, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { BoardTurnResult, BoardTurnMemberResult } from './orchestrator.js';
import { resolveRunPaths } from './config.js';
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
  memoPreview?: string | null;
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

function extractMemoPreview(memo: string | null): string | null {
  if (!memo) {
    return null;
  }

  const normalized = memo.replace(/\r/g, '');
  const lines = normalized.split('\n');
  let inFinalDecision = false;
  const previewLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (line === '## Final Decision') {
        inFinalDecision = true;
        continue;
      }

      if (inFinalDecision) {
        break;
      }
    }

    if (inFinalDecision) {
      const trimmed = line.trim();
      if (trimmed) {
        previewLines.push(trimmed);
      }
    }
  }

  const preview = previewLines.join(' ').replace(/\s+/g, ' ').trim();
  return preview ? compactText(preview, 180) : compactText(normalized, 180);
}

async function readMemoPreview(run: RunSession): Promise<string | null> {
  try {
    const memo = await readFile(run.memoPath, 'utf8');
    return extractMemoPreview(memo);
  } catch {
    return null;
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
    memoPreview: await readMemoPreview(run),
    members,
  };
}

export type PersistedRunSummary = {
  sessionId: string;
  sessionName: string;
  sessionPath: string;
  memoPath: string;
  lifecycle: string;
  createdAt: string;
  memberCount: number;
  completedMembers: number;
  failedMembers: number;
  memoPreview?: string | null;
};

export function renderPersistedRunList(runs: PersistedRunSummary[]): string {
  if (runs.length === 0) {
    return 'No persisted board runs found.';
  }

  return runs.map((run) => {
    const summary = `${run.sessionName} | ${run.lifecycle} | ${run.completedMembers}/${run.memberCount} complete`;
    return run.failedMembers > 0 ? `${summary} | ${run.failedMembers} failed` : summary;
  }).join('\n');
}

export async function listPersistedRuns(projectRoot: string): Promise<PersistedRunSummary[]> {
  const { deliberationsDir, memosDir } = await resolveRunPaths(projectRoot);

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
        const board = sessionJson.board ?? {};
        const memberNames = Object.keys(board);
        const completedMembers = memberNames.filter((memberName) => board[memberName]?.status === 'COMPLETED').length;
        const failedMembers = memberNames.filter((memberName) => board[memberName]?.status === 'FAILED').length;
        const sessionName = sessionJson.session_name ?? name;
        const memoPath = typeof sessionJson.memo_path === 'string'
          ? sessionJson.memo_path
          : join(memosDir, sessionName, 'memo.md');

        let memoPreview: string | null = null;
        try {
          const memo = await readFile(memoPath, 'utf8');
          memoPreview = extractMemoPreview(memo);
        } catch {
          // no memo yet; leave preview as null.
        }

        summaries.push({
          sessionId: sessionJson.session_id ?? name,
          sessionName,
          sessionPath,
          memoPath,
          lifecycle: normalizeLifecycleState(
            typeof sessionJson.lifecycle_state === 'string'
              ? sessionJson.lifecycle_state
              : typeof sessionJson.status === 'string'
                ? sessionJson.status
                : 'INITIALIZING',
          ),
          createdAt: sessionJson.created_at ?? new Date(directoryStat.mtimeMs).toISOString(),
          memberCount: memberNames.length,
          completedMembers,
          failedMembers,
          memoPreview,
        });
      } catch {
        // Skip unreadable run directories to keep the listing resilient.
      }
    }

    summaries.sort((left, right) => {
      const timeDelta = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      if (timeDelta !== 0) {
        return timeDelta;
      }

      return right.sessionName.localeCompare(left.sessionName);
    });
    return summaries;
  } catch {
    return [];
  }
}

export async function readPersistedMemo(projectRoot: string, sessionName?: string): Promise<string> {
  const { deliberationsDir } = await resolveRunPaths(projectRoot);
  const runs = await listPersistedRuns(projectRoot);
  const selectedRun = sessionName
    ? runs.find((run) => run.sessionName === sessionName) ?? runs[0]
    : runs[0];

  if (!selectedRun) {
    throw new Error(`No persisted board runs found under ${deliberationsDir}.`);
  }

  try {
    return await readFile(selectedRun.memoPath, 'utf8');
  } catch {
    throw new Error(`No memo file found for session "${selectedRun.sessionName}" at ${selectedRun.memoPath}.`);
  }
}

export async function cleanupStalePersistedRuns(
  projectRoot: string,
  options: { maxAgeDays?: number } = {},
): Promise<string[]> {
  const runs = await listPersistedRuns(projectRoot);
  const maxAgeDays = options.maxAgeDays ?? 30;
  const cutoffMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const removed: string[] = [];

  for (const run of runs) {
    const ageMs = Date.now() - new Date(run.createdAt).getTime();
    if (ageMs <= cutoffMs) {
      continue;
    }

    await rm(run.sessionPath, { recursive: true, force: true });
    try {
      await rm(dirname(run.memoPath), { recursive: true, force: true });
    } catch {
      // The memo directory may not exist yet; ignore cleanup misses.
    }
    removed.push(run.sessionName);
  }

  return removed;
}

export async function exportPersistedRunSnapshot(
  projectRoot: string,
  sessionName: string,
  destinationDir: string,
): Promise<string> {
  const runs = await listPersistedRuns(projectRoot);
  const run = runs.find((candidate) => candidate.sessionName === sessionName) ?? null;

  if (!run) {
    throw new Error(`No persisted run found for session name "${sessionName}".`);
  }

  await mkdir(destinationDir, { recursive: true });
  const sourceSessionPath = run.sessionPath;
  const sourceSnapshotDir = join(sourceSessionPath, 'snapshot');
  const sourceMemoPath = run.memoPath;
  const sessionJson = JSON.parse(await readFile(join(sourceSessionPath, 'session.json'), 'utf8')) as Record<string, any>;

  await writeFile(join(destinationDir, 'session.json'), `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');

  try {
    await cp(sourceSnapshotDir, join(destinationDir, 'snapshot'), { recursive: true, force: true });
  } catch {
    // the snapshot directory may not exist yet; keep the export usable without it.
  }

  try {
    const memoContent = await readFile(sourceMemoPath, 'utf8');
    await writeFile(join(destinationDir, 'memo.md'), memoContent, 'utf8');
  } catch {
    // no memo file yet; skip it rather than failing the export.
  }

  return destinationDir;
}

export async function summarizePersistedRunStatus(
  projectRoot: string,
  sessionName?: string,
): Promise<BoardStatusSummary> {
  const { deliberationsDir, memosDir } = await resolveRunPaths(projectRoot);
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
    sessionPath: typeof sessionJson.session_path === 'string' ? sessionJson.session_path : sessionDir,
    memoPath: typeof sessionJson.memo_path === 'string'
      ? sessionJson.memo_path
      : join(memosDir, sessionJson.session_name, 'memo.md'),
    lockPath: join(projectRoot, '.pi', 'ceo-agents', '.active-run.lock'),
    board: sessionJson.board ?? {},
    boardAgentPaths: sessionJson.board_agent_paths ?? {},
    boardModels: sessionJson.board_models ?? {},
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

  const status = await summarizeBoardStatus(run, {
    runId: sessionJson.session_id,
    outputs,
    memberResults,
  });

  if (status.memoPreview) {
    return { ...status, memoPreview: status.memoPreview };
  }

  try {
    const memo = await readFile(run.memoPath, 'utf8');
    return { ...status, memoPreview: extractMemoPreview(memo) };
  } catch {
    return status;
  }
}

export function renderBoardStatus(status: BoardStatusSummary): string {
  const parts: string[] = [
    `Board status: ${status.lifecycle}`,
    `Run: ${status.runName} (${status.runId})`,
    `Members: ${status.completedMembers}/${status.totalMembers} completed`,
  ];

  if (status.memoPreview) {
    parts.push(`Memo preview: ${status.memoPreview}`);
  }

  for (const member of status.members) {
    const output = member.latestOutput ? ` — ${member.latestOutput}` : '';
    parts.push(`- ${member.name}: ${member.status}${output}`);
  }

  return parts.join('\n');
}
