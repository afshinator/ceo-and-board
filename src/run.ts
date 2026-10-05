import { randomUUID } from 'node:crypto';
import { readFile, mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export interface LockOwnership {
  owner: string;
  pid?: number;
}

export interface ProjectLock {
  release(): Promise<void>;
}

export interface CreateRunOptions {
  briefName: string;
  briefContent: string;
  boardMembers?: string[];
}

export type ForcedCloseReason = 'max_time' | 'max_budget';

export type RunLifecycleState =
  | 'INITIALIZING'
  | 'DELIBERATING'
  | 'CEO_SYNTHESIS'
  | 'COMPLETED'
  | 'FAILED';

export interface RunSession {
  sessionId: string;
  sessionName: string;
  sessionPath: string;
  memoPath: string;
  lockPath: string;
  board: Record<string, Record<string, string>>;
}

const ROOT_RUNTIME_DIR = '.pi/ceo-agents';
const LOCK_STALE_MS = 30 * 60 * 1000;

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
  await mkdir(join(projectRoot, ROOT_RUNTIME_DIR, 'deliberations'), { recursive: true });
  await mkdir(join(projectRoot, ROOT_RUNTIME_DIR, 'memos'), { recursive: true });
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

  const sessionPath = join(projectRoot, ROOT_RUNTIME_DIR, 'deliberations', sessionName);
  const memoDir = join(projectRoot, ROOT_RUNTIME_DIR, 'memos', sessionName);
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

  const checkpoint = {
    session_id: sessionId,
    session_name: sessionName,
    brief: options.briefName,
    brief_description: options.briefContent.slice(0, 200).replace(/\s+/g, ' ').trim(),
    status: 'READY',
    lifecycle_state: 'INITIALIZING' as RunLifecycleState,
    round: 0,
    round_state: 'IDLE',
    forced_close: {
      active: false,
      reason: null,
      voluntary_close_allowed: true,
    },
    board,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await writeJsonAtomically(join(sessionPath, 'session.json'), checkpoint);

  return {
    sessionId,
    sessionName,
    sessionPath,
    memoPath,
    lockPath: join(projectRoot, ROOT_RUNTIME_DIR, '.active-run.lock'),
    board,
  };
}

export interface InactivityWatchdogOptions {
  timeoutMs?: number;
}

export class InactivityWatchdog {
  private readonly timeoutMs: number;
  private lastActivityAt: number;
  private timer?: NodeJS.Timeout;

  constructor(options: InactivityWatchdogOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 90_000;
    this.lastActivityAt = Date.now();
  }

  start(): void {
    this.lastActivityAt = Date.now();
    this.timer = setInterval(() => {
      if (this.isExpired()) {
        this.stop();
      }
    }, Math.min(250, Math.max(50, this.timeoutMs / 2)));
  }

  markActivity(): void {
    this.lastActivityAt = Date.now();
  }

  isExpired(): boolean {
    return Date.now() - this.lastActivityAt >= this.timeoutMs;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

export async function markForcedClose(
  run: RunSession,
  reason: ForcedCloseReason,
): Promise<void> {
  const sessionPath = join(run.sessionPath, 'session.json');
  const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;

  sessionJson.round_state = 'FORCED_CLOSE_PENDING';
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
  const lockPath = join(projectRoot, ROOT_RUNTIME_DIR, '.active-run.lock');
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
        release: async () => {
          await rm(lockPath, { force: true });
        },
      };
    } catch (error: any) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') {
        throw error;
      }

      const lockContents = await readJsonIfExists<{ acquired_at?: string }>(lockPath);
      if (!lockContents?.acquired_at) {
        throw new Error(`Project lock is active at ${lockPath}, but it is unreadable.`);
      }

      const lockTimestamp = new Date(lockContents.acquired_at).getTime();
      const ageMs = Date.now() - lockTimestamp;

      if (ageMs > LOCK_STALE_MS) {
        await rm(lockPath, { force: true });
        continue;
      }

      throw new Error(
        `Project lock already held at ${lockPath} by ${ownership.owner}. A second active run is not allowed.`,
      );
    }
  }
}
