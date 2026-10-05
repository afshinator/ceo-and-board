import { readFile } from 'node:fs/promises';
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
