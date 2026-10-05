import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { prepareMemberWorkspace, promoteMemberWorkspaceChanges, snapshotMemberWorkspace, type ArtifactSnapshot } from './artifacts/visibility.js';
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
      const attemptClient = await clientFactory.create(config);
      client = attemptClient;
      toolUseRecorder = recordToolUse(attemptClient, run.sessionPath);
      await attemptClient.start(config);
      await attemptClient.setAutoRetry(false);
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

const REQUIRED_MEMO_HEADINGS = [
  '# Board Memo',
  '## Final Decision',
  '## Ranked Recommendations',
  '## Decision Map',
  '## Board Stances',
  '## Tensions & Dissent',
  '## Trade-offs & Risks',
  '## Next Actions',
  '## Deliberation Summary',
];

function validateMemo(memo: string): string[] {
  const normalized = memo.replace(/\r/g, '');
  const issues: string[] = [];

  for (const heading of REQUIRED_MEMO_HEADINGS) {
    if (!normalized.includes(heading)) {
      issues.push(`missing required heading: ${heading}`);
    }
  }

  let inFinalDecision = false;
  const finalDecisionLines: string[] = [];

  for (const line of normalized.split('\n')) {
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
      finalDecisionLines.push(line);
    }
  }

  if (finalDecisionLines.join('\n').trim().length === 0) {
    issues.push('missing non-empty Final Decision section');
  }

  return issues;
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
  constructor(
    private readonly clientFactory: PiAgentClientFactory = new DefaultPiAgentClientFactory(),
    private readonly options: BoardOrchestratorOptions = {},
  ) {}

  async synthesizeCEOConclusion(
    run: RunSession,
    turn: BoardTurnResult,
    prompt?: string,
  ): Promise<string> {
    const synthesisPrompt = prompt ?? [
      'You are the CEO consolidating the board discussion into one decision.',
      '',
      'Board member outputs:',
      ...Object.entries(turn.outputs).map(([memberName, output]) => `${memberName}: ${output ?? 'No output recorded.'}`),
      '',
      'Provide a concise but reasoned final decision and recommendation for the run.',
    ].join('\n');

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
    try {
      await client.start(config);
      await client.setAutoRetry(false);
      await withInactivityWatchdog(
        client,
        this.options.inactivityTimeoutMs ?? 90_000,
        async () => {
          await client.prompt(synthesisPrompt);
          await client.waitUntilSettled();
        },
      );
      await toolUseRecorder.flush();

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
    const reason = forcedClose.reason === 'max_time' || forcedClose.reason === 'max_budget'
      ? forcedClose.reason
      : undefined;
    const constraint = {
      forced_close: Boolean(forcedClose.active),
      ...(reason ? { reason } : {}),
      voluntary_close_allowed: forcedClose.voluntary_close_allowed !== false,
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
    const finalStatements: Record<string, string> = {};

    sessionJson.status = 'RUNNING';
    sessionJson.lifecycle_state = 'FINAL_CLOSING';
    sessionJson.round_state = 'FINAL_CLOSING';
    sessionJson.updated_at = new Date().toISOString();

    for (const memberName of Object.keys(run.board)) {
      const statement = finalStatementsByMember?.[memberName] ?? turn.outputs[memberName] ?? `Final position: ${memberName} remains committed to the current recommendation.`;
      finalStatements[memberName] = statement;

      const tracked = sessionJson.board[memberName] ?? {};
      tracked.status = 'COMPLETED';
      tracked.last_output = statement;
      tracked.last_updated = new Date().toISOString();
      sessionJson.board[memberName] = tracked;

      await appendJsonlRecord(join(run.sessionPath, 'conversation.jsonl'), {
        from: memberName,
        to: 'all',
        message: statement,
      });
    }

    sessionJson.final_statements = finalStatements;
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
    let attemptCount = 0;

    const sessionPath = join(run.sessionPath, 'session.json');
    const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
    sessionJson.status = 'RUNNING';
    sessionJson.lifecycle_state = 'SYNTHESIS';
    sessionJson.legacy_lifecycle_state = 'CEO_SYNTHESIS';
    sessionJson.updated_at = new Date().toISOString();
    await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');

    while (attemptCount < 2) {
      attemptCount += 1;
      if (!finalConclusion) {
        finalConclusion = await this.synthesizeCEOConclusion(run, turn, attemptCount > 1
          ? 'The previous CEO memo was invalid. Please rewrite it as a valid board memo that includes the required headings and a non-empty Final Decision.'
          : undefined);
      }

      memo = [
        '# Board Memo: CEO Decision',
        '',
        `- Run: ${run.sessionName}`,
        `- Session ID: ${run.sessionId}`,
        '',
        '## Final Decision',
        '',
        finalConclusion,
        '',
        '## Ranked Recommendations',
        '',
        `1. ${finalConclusion}`,
        '',
        '## Decision Map',
        '',
        '- Board discussion resolved to a single CEO decision.',
        '',
        '## Board Stances',
        '',
        ...Object.entries(turn.outputs).map(([memberName, output]) => `### ${memberName}\n\n${output ?? 'No output recorded.'}\n`),
        '',
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
        `The board reviewed the case and the CEO selected: ${finalConclusion}`,
        '',
      ].join('\n');

      const validationErrors = validateMemo(memo);
      if (validationErrors.length === 0) {
        await mkdir(join(run.sessionPath, 'snapshot'), { recursive: true });
        await writeFile(run.memoPath, memo, 'utf8');

        const sessionPath = join(run.sessionPath, 'session.json');
        const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;

        for (const [memberName, memberResult] of Object.entries(turn.memberResults)) {
          const tracked = sessionJson.board[memberName] ?? {};
          tracked.status = memberResult.healthy ? 'COMPLETED' : 'FAILED';
          tracked.attempts = memberResult.attempts ?? Number(tracked.attempts ?? 0);
          tracked.last_output = memberResult.output ?? null;
          tracked.last_error = memberResult.error ?? null;
          tracked.last_updated = new Date().toISOString();
          sessionJson.board[memberName] = tracked;
        }

        sessionJson.round = Number(sessionJson.round ?? 0) + 1;
        sessionJson.round_state = 'CEO_SYNTHESIS_COMPLETE';
        sessionJson.status = 'READY';
        sessionJson.lifecycle_state = 'COMPLETED';
        sessionJson.legacy_lifecycle_state = 'CEO_SYNTHESIS';
        sessionJson.updated_at = new Date().toISOString();
        sessionJson.ceo_conclusion = finalConclusion;
        sessionJson.telemetry = buildBoardTelemetry(turn);

        await appendJsonlRecord(join(run.sessionPath, 'conversation.jsonl'), {
          from: 'CEO',
          to: 'all',
          message: finalConclusion,
        });
        await appendJsonlRecord(join(run.sessionPath, 'conversation.jsonl'), {
          type: 'meeting_end',
          timestamp: new Date().toISOString(),
          elapsed_minutes: 0,
          total_cost: 0,
          end_reason: 'completed',
        });

        await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');
        return memo;
      }

      if (attemptCount >= 2 || !this.options.autoRetry) {
        const sessionPath = join(run.sessionPath, 'session.json');
        const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;

        sessionJson.round = Number(sessionJson.round ?? 0) + 1;
        sessionJson.round_state = 'CEO_SYNTHESIS_FAILED';
        sessionJson.status = 'FAILED';
        sessionJson.lifecycle_state = 'FAILED';
        sessionJson.updated_at = new Date().toISOString();
        sessionJson.ceo_conclusion = finalConclusion;
        sessionJson.last_error = validationErrors.join('; ');
        sessionJson.telemetry = buildBoardTelemetry(turn);

        await writeFile(run.memoPath, memo, 'utf8');
        await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');
        throw new Error(`CEO synthesis failed memo validation: ${validationErrors.join('; ')}`);
      }

      finalConclusion = null;
    }

    throw new Error('CEO memo synthesis failed unexpectedly.');
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
