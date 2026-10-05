import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import YAML from 'yaml';
import { prepareMemberWorkspace, promoteMemberWorkspaceChanges, snapshotMemberWorkspace, type ArtifactSnapshot } from './artifacts/visibility.js';
import { evaluateMeetingConstraints } from './constraints.js';
import { validateDecisionMemo } from './memo-validator.js';
import { RpcPiAgentClient, ScriptedPiAgentClient, type PiAgentClient, type PiAgentClientFactory, type PiAgentStartConfig, type PiSessionStats } from './pi.js';
import { appendJsonlRecord, captureRunSnapshot, InactivityWatchdog, type RunSession } from './run.js';

export interface BoardTurnResult {
  runId: string;
  outputs: Record<string, string | null>;
  memberResults: Record<string, BoardTurnMemberResult>;
  participantStatuses?: Record<string, 'COMPLETED' | 'UNAVAILABLE'>;
}

export interface BoardRoundRequest {
  to: 'all' | string | string[];
  message: string;
}

export interface BoardRoundResult extends BoardTurnResult {
  participantStatuses: Record<string, 'COMPLETED' | 'UNAVAILABLE'>;
  responses: Array<{
    member: string;
    status: 'completed' | 'unavailable';
    message?: string;
  }>;
  constraint: {
    forced_close: boolean;
    reason?: 'max_time' | 'max_budget';
    voluntary_close_allowed: boolean;
  };
}

export type BoardMemberExecutionStatus = 'COMPLETED' | 'FAILED';

export interface BoardTurnMemberResult {
  sessionId: string;
  sessionDir: string;
  prompt: string;
  output: string | null;
  healthy: boolean;
  status: BoardMemberExecutionStatus;
  attempts: number;
  error: string | null;
  usage?: BoardMemberUsageDelta;
}

export interface BoardMemberUsageDelta {
  costDelta: number | null;
  tokenDelta: NonNullable<PiSessionStats['tokens']> | null;
  remainingContextTokens: number | null;
}

export interface BoardMemberTelemetry {
  status: BoardMemberExecutionStatus;
  response_count: number;
  attempts: number;
  last_output: string | null;
  last_error: string | null;
  last_updated: string;
  usage: BoardMemberUsageDelta;
}

export interface BoardOrchestratorOptions {
  cwd?: string;
  autoRetry?: boolean;
  inactivityTimeoutMs?: number;
}

export const FINAL_STATEMENT_PROMPT = [
  'Provide one final board position.',
  'State your final position, strongest supporting reason, and strongest remaining concern or condition.',
].join('\n');

function recordToolUse(client: PiAgentClient, sessionPath: string): {
  dispose(): void;
  flush(): Promise<void>;
} {
  let writes = Promise.resolve();
  const dispose = client.onEvent((event) => {
    if (event.type !== 'tool_execution_start' || typeof event.toolName !== 'string') {
      return;
    }

    const record = {
      agent: client.agentName,
      timestamp: new Date().toISOString(),
      tool_name: event.toolName,
    };
    writes = writes.then(() => appendJsonlRecord(join(sessionPath, 'tool-use.jsonl'), record));
  });

  return {
    dispose,
    async flush() {
      await writes;
    },
  };
}

function calculateUsageDelta(before: PiSessionStats | undefined, after: PiSessionStats): BoardMemberUsageDelta {
  const tokenDelta = before?.tokens && after.tokens
    ? {
        input: after.tokens.input - before.tokens.input,
        output: after.tokens.output - before.tokens.output,
        cacheRead: after.tokens.cacheRead - before.tokens.cacheRead,
        cacheWrite: after.tokens.cacheWrite - before.tokens.cacheWrite,
        total: after.tokens.total - before.tokens.total,
      }
    : null;
  const contextUsage = after.contextUsage;

  return {
    costDelta: before?.cost !== undefined && after.cost !== undefined
      ? after.cost - before.cost
      : null,
    tokenDelta,
    remainingContextTokens: contextUsage && contextUsage.tokens !== null
      ? contextUsage.contextWindow - contextUsage.tokens
      : null,
  };
}

