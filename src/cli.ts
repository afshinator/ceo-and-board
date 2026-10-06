import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { BoardOrchestrator } from './orchestrator.js';
import { runBoardLifecycle } from './controller.js';
import { type PiAgentClientFactory } from './pi.js';
import { acquireProjectLock, createRun, type RunSession } from './run.js';
import { loadConfig, resolveRunPaths } from './config.js';
import { exportPersistedRunSnapshot, listPersistedRuns, readPersistedMemo, renderBoardStatus, renderPersistedRunList, summarizePersistedRunStatus } from './status.js';

export interface RunBoardFromBriefOptions {
  briefName: string;
  briefContent: string;
  boardMembers: string[];
  autoRetry?: boolean;
  cwd?: string;
  factory?: PiAgentClientFactory;
  roundMessages?: string[];
}

export interface BoardRunCommandResult {
  run: RunSession;
  memo: string;
  status: 'COMPLETED';
}

export async function runBoardFromBrief(
  projectRoot: string,
  options: RunBoardFromBriefOptions,
): Promise<BoardRunCommandResult> {
  const resolvedRoot = resolve(projectRoot);
  const boardMembers = options.boardMembers.length > 0 ? options.boardMembers : ['Revenue', 'Contrarian'];

  const lock = await acquireProjectLock(resolvedRoot, { owner: 'ceo-board-cli' });

  try {
    let constraints: Awaited<ReturnType<typeof loadConfig>>['meeting']['constraints'] | undefined;
    const configPath = join(resolvedRoot, 'ceo-and-board-configuration.yaml');
    try {
      await access(configPath);
      constraints = (await loadConfig(configPath)).meeting.constraints;
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }

    const run = await createRun(resolvedRoot, {
      briefName: options.briefName,
      briefContent: options.briefContent,
      boardMembers,
      constraints,
    });
    await lock.associateRun(run);

    const orchestrator = new BoardOrchestrator(options.factory ?? undefined, {
      cwd: options.cwd ?? process.cwd(),
      autoRetry: options.autoRetry ?? true,
    });

    const roundMessages = options.roundMessages?.length
      ? options.roundMessages
      : ['Review the brief and provide an initial recommendation.'];
    const lifecycle = await runBoardLifecycle(run, orchestrator, {
      roundRequests: roundMessages.map((message) => ({ to: 'all', message })),
    });

    return {
      run,
      memo: lifecycle.memo,
      status: 'COMPLETED',
    };
  } finally {
    await lock.release();
  }
}

