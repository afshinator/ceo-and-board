import { randomUUID } from 'node:crypto';
import { appendFile, copyFile, readFile, mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { DEFAULT_RUNTIME_DIR, findConfigFile, loadConfig, resolveAgentPath, resolveRunPaths } from './config.js';
import { loadAgentDefinition } from './agents.js';

export interface LockOwnership {
  owner: string;
  pid?: number;
}

export interface ProjectLock {
  associateRun(run: RunSession): Promise<void>;
  release(): Promise<void>;
}

export interface CreateRunOptions {
  briefName: string;
  briefContent: string;
  boardMembers?: string[];
  boardMemberPaths?: Record<string, string>;
  constraints?: {
    min_time_minutes: number;
    max_time_minutes: number;
    min_budget: number;
    max_budget: number;
  };
  paths?: {
    briefs: string;
    deliberations: string;
    memos: string;
    agents: string;
  };
}

export type ForcedCloseReason = 'max_time' | 'max_budget';

export type RunLifecycleState =
  | 'INITIALIZING'
  | 'CEO_FRAMING'
  | 'DELIBERATING'
  | 'FINAL_CLOSING'
  | 'SYNTHESIS'
  | 'CEO_SYNTHESIS'
  | 'COMPLETED'
  | 'FAILED';

export function normalizeLifecycleState(value: string | null | undefined): RunLifecycleState {
  switch (value) {
    case 'CEO_SYNTHESIS':
      return 'SYNTHESIS';
    case 'CEO_FRAMING':
    case 'INITIALIZING':
    case 'DELIBERATING':
    case 'FINAL_CLOSING':
    case 'SYNTHESIS':
    case 'COMPLETED':
    case 'FAILED':
      return value as RunLifecycleState;
    default:
      return 'INITIALIZING';
  }
}

export interface RunSession {
  sessionId: string;
  sessionName: string;
  sessionPath: string;
  memoPath: string;
  lockPath: string;
  board: Record<string, Record<string, string>>;
  boardAgentPaths: Record<string, string>;
  boardModels: Record<string, string>;
  ceoModel?: string;
  ceoAgentPath?: string;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'run';
}

async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;

  await writeFile(tempPath, payload, 'utf8');
  await rename(tempPath, filePath);
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error: any) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function ensureRuntimeDirectories(projectRoot: string): Promise<void> {
  await mkdir(join(projectRoot, DEFAULT_RUNTIME_DIR, 'deliberations'), { recursive: true });
  await mkdir(join(projectRoot, DEFAULT_RUNTIME_DIR, 'memos'), { recursive: true });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    return error?.code !== 'ESRCH';
  }
}

