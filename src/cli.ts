import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { BoardOrchestrator } from './orchestrator.js';
import { type PiAgentClientFactory } from './pi.js';
import { acquireProjectLock, createRun, type RunSession } from './run.js';
import { listPersistedRuns, renderBoardStatus, summarizePersistedRunStatus } from './status.js';

export interface RunBoardFromBriefOptions {
  briefName: string;
  briefContent: string;
  boardMembers: string[];
  autoRetry?: boolean;
  cwd?: string;
  factory?: PiAgentClientFactory;
}

export interface BoardRunCommandResult {
  run: RunSession;
  memo: string;
  status: 'COMPLETED';
}

function buildMemberPrompts(briefName: string, briefContent: string, boardMembers: string[]): Record<string, string> {
  return Object.fromEntries(
    boardMembers.map((memberName) => [
      memberName,
      [
        `You are ${memberName}.`,
        '',
        `Brief: ${briefName}`,
        '',
        'Review the background and provide a concise recommendation.',
        '',
        '---',
        '',
        briefContent,
      ].join('\n'),
    ]),
  );
}

export async function runBoardFromBrief(
  projectRoot: string,
  options: RunBoardFromBriefOptions,
): Promise<BoardRunCommandResult> {
  const resolvedRoot = resolve(projectRoot);
  const boardMembers = options.boardMembers.length > 0 ? options.boardMembers : ['Revenue', 'Contrarian'];

  const lock = await acquireProjectLock(resolvedRoot, { owner: 'ceo-board-cli' });

  try {
    const run = await createRun(resolvedRoot, {
      briefName: options.briefName,
      briefContent: options.briefContent,
      boardMembers,
    });

    const orchestrator = new BoardOrchestrator(options.factory ?? undefined, {
      cwd: options.cwd ?? process.cwd(),
      autoRetry: options.autoRetry ?? true,
    });

    const turn = await orchestrator.runBoardTurn(run, buildMemberPrompts(
      options.briefName,
      options.briefContent,
      boardMembers,
    ));

    const memo = await orchestrator.writeCEOConclusion(run, turn);

    return {
      run,
      memo,
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
  autoRetry?: boolean;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<BoardRunCommandResult | { lifecycle: string; rendered: string } | Array<{ sessionName: string; lifecycle: string }>> {
  const options: BoardRunCliOptions & { status?: boolean; list?: boolean; sessionName?: string } = {
    projectRoot: process.cwd(),
    boardMembers: [],
    autoRetry: true,
    status: false,
    list: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--project-root') {
      options.projectRoot = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === '--brief-name') {
      options.briefName = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === '--brief-file') {
      options.briefPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === '--member') {
      options.boardMembers = [...(options.boardMembers ?? []), argv[index + 1]];
      index += 1;
      continue;
    }

    if (token === '--session-name') {
      options.sessionName = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === '--status') {
      options.status = true;
      continue;
    }

    if (token === '--list') {
      options.list = true;
      continue;
    }

    if (token === '--no-auto-retry') {
      options.autoRetry = false;
      continue;
    }
  }

  if (options.list) {
    const runs = await listPersistedRuns(options.projectRoot ?? process.cwd());
    const lines = runs.length > 0
      ? runs.map((run) => `- ${run.sessionName} (${run.lifecycle})`)
      : ['- No persisted board runs found.'];

    console.log('Persisted runs:');
    for (const line of lines) {
      console.log(line);
    }

    return runs.map((run) => ({ sessionName: run.sessionName, lifecycle: run.lifecycle }));
  }

  if (options.status) {
    const status = await summarizePersistedRunStatus(options.projectRoot ?? process.cwd(), options.sessionName);
    const rendered = renderBoardStatus(status);
    console.log(rendered);
    return { lifecycle: status.lifecycle, rendered };
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