export interface BoardRunCliOptions {
  projectRoot?: string;
  briefName?: string;
  briefPath?: string;
  boardMembers?: string[];
  roundMessages?: string[];
  autoRetry?: boolean;
  export?: boolean;
  exportDir?: string;
  json?: boolean;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<BoardRunCommandResult | { lifecycle: string; rendered: string; memo?: string; snapshotPath?: string } | Array<{ sessionName: string; lifecycle: string }>> {
  const options: BoardRunCliOptions & { status?: boolean; list?: boolean; memo?: boolean; sessionName?: string } = {
    projectRoot: process.cwd(),
    boardMembers: [],
    autoRetry: true,
    status: false,
    list: false,
    memo: false,
    export: false,
    json: false,
  };

  const { values } = parseArgs({
    args: argv,
    options: {
      'project-root': { type: 'string' },
      'brief-name': { type: 'string' },
      'brief-file': { type: 'string' },
      member: { type: 'string', multiple: true },
      'round-message': { type: 'string', multiple: true },
      'session-name': { type: 'string' },
      status: { type: 'boolean' },
      list: { type: 'boolean' },
      memo: { type: 'boolean' },
      'show-memo': { type: 'boolean' },
      export: { type: 'boolean' },
      'export-dir': { type: 'string' },
      json: { type: 'boolean' },
      'no-auto-retry': { type: 'boolean' },
    },
  });

  options.projectRoot = values['project-root'] ?? options.projectRoot;
  options.briefName = values['brief-name'];
  options.briefPath = values['brief-file'];
  options.boardMembers = values.member ?? [];
  options.roundMessages = values['round-message'];
  options.sessionName = values['session-name'];
  options.status = values.status ?? false;
  options.list = values.list ?? false;
  options.memo = values.memo === true || values['show-memo'] === true;
  options.export = values.export ?? false;
  options.exportDir = values['export-dir'];
  options.json = values.json ?? false;
  options.autoRetry = !(values['no-auto-retry'] ?? false);

  if (options.list) {
    const runs = await listPersistedRuns(options.projectRoot ?? process.cwd());
    const normalizedRuns = runs.map((run) => ({ sessionName: run.sessionName, lifecycle: run.lifecycle }));

    if (options.json) {
      const output = JSON.stringify(normalizedRuns, null, 2);
      console.log(output);
      return normalizedRuns;
    }

    const rendered = renderPersistedRunList(runs);
    console.log('Persisted runs:');
    console.log(rendered);

    return normalizedRuns;
  }

  if (options.memo) {
    const memo = await readPersistedMemo(options.projectRoot ?? process.cwd(), options.sessionName);
    if (options.json) {
      const output = JSON.stringify({ lifecycle: 'MEMO', sessionName: options.sessionName ?? null, memo }, null, 2);
      console.log(output);
      return { lifecycle: 'MEMO', rendered: memo, memo };
    }
    console.log(memo);
    return { lifecycle: 'MEMO', rendered: memo, memo };
  }

  if (options.status) {
    const status = await summarizePersistedRunStatus(options.projectRoot ?? process.cwd(), options.sessionName);
    const rendered = renderBoardStatus(status);
    if (options.json) {
      const output = JSON.stringify({ lifecycle: status.lifecycle, runName: status.runName, runId: status.runId, totalMembers: status.totalMembers, completedMembers: status.completedMembers, failedMembers: status.failedMembers, memoPreview: status.memoPreview, members: status.members }, null, 2);
      console.log(output);
      return { lifecycle: status.lifecycle, rendered };
    }
    console.log(rendered);
    return { lifecycle: status.lifecycle, rendered };
  }

  if (options.export) {
    const projectRoot = options.projectRoot ?? process.cwd();
    const runs = await listPersistedRuns(projectRoot);
    const selectedRun = options.sessionName
      ? runs.find((run) => run.sessionName === options.sessionName) ?? runs[0]
      : runs[0];

    if (!selectedRun) {
      const { deliberationsDir } = await resolveRunPaths(projectRoot);
      throw new Error(`No persisted board runs found under ${deliberationsDir}.`);
    }

    const exportDir = options.exportDir
      ? resolve(projectRoot, options.exportDir)
      : join(projectRoot, 'exports', selectedRun.sessionName);
    const snapshotPath = await exportPersistedRunSnapshot(projectRoot, selectedRun.sessionName, exportDir);

    if (options.json) {
      const output = JSON.stringify({ lifecycle: 'SNAPSHOT', sessionName: selectedRun.sessionName, snapshotPath }, null, 2);
      console.log(output);
      return { lifecycle: 'SNAPSHOT', rendered: snapshotPath, snapshotPath };
    }

    console.log(`Exported board snapshot for ${selectedRun.sessionName} to ${snapshotPath}`);
    return { lifecycle: 'SNAPSHOT', rendered: snapshotPath, snapshotPath };
  }

  if (!options.briefName && options.briefPath) {
    const briefFileBase = options.briefPath.split(/[\\/]/).pop() ?? 'brief';
    options.briefName = briefFileBase.replace(/\.[^.]+$/, '');
  }

  if (!options.briefPath && !options.briefName) {
    throw new Error('A brief name or --brief-file is required to run a board turn.');
  }

  const briefContent = options.briefPath
    ? await readFile(resolve(options.projectRoot ?? process.cwd(), options.briefPath), 'utf8')
    : `# ${options.briefName ?? 'Brief'}\n\n## Situation\nThis run was initiated from the CLI.`;

  const result = await runBoardFromBrief(options.projectRoot ?? process.cwd(), {
    briefName: options.briefName ?? 'Brief',
    briefContent,
    boardMembers: options.boardMembers && options.boardMembers.length > 0 ? options.boardMembers : ['Revenue', 'Contrarian'],
    autoRetry: options.autoRetry,
    roundMessages: options.roundMessages,
  });

  console.log(`Board run ${result.run.sessionId} completed.`);
  console.log('---');
  console.log(result.memo);

  return result;
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