async function discardIncompleteJsonlTail(filePath: string): Promise<void> {
  let contents: string;
  try {
    contents = await readFile(filePath, 'utf8');
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  if (contents.endsWith('\n')) {
    return;
  }

  const lastCompleteLineEnd = contents.lastIndexOf('\n') + 1;
  await writeFile(filePath, contents.slice(0, lastCompleteLineEnd), 'utf8');
}

async function recoverInterruptedRun(projectRoot: string, sessionName: string | undefined): Promise<void> {
  if (!sessionName || basename(sessionName) !== sessionName) {
    return;
  }

  const { deliberationsDir } = await resolveRunPaths(projectRoot);
  const sessionPath = join(deliberationsDir, sessionName);
  const sessionFile = join(sessionPath, 'session.json');
  const sessionJson = await readJsonIfExists<Record<string, any>>(sessionFile);
  if (!sessionJson || ['COMPLETED', 'FAILED'].includes(sessionJson.lifecycle_state)) {
    return;
  }

  await discardIncompleteJsonlTail(join(sessionPath, 'conversation.jsonl'));
  await discardIncompleteJsonlTail(join(sessionPath, 'tool-use.jsonl'));
  sessionJson.status = 'FAILED';
  sessionJson.lifecycle_state = 'FAILED';
  sessionJson.round_state = 'FAILED';
  sessionJson.failure_reason = 'interrupted';
  sessionJson.updated_at = new Date().toISOString();
  await writeJsonAtomically(sessionFile, sessionJson);
}

export async function appendJsonlRecord(filePath: string, record: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

export async function createRun(
  projectRoot: string,
  options: CreateRunOptions,
): Promise<RunSession> {
  // The run lifecycle is deterministic: the project only ever creates a new
  // delegated work directory for the current deliberation. That keeps the
  // session state and memo output isolated from other in-flight board sessions.
  await ensureRuntimeDirectories(projectRoot);

  const sessionId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const briefSlug = slugify(options.briefName);
  const sessionName = `${briefSlug}-${sessionId}`;

  const { deliberationsDir, memosDir } = await resolveRunPaths(projectRoot, options.paths);
  const sessionPath = join(deliberationsDir, sessionName);
  const memoDir = join(memosDir, sessionName);
  const memoPath = join(memoDir, 'memo.md');

  await mkdir(join(sessionPath, 'snapshot'), { recursive: true });
  await mkdir(join(sessionPath, 'pi-sessions'), { recursive: true });
  await mkdir(memoDir, { recursive: true });

  const boardMembers = options.boardMembers ?? [];
  const board = Object.fromEntries(
    boardMembers.map((memberName) => [
      memberName,
      {
        name: memberName,
        status: 'READY',
        last_updated: new Date().toISOString(),
      },
    ]),
  );

  const boardModels: Record<string, string> = {};
  if (options.boardMemberPaths) {
    for (const [memberName, agentPath] of Object.entries(options.boardMemberPaths)) {
      const agent = await loadAgentDefinition(agentPath);
      boardModels[memberName] = agent.frontmatter.model;
    }
  }

  const conversationPath = join(sessionPath, 'conversation.jsonl');
  const toolUsePath = join(sessionPath, 'tool-use.jsonl');

  const checkpoint = {
    session_id: sessionId,
    session_name: sessionName,
    project_root: projectRoot,
    session_path: sessionPath,
    memo_path: memoPath,
    brief: options.briefName,
    brief_content: options.briefContent,
    brief_description: options.briefContent.slice(0, 200).replace(/\s+/g, ' ').trim(),
    status: 'READY',
    lifecycle_state: 'INITIALIZING' as RunLifecycleState,
    round: 0,
    round_state: 'IDLE',
    total_cost: 0,
    constraints: options.constraints ?? {
      min_time_minutes: 0,
      max_time_minutes: Number.MAX_SAFE_INTEGER,
      min_budget: 0,
      max_budget: Number.MAX_SAFE_INTEGER,
    },
    forced_close: {
      active: false,
      reason: null,
      voluntary_close_allowed: true,
    },
    board,
    board_agent_paths: options.boardMemberPaths ?? {},
    board_models: boardModels,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await writeJsonAtomically(join(sessionPath, 'session.json'), checkpoint);
  await writeFile(toolUsePath, '', 'utf8');
  await appendJsonlRecord(conversationPath, {
    type: 'meeting_start',
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    brief: options.briefName,
  });

  return {
    sessionId,
    sessionName,
    sessionPath,
    memoPath,
    lockPath: join(projectRoot, DEFAULT_RUNTIME_DIR, '.active-run.lock'),
    board,
    boardAgentPaths: options.boardMemberPaths ?? {},
    boardModels,
  };
}

export async function captureRunSnapshot(
  run: RunSession,
  options: { briefContent?: string; promptsByMember?: Record<string, string>; ceoPrompt?: string } = {},
): Promise<string> {
  const snapshotDir = join(run.sessionPath, 'snapshot');
  await mkdir(snapshotDir, { recursive: true });
  const promptDir = join(snapshotDir, 'prompts');
  const agentDir = join(snapshotDir, 'agents');
  await mkdir(promptDir, { recursive: true });
  await mkdir(agentDir, { recursive: true });

  const sessionJson = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8')) as Record<string, any>;
  const briefContent = options.briefContent ?? (typeof sessionJson.brief_content === 'string' ? sessionJson.brief_content : '');

  if (briefContent) {
    await writeFile(join(snapshotDir, 'brief.md'), briefContent, 'utf8');
  }

  const projectRoot = typeof sessionJson.project_root === 'string'
    ? sessionJson.project_root
    : join(run.sessionPath, '..', '..', '..', '..');
  const configPath = await findConfigFile(projectRoot);
  if (configPath) {
    try {
      await copyFile(configPath, join(snapshotDir, 'ceo-and-board-configuration.yaml'));
      const config = await loadConfig(configPath);

      for (const boardMember of config.board) {
        const memberName = boardMember.name;
        const sourcePath = resolveAgentPath(boardMember.path, config, projectRoot);
        const targetPath = join(agentDir, `${slugify(memberName)}.md`);
        try {
          await copyFile(sourcePath, targetPath);
        } catch {
          // Ignore missing board agent source files, but preserve the config snapshot.
        }
      }
    } catch {
      // A config file is optional in the snapshot; some runs may be created without one.
    }
  }

  const ceoCandidates = [
    join(projectRoot, 'expertise', 'ceo.md'),
    join(projectRoot, 'sample implementation', 'expertise', 'ceo.md'),
    join(projectRoot, '.pi', 'ceo-agents', 'expertise', 'ceo.md'),
  ];

  for (const ceoPath of ceoCandidates) {
    try {
      await copyFile(ceoPath, join(snapshotDir, 'ceo.md'));
      break;
    } catch {
      // Keep looking for any CEO persona definition.
    }
  }

  for (const [memberName, promptText] of Object.entries(options.promptsByMember ?? {})) {
    const slug = slugify(memberName);
    await writeFile(join(promptDir, `${slug}.txt`), promptText, 'utf8');
  }

  if (options.ceoPrompt) {
    await writeFile(join(snapshotDir, 'ceo-prompt.txt'), options.ceoPrompt, 'utf8');
  }

  return snapshotDir;
}

export interface ConstraintEvaluation {
  forcedClose: boolean;
  reason?: ForcedCloseReason;
  voluntaryCloseAllowed: boolean;
}

export interface ConstraintEvaluationInput {
  elapsedMinutes: number;
  totalBudget: number;
  minTimeMinutes: number;
  maxTimeMinutes: number;
  maxBudget: number;
}

export function evaluateConstraintState(
  input: ConstraintEvaluationInput,
): ConstraintEvaluation {
  const elapsedMinutes = Number(input.elapsedMinutes ?? 0);
  const totalBudget = Number(input.totalBudget ?? 0);
  const minTimeMinutes = Number(input.minTimeMinutes ?? 0);
  const maxTimeMinutes = Number(input.maxTimeMinutes ?? Number.MAX_SAFE_INTEGER);
  const maxBudget = Number(input.maxBudget ?? Number.MAX_SAFE_INTEGER);

  if (elapsedMinutes >= maxTimeMinutes) {
    return {
      forcedClose: true,
      reason: 'max_time',
      voluntaryCloseAllowed: false,
    };
  }

  if (totalBudget >= maxBudget) {
    return {
      forcedClose: true,
      reason: 'max_budget',
      voluntaryCloseAllowed: false,
    };
  }

  return {
    forcedClose: false,
    reason: undefined,
    voluntaryCloseAllowed: elapsedMinutes >= minTimeMinutes,
  };
}

export interface InactivityWatchdogOptions {
  timeoutMs?: number;
  onExpire?: () => void;
}

export class InactivityWatchdog {
  private readonly timeoutMs: number;
  private readonly onExpire?: () => void;
  private lastActivityAt: number;
  private expired = false;
  private timer?: NodeJS.Timeout;

  constructor(options: InactivityWatchdogOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 90_000;
    this.onExpire = options.onExpire;
    this.lastActivityAt = Date.now();
  }

  start(): void {
    this.stop();
    this.expired = false;
    this.lastActivityAt = Date.now();
    this.scheduleExpiration();
  }

  markActivity(): void {
    if (this.expired || !this.timer) {
      return;
    }

    this.lastActivityAt = Date.now();
    this.scheduleExpiration();
  }

  isExpired(): boolean {
    return this.expired || Date.now() - this.lastActivityAt >= this.timeoutMs;
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private scheduleExpiration(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.expired = true;
      this.onExpire?.();
    }, this.timeoutMs);
  }
}

export async function markCeoFraming(run: RunSession): Promise<void> {
  const sessionPath = join(run.sessionPath, 'session.json');
  const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;

  sessionJson.lifecycle_state = 'CEO_FRAMING';
  sessionJson.updated_at = new Date().toISOString();

  await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');
}

export async function markForcedClose(
  run: RunSession,
  reason: ForcedCloseReason,
): Promise<void> {
  const sessionPath = join(run.sessionPath, 'session.json');
  const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;

  sessionJson.lifecycle_state = 'FINAL_CLOSING';
  sessionJson.round_state = 'FORCED_CLOSE_PENDING';
  sessionJson.final_close_reason = reason;
  sessionJson.forced_close = {
    active: true,
    reason,
    voluntary_close_allowed: false,
  };
  sessionJson.updated_at = new Date().toISOString();

  await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');
}

export async function finalizeForcedClose(
  run: RunSession,
  reason: ForcedCloseReason,
): Promise<void> {
  const sessionPath = join(run.sessionPath, 'session.json');
  const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;

  sessionJson.status = 'READY';
  sessionJson.lifecycle_state = 'FINAL_CLOSING';
  sessionJson.round_state = 'FINAL_CLOSING';
  sessionJson.final_close_reason = reason;
  sessionJson.forced_close = {
    active: true,
    reason,
    voluntary_close_allowed: false,
  };
  sessionJson.updated_at = new Date().toISOString();

  await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');
}

export async function acquireProjectLock(
  projectRoot: string,
  ownership: LockOwnership,
): Promise<ProjectLock> {
  const lockPath = join(projectRoot, DEFAULT_RUNTIME_DIR, '.active-run.lock');
  await mkdir(dirname(lockPath), { recursive: true });

  while (true) {
    try {
      const handle = await open(lockPath, 'wx');
      const payload = {
        owner: ownership.owner,
        pid: ownership.pid ?? process.pid,
        acquired_at: new Date().toISOString(),
      };

      await handle.writeFile(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      await handle.close();

      return {
        associateRun: async (run) => {
          const currentLock = await readJsonIfExists<Record<string, unknown>>(lockPath);
          if (!currentLock) {
            throw new Error(`Project lock disappeared before run association at ${lockPath}.`);
          }
          await writeJsonAtomically(lockPath, { ...currentLock, session_name: run.sessionName });
        },
        release: async () => {
          await rm(lockPath, { force: true });
        },
      };
    } catch (error: any) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') {
        throw error;
      }

      const lockContents = await readJsonIfExists<{ pid?: number; session_name?: string }>(lockPath);
      if (!lockContents || typeof lockContents.pid !== 'number' || !Number.isInteger(lockContents.pid) || lockContents.pid <= 0) {
        throw new Error(`Project lock is active at ${lockPath}, but it is unreadable.`);
      }

      if (!isProcessAlive(lockContents.pid)) {
        await recoverInterruptedRun(projectRoot, lockContents.session_name);
        await rm(lockPath, { force: true });
        continue;
      }

      throw new Error(
        `Project lock already held at ${lockPath} by ${ownership.owner}. A second active run is not allowed.`,
      );
    }
  }
}