function currentConstraintState(sessionJson: Record<string, any>) {
  const constraints = sessionJson.constraints ?? {
    min_time_minutes: 0,
    max_time_minutes: Number.MAX_SAFE_INTEGER,
    min_budget: 0,
    max_budget: Number.MAX_SAFE_INTEGER,
  };
  return evaluateMeetingConstraints({
    createdAt: sessionJson.created_at,
    constraints,
    totalBudget: Number(sessionJson.total_cost ?? 0),
  });
}

function persistForcedCloseIfReached(sessionJson: Record<string, any>): void {
  const state = currentConstraintState(sessionJson);
  if (state.forcedClose) {
    sessionJson.forced_close = {
      active: true,
      reason: state.reason,
      voluntary_close_allowed: false,
    };
    sessionJson.final_close_reason = state.reason;
    sessionJson.lifecycle_state = 'FINAL_CLOSING';
    sessionJson.round_state = 'FORCED_CLOSE_PENDING';
  }
}

async function readSessionStatsIfAvailable(client: PiAgentClient): Promise<PiSessionStats | undefined> {
  try {
    return await client.getSessionStats();
  } catch {
    return undefined;
  }
}

async function readAcceptedConversation(sessionPath: string): Promise<string> {
  let contents: string;
  try {
    contents = await readFile(join(sessionPath, 'conversation.jsonl'), 'utf8');
  } catch {
    return '';
  }

  const messages: string[] = [];
  for (const line of contents.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (typeof record.from === 'string' && typeof record.message === 'string') {
        messages.push(`${record.from} → ${typeof record.to === 'string' ? record.to : 'all'}:\n${record.message}`);
      }
    } catch {
      // An incomplete trailing line is ignored; committed earlier messages remain usable.
    }
  }

  return messages.join('\n\n');
}

async function withInactivityWatchdog<T>(
  client: PiAgentClient,
  timeoutMs: number,
  operation: () => Promise<T>,
): Promise<T> {
  let rejectOnTimeout: ((error: Error) => void) | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    rejectOnTimeout = reject;
  });
  const watchdog = new InactivityWatchdog({
    timeoutMs,
    onExpire: () => {
      rejectOnTimeout?.(new Error(`Pi agent "${client.agentName}" exceeded the inactivity timeout.`));
      void client.abort().catch(() => undefined);
    },
  });
  const unsubscribe = client.onEvent((event) => {
    if (event.type.startsWith('message_') || event.type.startsWith('tool_execution_')) {
      watchdog.markActivity();
    }
  });

  watchdog.start();
  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    watchdog.stop();
    unsubscribe();
  }
}

async function executeBoardMember(
  clientFactory: PiAgentClientFactory,
  clientSessions: Map<string, PiAgentClient>,
  options: BoardOrchestratorOptions,
  run: RunSession,
  memberName: string,
  promptText: string,
): Promise<ExecutedBoardMember> {
  const memberSlug = slugify(memberName);
  const sessionId = `${run.sessionId}.${memberSlug}`;
  const sessionDir = join(run.sessionPath, 'pi-sessions', memberSlug);
  await mkdir(sessionDir, { recursive: true });
  const workspacePath = await prepareMemberWorkspace(run.sessionPath, sessionDir);

  const config: PiAgentStartConfig = {
    agentName: memberName,
    sessionId,
    sessionDir,
    cwd: workspacePath,
    autoRetry: false,
  };
  const maxAttempts = options.autoRetry ? 2 : 1;
  let lastError = 'The member did not complete.';

  for (let attemptCount = 1; attemptCount <= maxAttempts; attemptCount += 1) {
    let client: PiAgentClient | undefined;
    let toolUseRecorder: ReturnType<typeof recordToolUse> | undefined;
    let artifactBaseline: ArtifactSnapshot = new Map();

    try {
      artifactBaseline = await snapshotMemberWorkspace(workspacePath);
      const cachedClient = clientSessions.get(sessionId);
      if (cachedClient?.isHealthy()) {
        client = cachedClient;
      } else {
        if (cachedClient) {
          await cachedClient.close().catch(() => undefined);
          clientSessions.delete(sessionId);
        }
        client = await clientFactory.create(config);
        clientSessions.set(sessionId, client);
        await client.start(config);
        await client.setAutoRetry(false);
      }
      const attemptClient = client;
      toolUseRecorder = recordToolUse(attemptClient, run.sessionPath);
      const { statsBefore, statsAfter } = await withInactivityWatchdog(
        attemptClient,
        options.inactivityTimeoutMs ?? 90_000,
        async () => {
          const before = await readSessionStatsIfAvailable(attemptClient);
          await attemptClient.prompt(promptText);
          await attemptClient.waitUntilSettled();
          const after = await readSessionStatsIfAvailable(attemptClient);
          return { statsBefore: before, statsAfter: after };
        },
      );
      await toolUseRecorder.flush();

      return {
        result: {
          sessionId,
          sessionDir,
          prompt: promptText,
          output: await attemptClient.getLastAssistantText(),
          healthy: attemptClient.isHealthy(),
          status: 'COMPLETED',
          attempts: attemptCount,
          error: null,
          usage: statsAfter ? calculateUsageDelta(statsBefore, statsAfter) : {
            costDelta: null,
            tokenDelta: null,
            remainingContextTokens: null,
          },
        },
        workspacePath,
        artifactBaseline,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      toolUseRecorder?.dispose();
      await toolUseRecorder?.flush();
      await client?.close().catch(() => undefined);
      clientSessions.delete(sessionId);
    } finally {
      toolUseRecorder?.dispose();
    }
  }

  return {
    result: {
      sessionId,
      sessionDir,
      prompt: promptText,
      output: null,
      healthy: false,
      status: 'FAILED',
      attempts: maxAttempts,
      error: lastError,
    },
    workspacePath,
    artifactBaseline: new Map(),
  };
}

interface ExecutedBoardMember {
  result: BoardTurnMemberResult;
  workspacePath: string;
  artifactBaseline: ArtifactSnapshot;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'member';
}

export function buildBoardTelemetry(turn: BoardTurnResult): Record<string, BoardMemberTelemetry> {
  return Object.fromEntries(
    Object.entries(turn.memberResults).map(([memberName, memberResult]) => [
      memberName,
      {
        status: memberResult.status,
        response_count: memberResult.output ? 1 : 0,
        attempts: memberResult.attempts,
        last_output: memberResult.output ?? null,
        last_error: memberResult.error ?? null,
        last_updated: new Date().toISOString(),
        usage: memberResult.usage ?? {
          costDelta: null,
          tokenDelta: null,
          remainingContextTokens: null,
        },
      },
    ]),
  );
}

export class BoardOrchestrator {
  private readonly memberClients = new Map<string, PiAgentClient>();

  constructor(
    private readonly clientFactory: PiAgentClientFactory = new DefaultPiAgentClientFactory(),
    private readonly options: BoardOrchestratorOptions = {},
  ) {}

  async closeRun(run: RunSession): Promise<void> {
    const sessionPrefix = `${run.sessionId}.`;
    const clients = [...this.memberClients.entries()].filter(([sessionId]) => sessionId.startsWith(sessionPrefix));
    await Promise.all(clients.map(async ([sessionId, client]) => {
      this.memberClients.delete(sessionId);
      await client.close().catch(() => undefined);
    }));
  }

  async synthesizeCEOConclusion(
    run: RunSession,
    turn: BoardTurnResult,
    prompt?: string,
  ): Promise<string> {
    const sessionJson = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8')) as Record<string, any>;
    const finalStatements = sessionJson.final_statements ?? {};
    const boardMembers = Object.keys(run.board);
    const synthesisOrder = [
      ...boardMembers.filter((memberName) => memberName.toLowerCase() !== 'contrarian'),
      ...boardMembers.filter((memberName) => memberName.toLowerCase() === 'contrarian'),
    ];
    const synthesisInputs = synthesisOrder.map((memberName) => {
      const statement = finalStatements[memberName];
      if (typeof statement === 'string' && statement.trim()) {
        return `${memberName}: ${statement}`;
      }
      if (sessionJson.board?.[memberName]?.status === 'UNAVAILABLE') {
        return `${memberName}: unavailable; no final statement was provided.`;
      }
      return `${memberName}: ${turn.outputs[memberName] ?? 'No accepted statement recorded.'}`;
    });
    const synthesisPrompt = [
      prompt,
      prompt ? '' : 'You are the CEO consolidating the board discussion into one decision.',
      '',
      'Accepted final board statements:',
      ...synthesisInputs,
      '',
      'Provide a concise but reasoned final decision and recommendation for the run.',
    ].filter((line) => line !== undefined).join('\n');

    const config: PiAgentStartConfig = {
      agentName: 'CEO',
      sessionId: `${run.sessionId}.ceo`,
      sessionDir: join(run.sessionPath, 'pi-sessions', 'ceo'),
      cwd: this.options.cwd ?? process.cwd(),
      autoRetry: false,
    };

    await captureRunSnapshot(run, { ceoPrompt: synthesisPrompt });

    const client = await this.clientFactory.create(config);
    const toolUseRecorder = recordToolUse(client, run.sessionPath);
    let synthesisCostDelta = 0;
    try {
      await client.start(config);
      await client.setAutoRetry(false);
      await withInactivityWatchdog(
        client,
        this.options.inactivityTimeoutMs ?? 90_000,
        async () => {
          const statsBefore = await readSessionStatsIfAvailable(client);
          await client.prompt(synthesisPrompt);
          await client.waitUntilSettled();
          const statsAfter = await readSessionStatsIfAvailable(client);
          if (statsBefore?.cost !== undefined && statsAfter?.cost !== undefined) {
            synthesisCostDelta = statsAfter.cost - statsBefore.cost;
          }
        },
      );
      await toolUseRecorder.flush();

      if (synthesisCostDelta !== 0) {
        const sessionPath = join(run.sessionPath, 'session.json');
        const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
        sessionJson.total_cost = Number(sessionJson.total_cost ?? 0) + synthesisCostDelta;
        sessionJson.updated_at = new Date().toISOString();
        await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');
      }

      const conclusion = await client.getLastAssistantText();
      return (conclusion ?? '').trim();
    } finally {
      toolUseRecorder.dispose();
      await toolUseRecorder.flush();
      await client.close().catch(() => undefined);
    }
  }

  async runBoardTurn(
    run: RunSession,
    promptsByMember: Record<string, string>,
  ): Promise<BoardTurnResult> {
    return this.executeBoardTurn(run, promptsByMember, Object.keys(run.board));
  }

  async runBoardRound(run: RunSession, request: BoardRoundRequest): Promise<BoardRoundResult> {
    if (!request.message.trim()) {
      throw new Error('A CEO message is required for a board round.');
    }

    const configuredMembers = Object.keys(run.board);
    const requestedMembers = request.to === 'all'
      ? configuredMembers
      : typeof request.to === 'string'
        ? [request.to]
        : [...new Set(request.to)];

    if (requestedMembers.length === 0) {
      throw new Error('At least one board member must be selected for a round.');
    }

    for (const memberName of requestedMembers) {
      if (!Object.hasOwn(run.board, memberName)) {
        throw new Error(`Unknown board member "${memberName}".`);
      }
    }

    const sessionPath = join(run.sessionPath, 'session.json');
    const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
    persistForcedCloseIfReached(sessionJson);
    if (sessionJson.forced_close?.active) {
      await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');
      throw new Error(`A forced close is active (${sessionJson.forced_close.reason}); no further board round is allowed.`);
    }
    const priorConversation = await readAcceptedConversation(run.sessionPath);
    const participantStatuses: BoardTurnResult['participantStatuses'] = {};
    const availableMembers: string[] = [];

    for (const memberName of requestedMembers) {
      if (sessionJson.board?.[memberName]?.status === 'UNAVAILABLE') {
        participantStatuses[memberName] = 'UNAVAILABLE';
      } else {
        availableMembers.push(memberName);
      }
    }

    sessionJson.status = 'RUNNING';
    sessionJson.lifecycle_state = 'DELIBERATING';
    sessionJson.round_state = 'IN_PROGRESS';
    sessionJson.updated_at = new Date().toISOString();
    await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');
    const promptsByMember = Object.fromEntries(availableMembers.map((memberName) => [
      memberName,
      [
        `You are ${memberName}.`,
        '',
        `Brief: ${sessionJson.brief ?? run.sessionName}`,
        '',
        typeof sessionJson.brief_content === 'string' ? sessionJson.brief_content : '',
        '',
        'Prior shared conversation before this round:',
        priorConversation || '(No prior deliberation messages.)',
        '',
        'Current CEO message:',
        request.message,
      ].join('\n'),
    ]));

    await appendJsonlRecord(join(run.sessionPath, 'conversation.jsonl'), {
      from: 'CEO',
      to: request.to,
      message: request.message,
    });

    const turn = await this.executeBoardTurn(run, promptsByMember, availableMembers);
    const combinedStatuses = { ...participantStatuses };
    for (const memberName of availableMembers) {
      const result = turn.memberResults[memberName];
      combinedStatuses[memberName] = result.status === 'COMPLETED' ? 'COMPLETED' : 'UNAVAILABLE';
      sessionJson.board[memberName] = {
        ...(sessionJson.board[memberName] ?? {}),
        status: combinedStatuses[memberName],
        attempts: result.attempts,
        last_output: result.status === 'COMPLETED' ? result.output : null,
        last_error: result.error,
        last_updated: new Date().toISOString(),
      };
    }

    const latestSessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
    latestSessionJson.board = sessionJson.board;
    latestSessionJson.round = Number(latestSessionJson.round ?? 0) + 1;
    latestSessionJson.round_state = 'IDLE';
    persistForcedCloseIfReached(latestSessionJson);
    if (!latestSessionJson.forced_close?.active) {
      latestSessionJson.round_state = 'IDLE';
    }
    latestSessionJson.updated_at = new Date().toISOString();
    await writeFile(sessionPath, `${JSON.stringify(latestSessionJson, null, 2)}\n`, 'utf8');

    const responses: BoardRoundResult['responses'] = requestedMembers.map((memberName) => {
      const status: 'completed' | 'unavailable' = combinedStatuses[memberName] === 'COMPLETED' ? 'completed' : 'unavailable';
      const message = turn.memberResults[memberName]?.output;
      return status === 'completed' && message !== null && message !== undefined
        ? { member: memberName, status, message }
        : { member: memberName, status };
    });
    const forcedClose = latestSessionJson.forced_close ?? {};
    const evaluatedConstraint = currentConstraintState(latestSessionJson);
    const reason = forcedClose.active
      ? forcedClose.reason
      : evaluatedConstraint.reason;
    const constraint = {
      forced_close: Boolean(forcedClose.active || evaluatedConstraint.forcedClose),
      ...(reason ? { reason } : {}),
      voluntary_close_allowed: Boolean(forcedClose.active)
        ? false
        : evaluatedConstraint.voluntaryCloseAllowed,
    };

    return { ...turn, participantStatuses: combinedStatuses, responses, constraint };
  }

  private async executeBoardTurn(
    run: RunSession,
    promptsByMember: Record<string, string>,
    memberNames: string[],
  ): Promise<BoardTurnResult> {
    for (const memberName of memberNames) {
      if (!promptsByMember[memberName]) {
        throw new Error(`No prompt configured for board member "${memberName}".`);
      }
    }

    const sessionPath = join(run.sessionPath, 'session.json');
    const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
    sessionJson.status = 'RUNNING';
    sessionJson.lifecycle_state = 'DELIBERATING';
    sessionJson.updated_at = new Date().toISOString();
    await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');
    await captureRunSnapshot(run, { promptsByMember });

    const executions = await Promise.all(memberNames.map((memberName) => executeBoardMember(
      this.clientFactory,
      this.memberClients,
      this.options,
      run,
      memberName,
      promptsByMember[memberName],
    )));
    const memberResults = Object.fromEntries(memberNames.map((memberName, index) => [memberName, executions[index]!.result])) as Record<string, BoardTurnMemberResult>;
    const outputs = Object.fromEntries(memberNames.map((memberName) => [memberName, memberResults[memberName].output]));
    const participantStatuses: BoardTurnResult['participantStatuses'] = {};

    for (const execution of executions) {
      if (execution.result.status === 'COMPLETED') {
        await promoteMemberWorkspaceChanges(run.sessionPath, execution.workspacePath, execution.artifactBaseline);
      }
    }

    for (const memberName of memberNames) {
      const output = outputs[memberName];
      if (memberResults[memberName].status === 'COMPLETED' && output !== null) {
        participantStatuses[memberName] = 'COMPLETED';
        await appendJsonlRecord(join(run.sessionPath, 'conversation.jsonl'), {
          from: memberName,
          to: 'all',
          message: output,
        });
      } else {
        participantStatuses[memberName] = 'UNAVAILABLE';
      }
    }

    const updatedSessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
    updatedSessionJson.total_cost = Number(updatedSessionJson.total_cost ?? 0)
      + Object.values(memberResults).reduce((total, result) => total + (result.usage?.costDelta ?? 0), 0);
    updatedSessionJson.updated_at = new Date().toISOString();
    await writeFile(sessionPath, `${JSON.stringify(updatedSessionJson, null, 2)}\n`, 'utf8');

    return {
      runId: run.sessionId,
      outputs,
      memberResults,
      participantStatuses,
    };
  }

  async endDeliberation(
    run: RunSession,
    turn: BoardTurnResult,
    finalStatementsByMember?: Record<string, string>,
  ): Promise<Record<string, string>> {
    const sessionPath = join(run.sessionPath, 'session.json');
    const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
    persistForcedCloseIfReached(sessionJson);
    const constraintState = currentConstraintState(sessionJson);
    if (!sessionJson.forced_close?.active && !constraintState.voluntaryCloseAllowed) {
      throw new Error(`Voluntary close is not allowed before min_time (${sessionJson.constraints?.min_time_minutes ?? 0} minutes).`);
    }

    sessionJson.status = 'RUNNING';
    sessionJson.lifecycle_state = 'FINAL_CLOSING';
    sessionJson.round_state = 'FINAL_CLOSING';
    sessionJson.updated_at = new Date().toISOString();
    await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');

    const availableMembers = Object.keys(run.board)
      .filter((memberName) => sessionJson.board?.[memberName]?.status !== 'UNAVAILABLE');
    const sharedHistory = await readAcceptedConversation(run.sessionPath);
    const finalStatementResults = await Promise.all(availableMembers.map(async (memberName) => {
      const suppliedStatement = finalStatementsByMember?.[memberName]?.trim();
      if (suppliedStatement) {
        return { memberName, statement: suppliedStatement, execution: undefined };
      }

      const execution = await executeBoardMember(
        this.clientFactory,
        this.memberClients,
        { ...this.options, autoRetry: true },
        run,
        memberName,
        [
          `Brief: ${sessionJson.brief ?? run.sessionName}`,
          typeof sessionJson.brief_content === 'string' ? sessionJson.brief_content : '',
          '',
          'Accepted shared conversation before final closing:',
          sharedHistory || '(No shared deliberation messages.)',
          '',
          FINAL_STATEMENT_PROMPT,
        ].join('\n'),
      );
      return {
        memberName,
        statement: execution.result.status === 'COMPLETED' ? execution.result.output?.trim() : undefined,
        execution,
      };
    }));

    for (const finalResult of finalStatementResults) {
      if (finalResult.execution?.result.status === 'COMPLETED') {
        await promoteMemberWorkspaceChanges(
          run.sessionPath,
          finalResult.execution.workspacePath,
          finalResult.execution.artifactBaseline,
        );
      }
    }

    const contrarian = finalStatementResults.filter(({ memberName }) => memberName.toLowerCase() === 'contrarian');
    const otherMembers = finalStatementResults.filter(({ memberName }) => memberName.toLowerCase() !== 'contrarian');
    const finalStatements: Record<string, string> = {};

    for (const { memberName, statement, execution } of [...otherMembers, ...contrarian]) {
      const tracked = sessionJson.board[memberName] ?? {};
      tracked.status = statement ? 'COMPLETED' : 'UNAVAILABLE';
      tracked.attempts = execution?.result.attempts ?? tracked.attempts ?? 0;
      tracked.last_output = statement ?? null;
      tracked.last_error = execution?.result.error ?? null;
      tracked.last_updated = new Date().toISOString();
      sessionJson.board[memberName] = tracked;

      if (!statement) {
        continue;
      }

      finalStatements[memberName] = statement;
      await appendJsonlRecord(join(run.sessionPath, 'conversation.jsonl'), {
        from: memberName,
        to: 'all',
        message: statement,
      });
    }

    sessionJson.final_statements = finalStatements;
    sessionJson.total_cost = Number(sessionJson.total_cost ?? 0) + finalStatementResults
      .reduce((total, result) => total + (result.execution?.result.usage?.costDelta ?? 0), 0);
    await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');
    return finalStatements;
  }

  async finalizeRun(
    run: RunSession,
    turn: BoardTurnResult,
    finalStatementsByMember?: Record<string, string>,
  ): Promise<{ memo: string; finalStatements: Record<string, string> }> {
    const finalStatements = await this.endDeliberation(run, turn, finalStatementsByMember);
    const memo = await this.writeCEOConclusion(run, turn);

    return { memo, finalStatements };
  }

  async writeCEOConclusion(
    run: RunSession,
    turn: BoardTurnResult,
    conclusion?: string,
  ): Promise<string> {
    let finalConclusion = conclusion ?? null;
    let memo = '';
    let lastFailure = 'CEO synthesis returned no accepted memo content.';

    const sessionPath = join(run.sessionPath, 'session.json');
    const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
    persistForcedCloseIfReached(sessionJson);
    if (!sessionJson.forced_close?.active && !currentConstraintState(sessionJson).voluntaryCloseAllowed) {
      throw new Error(`CEO synthesis is not allowed before min_time (${sessionJson.constraints?.min_time_minutes ?? 0} minutes).`);
    }
    sessionJson.status = 'RUNNING';
    sessionJson.lifecycle_state = 'SYNTHESIS';
    sessionJson.legacy_lifecycle_state = 'CEO_SYNTHESIS';
    sessionJson.updated_at = new Date().toISOString();
    await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        if (!finalConclusion) {
          const retryPrompt = attempt === 1
            ? undefined
            : `The previous CEO memo attempt was not accepted. Correct these errors: ${lastFailure}`;
          finalConclusion = await this.synthesizeCEOConclusion(run, turn, retryPrompt);
        }

        const latest = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
        const now = new Date();
        const duration = Math.max(0, (now.getTime() - new Date(latest.created_at).getTime()) / 60_000);
        const budgetUsed = Number(latest.total_cost ?? 0);
        const title = 'CEO Decision';
        const expectedMetadata = {
          title,
          date: now.toISOString(),
          sessionId: run.sessionId,
          duration,
          budgetUsed,
          boardMembers: Object.keys(run.board),
          brief: String(latest.brief ?? run.sessionName),
          transcript: join(run.sessionPath, 'conversation.jsonl'),
        };
        const frontmatter = YAML.stringify({
          title: expectedMetadata.title,
          date: expectedMetadata.date,
          session_id: expectedMetadata.sessionId,
          duration: expectedMetadata.duration,
          budget_used: expectedMetadata.budgetUsed,
          board_members: expectedMetadata.boardMembers,
          brief: expectedMetadata.brief,
          transcript: expectedMetadata.transcript,
        }).trimEnd();
        const finalStatements = latest.final_statements ?? {};
        const boardStances = Object.keys(run.board).map((memberName) => {
          const statement = finalStatements[memberName];
          const fallbackStatement = turn.memberResults[memberName]?.output ?? turn.outputs[memberName];
          const stance = typeof statement === 'string' && statement.trim()
            ? statement
            : latest.board?.[memberName]?.status === 'UNAVAILABLE'
              ? 'Unavailable: no final statement was provided.'
              : fallbackStatement ?? 'Unavailable: no accepted statement was provided.';
          return `### ${memberName}\n\n${stance}\n`;
        });

        memo = [
          '---',
          frontmatter,
          '---',
          '',
          `# Board Memo: ${title}`,
          '',
          '## Final Decision',
          '',
          finalConclusion ?? '',
          '',
          '## Ranked Recommendations',
          '',
          `1. ${finalConclusion ?? ''}`,
          '',
          '## Decision Map',
          '',
          '- Board discussion resolved to a single CEO decision.',
          '',
          '## Board Stances',
          '',
          ...boardStances,
          '## Tensions & Dissent',
          '',
          'The board surfaced the main trade-off and dissenting position before the CEO synthesized the final recommendation.',
          '',
          '## Trade-offs & Risks',
          '',
          'The chief risks are execution risk and decision quality under uncertainty.',
          '',
          '## Next Actions',
          '',
          '1. Confirm the chosen direction with the owning team.',
          '2. Document the specific implementation order.',
          '',
          '## Deliberation Summary',
          '',
          `The board reviewed the case and the CEO selected: ${finalConclusion ?? ''}`,
          '',
        ].join('\n');

        const validation = validateDecisionMemo(memo, expectedMetadata);
        if (!validation.ok) {
          lastFailure = validation.errors.join('; ');
          finalConclusion = null;
          continue;
        }

        await mkdir(join(run.sessionPath, 'snapshot'), { recursive: true });
        await writeFile(run.memoPath, memo, 'utf8');

        const completedSession = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
        for (const [memberName, memberResult] of Object.entries(turn.memberResults)) {
          const tracked = completedSession.board[memberName] ?? {};
          if (tracked.status === 'UNAVAILABLE') {
            continue;
          }
          tracked.status = memberResult.healthy ? 'COMPLETED' : 'FAILED';
          tracked.attempts = memberResult.attempts ?? Number(tracked.attempts ?? 0);
          tracked.last_output = memberResult.output ?? null;
          tracked.last_error = memberResult.error ?? null;
          tracked.last_updated = new Date().toISOString();
          completedSession.board[memberName] = tracked;
        }

        completedSession.round = Number(completedSession.round ?? 0) + 1;
        completedSession.round_state = 'CEO_SYNTHESIS_COMPLETE';
        completedSession.status = 'COMPLETED';
        completedSession.lifecycle_state = 'COMPLETED';
        completedSession.legacy_lifecycle_state = 'CEO_SYNTHESIS';
        completedSession.updated_at = new Date().toISOString();
        completedSession.ceo_conclusion = finalConclusion;
        completedSession.telemetry = buildBoardTelemetry(turn);
        const endedAt = new Date();
        const elapsedMinutes = Math.max(0, (endedAt.getTime() - new Date(completedSession.created_at).getTime()) / 60_000);

        await appendJsonlRecord(join(run.sessionPath, 'conversation.jsonl'), {
          from: 'CEO',
          to: 'all',
          message: finalConclusion ?? '',
        });
        await appendJsonlRecord(join(run.sessionPath, 'conversation.jsonl'), {
          type: 'meeting_end',
          timestamp: endedAt.toISOString(),
          elapsed_minutes: elapsedMinutes,
          total_cost: Number(completedSession.total_cost ?? 0),
          end_reason: completedSession.forced_close?.reason ? `${completedSession.forced_close.reason}_constraint` : 'completed',
        });

        await writeFile(sessionPath, `${JSON.stringify(completedSession, null, 2)}\n`, 'utf8');
        return memo;
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
        finalConclusion = null;
      }
    }

    const failedSession = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
    failedSession.round = Number(failedSession.round ?? 0) + 1;
    failedSession.round_state = 'CEO_SYNTHESIS_FAILED';
    failedSession.status = 'FAILED';
    failedSession.lifecycle_state = 'FAILED';
    failedSession.updated_at = new Date().toISOString();
    failedSession.ceo_conclusion = finalConclusion;
    failedSession.last_error = lastFailure;
    failedSession.telemetry = buildBoardTelemetry(turn);
    if (memo) {
      await writeFile(run.memoPath, memo, 'utf8');
    }
    await writeFile(sessionPath, `${JSON.stringify(failedSession, null, 2)}\n`, 'utf8');
    throw new Error(`CEO synthesis failed after two attempts: ${lastFailure}`);
  }
}

class DefaultPiAgentClientFactory implements PiAgentClientFactory {
  async create(config: PiAgentStartConfig): Promise<PiAgentClient> {
    return new RpcPiAgentClient({
      agentName: config.agentName,
      piSessionId: config.sessionId,
      cwd: config.cwd,
    });
  }
}
