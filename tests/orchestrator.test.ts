import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { ScriptedPiAgentClient, type PiAgentClient, type PiAgentClientFactory, type PiAgentEvent } from '../src/pi.js';
import { createRun } from '../src/run.js';
import { BoardOrchestrator } from '../src/orchestrator.js';

describe('board orchestrator', () => {
  it('creates one run-scoped Pi session per board member and returns each member response', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-orchestrator-'));

    try {
      const created: Record<string, { sessionId: string; sessionDir: string; agentName: string }> = {};
      const factory: PiAgentClientFactory = {
        async create(config) {
          const client = new ScriptedPiAgentClient({
            agentName: config.agentName,
            piSessionId: config.sessionId,
          });

          created[config.agentName] = {
            sessionId: config.sessionId,
            sessionDir: config.sessionDir,
            agentName: config.agentName,
          };

          return client;
        },
      };

      const run = await createRun(projectRoot, {
        briefName: 'acquisition-decision',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue', 'Contrarian'],
      });

      const orchestrator = new BoardOrchestrator(factory);
      const result = await orchestrator.runBoardTurn(run, {
        Revenue: 'Analyze the acquisition case.',
        Contrarian: 'We should take the lower-risk path.',
      });

      expect(created.Revenue.sessionId).toBe(`${run.sessionId}.revenue`);
      expect(created.Contrarian.sessionId).toBe(`${run.sessionId}.contrarian`);
      expect(created.Revenue.sessionDir).toContain(`${run.sessionName}/pi-sessions/revenue`);
      expect(created.Contrarian.sessionDir).toContain(`${run.sessionName}/pi-sessions/contrarian`);
      expect(result.outputs.Revenue).toBe('The board should proceed with the offer.');
      expect(result.outputs.Contrarian).toBe('The final argument is to keep the lower-risk path.');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('starts all board member prompts before waiting at the round barrier', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-round-barrier-'));
    let releaseMembers: (() => void) | undefined;
    let resolveAllPromptsStarted: (() => void) | undefined;
    let startedPrompts = 0;
    const allPromptsStarted = new Promise<void>((resolve) => { resolveAllPromptsStarted = resolve; });
    const releaseGate = new Promise<void>((resolve) => { releaseMembers = resolve; });

    try {
      const run = await createRun(projectRoot, {
        briefName: 'parallel-review',
        briefContent: '# Brief\n\n## Situation\nTest round concurrency.',
        boardMembers: ['Revenue', 'Contrarian'],
      });
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new class extends ScriptedPiAgentClient {
            async prompt(text: string) {
              startedPrompts += 1;
              if (startedPrompts === 2) {
                resolveAllPromptsStarted?.();
              }
              await super.prompt(text);
            }

            async waitUntilSettled(signal?: AbortSignal) {
              await releaseGate;
              await super.waitUntilSettled(signal);
            }
          }({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      const turn = orchestrator.runBoardTurn(run, {
        Revenue: 'Analyze the acquisition case.',
        Contrarian: 'Challenge the acquisition case.',
      });
      const barrierReached = expect(allPromptsStarted).resolves.toBeUndefined();
      await barrierReached;
      expect(startedPrompts).toBe(2);
      releaseMembers?.();
      await expect(turn).resolves.toMatchObject({
        outputs: {
          Revenue: 'The board should proceed with the offer.',
          Contrarian: 'The final argument is to keep the lower-risk path.',
        },
      });
    } finally {
      releaseMembers?.();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('waits for the slowest participant before returning the round result', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-slowest-member-'));
    let markPromptsStarted: (() => void) | undefined;
    let releaseRevenue: (() => void) | undefined;
    let releaseContrarian: (() => void) | undefined;
    let startedPrompts = 0;
    const promptsStarted = new Promise<void>((resolve) => { markPromptsStarted = resolve; });
    const revenueGate = new Promise<void>((resolve) => { releaseRevenue = resolve; });
    const contrarianGate = new Promise<void>((resolve) => { releaseContrarian = resolve; });

    try {
      const run = await createRun(projectRoot, {
        briefName: 'slow-member-review',
        briefContent: '# Brief\n\n## Situation\nOne member is slower.',
        boardMembers: ['Revenue', 'Contrarian'],
      });
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          const gate = config.agentName === 'Revenue' ? revenueGate : contrarianGate;
          return new class extends ScriptedPiAgentClient {
            async prompt(text: string) {
              startedPrompts += 1;
              if (startedPrompts === 2) {
                markPromptsStarted?.();
              }
              await super.prompt(text);
            }

            async waitUntilSettled(signal?: AbortSignal) {
              await gate;
              await super.waitUntilSettled(signal);
            }
          }({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      let turnResolved = false;
      const turn = orchestrator.runBoardRound(run, { to: 'all', message: 'Wait for both positions.' });
      void turn.then(() => { turnResolved = true; });
      await promptsStarted;
      releaseRevenue?.();
      await Promise.resolve();
      await Promise.resolve();

      expect(turnResolved).toBe(false);
      releaseContrarian?.();
      await turn;
      expect(turnResolved).toBe(true);
    } finally {
      releaseRevenue?.();
      releaseContrarian?.();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('routes all, single, and subset recipients and rejects unknown members', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-recipients-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'recipient-review',
        briefContent: '# Brief\n\n## Situation\nRoute a message.',
        boardMembers: ['Revenue', 'Contrarian', 'Ops'],
      });
      const executed: string[] = [];
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new class extends ScriptedPiAgentClient {
            async prompt(text: string) {
              executed.push(config.agentName);
              await super.prompt(text);
            }
          }({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      await orchestrator.runBoardRound(run, { to: 'all', message: 'First message.' });
      expect([...executed].sort()).toEqual(['Contrarian', 'Ops', 'Revenue']);
      executed.length = 0;

      await orchestrator.runBoardRound(run, { to: 'Revenue', message: 'One member.' });
      expect(executed).toEqual(['Revenue']);
      executed.length = 0;

      await orchestrator.runBoardRound(run, { to: ['Revenue', 'Ops'], message: 'A subset.' });
      expect([...executed].sort()).toEqual(['Ops', 'Revenue']);
      const conversation = (await readFile(join(run.sessionPath, 'conversation.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(conversation[1]).toEqual({ from: 'CEO', to: 'all', message: 'First message.' });
      expect(conversation[5]).toEqual({ from: 'CEO', to: 'Revenue', message: 'One member.' });
      expect(conversation[7]).toEqual({ from: 'CEO', to: ['Revenue', 'Ops'], message: 'A subset.' });

      await expect(orchestrator.runBoardRound(run, { to: 'Unknown', message: 'Invalid target.' }))
        .rejects.toThrow(/unknown board member/i);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('marks exhausted members unavailable and does not execute them in later all rounds', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-unavailable-routing-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'unavailable-review',
        briefContent: '# Brief\n\n## Situation\nFilter unavailable members.',
        boardMembers: ['Revenue', 'Contrarian'],
      });
      const created: string[] = [];
      const executed: string[] = [];
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          created.push(config.agentName);
          if (config.agentName === 'Revenue') {
            return {
              agentName: config.agentName,
              piSessionId: config.sessionId,
              async start() { throw new Error('process exited'); },
              async prompt() { return; },
              async waitUntilSettled() { return; },
              async getLastAssistantText() { return null; },
              async getSessionStats() {
                return { messageCount: 0, pendingMessageCount: 0, sessionId: config.sessionId, isStreaming: false };
              },
              async setAutoRetry() { return; },
              async abort() { return; },
              onEvent() { return () => {}; },
              isHealthy() { return false; },
              async close() { return; },
            };
          }
          return new class extends ScriptedPiAgentClient {
            async prompt(text: string) {
              executed.push(config.agentName);
              await super.prompt(text);
            }
          }({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      const firstRound = await orchestrator.runBoardRound(run, { to: 'all', message: 'Round one.' });
      expect(firstRound.participantStatuses).toEqual({ Revenue: 'UNAVAILABLE', Contrarian: 'COMPLETED' });
      expect(firstRound.responses).toEqual([
        { member: 'Revenue', status: 'unavailable' },
        { member: 'Contrarian', status: 'completed', message: 'The final argument is to keep the lower-risk path.' },
      ]);
      expect(firstRound.constraint).toEqual({ forced_close: false, voluntary_close_allowed: true });
      expect([...created].sort()).toEqual(['Contrarian', 'Revenue']);
      expect([...executed].sort()).toEqual(['Contrarian']);

      created.length = 0;
      executed.length = 0;
      const secondRound = await orchestrator.runBoardRound(run, { to: 'all', message: 'Round two.' });
      expect(created).toEqual([]);
      expect(executed).toEqual(['Contrarian']);
      expect(secondRound.participantStatuses).toEqual({ Revenue: 'UNAVAILABLE', Contrarian: 'COMPLETED' });

      created.length = 0;
      executed.length = 0;
      const explicitUnavailable = await orchestrator.runBoardRound(run, { to: 'Revenue', message: 'Check availability.' });
      expect(created).toEqual([]);
      expect(executed).toEqual([]);
      expect(explicitUnavailable.participantStatuses).toEqual({ Revenue: 'UNAVAILABLE' });
      expect(explicitUnavailable.responses).toEqual([{ member: 'Revenue', status: 'unavailable' }]);

      const sessionJson = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8'));
      expect(sessionJson.round).toBe(3);
      expect(sessionJson.round_state).toBe('IDLE');
      expect(sessionJson.board.Revenue.status).toBe('UNAVAILABLE');
      expect(sessionJson.board.Contrarian.status).toBe('COMPLETED');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('rejects another board round when forced close is already active', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-round-constraint-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'forced-round-review',
        briefContent: '# Brief\n\n## Situation\nCheck round constraints.',
        boardMembers: ['Revenue'],
      });
      const sessionPath = join(run.sessionPath, 'session.json');
      const sessionJson = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
      sessionJson.forced_close = { active: true, reason: 'max_time', voluntary_close_allowed: false };
      await writeFile(sessionPath, `${JSON.stringify(sessionJson, null, 2)}\n`, 'utf8');

      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new ScriptedPiAgentClient({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });
      await expect(orchestrator.runBoardRound(run, { to: 'Revenue', message: 'Do not start another round.' }))
        .rejects.toThrow(/forced close/i);
      const closedSession = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
      expect(closedSession.forced_close).toEqual({ active: true, reason: 'max_time', voluntary_close_allowed: false });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('blocks voluntary final closing before min_time but does not use min_budget as a gate', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-min-time-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'minimum-time-review',
        briefContent: '# Brief\n\n## Situation\nMinimum time controls voluntary close.',
        boardMembers: ['Revenue'],
        constraints: { min_time_minutes: 60, max_time_minutes: 120, min_budget: 1000, max_budget: 2000 },
      });
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new ScriptedPiAgentClient({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });
      const turn = await orchestrator.runBoardRound(run, { to: 'all', message: 'Analyze the acquisition case.' });
      expect(turn.constraint.voluntary_close_allowed).toBe(false);

      await expect(orchestrator.endDeliberation(run, turn)).rejects.toThrow(/min_time/i);
      await expect(orchestrator.writeCEOConclusion(run, turn, 'Close now.')).rejects.toThrow(/min_time/i);

      const sessionPath = join(run.sessionPath, 'session.json');
      const checkpoint = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
      checkpoint.created_at = new Date(Date.now() - 61 * 60 * 1000).toISOString();
      await writeFile(sessionPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');

      await expect(orchestrator.endDeliberation(run, turn)).resolves.toMatchObject({ Revenue: expect.any(String) });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('finishes an active round before max-budget forced close and then only permits final closing', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-max-budget-'));
    let promptsStarted = 0;

    try {
      const run = await createRun(projectRoot, {
        briefName: 'maximum-budget-review',
        briefContent: '# Brief\n\n## Situation\nThe active round must finish.',
        boardMembers: ['Revenue', 'Contrarian'],
        constraints: { min_time_minutes: 0, max_time_minutes: 100, min_budget: 1_000_000, max_budget: 0.25 },
      });
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          let statsRead = 0;
          return new class extends ScriptedPiAgentClient {
            async prompt(text: string) {
              promptsStarted += 1;
              await super.prompt(text);
            }

            async getSessionStats() {
              statsRead += 1;
              return {
                ...(await super.getSessionStats()),
                cost: statsRead === 1 ? 0 : 0.5,
                tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15 },
              };
            }
          }({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      const result = await orchestrator.runBoardRound(run, { to: 'all', message: 'Finish the current round.' });

      expect(promptsStarted).toBe(2);
      expect(Object.values(result.participantStatuses)).toEqual(['COMPLETED', 'COMPLETED']);
      expect(result.constraint).toMatchObject({ forced_close: true, reason: 'max_budget', voluntary_close_allowed: false });
      await expect(orchestrator.runBoardRound(run, { to: 'all', message: 'Another open round.' })).rejects.toThrow(/forced close/i);
      await expect(orchestrator.endDeliberation(run, result)).resolves.toMatchObject({
        Revenue: expect.any(String),
        Contrarian: expect.any(String),
      });
      const sessionPath = join(run.sessionPath, 'session.json');
      const checkpoint = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
      checkpoint.created_at = new Date(Date.now() - 101 * 60 * 1000).toISOString();
      await writeFile(sessionPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
      await orchestrator.writeCEOConclusion(run, result, 'Proceed with the acquisition.');

      const conversation = (await readFile(join(run.sessionPath, 'conversation.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const meetingEnd = conversation.find((record) => record.type === 'meeting_end');
      expect(meetingEnd?.elapsed_minutes).toBeGreaterThan(100);
      expect(meetingEnd?.total_cost).toBeGreaterThan(0.25);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('finishes an active round that crosses max_time, then forces final closing', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-max-time-crossing-'));
    let promptsStarted = 0;

    try {
      const run = await createRun(projectRoot, {
        briefName: 'maximum-time-review',
        briefContent: '# Brief\n\n## Situation\nAn active round crosses max_time.',
        boardMembers: ['Revenue'],
        constraints: { min_time_minutes: 0, max_time_minutes: 5, min_budget: 0, max_budget: 10_000 },
      });
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new class extends ScriptedPiAgentClient {
            async prompt(text: string) {
              promptsStarted += 1;
              const sessionPath = join(run.sessionPath, 'session.json');
              const checkpoint = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
              checkpoint.created_at = new Date(Date.now() - 6 * 60 * 1000).toISOString();
              await writeFile(sessionPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
              await super.prompt(text);
            }
          }({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      const result = await orchestrator.runBoardRound(run, { to: 'all', message: 'Finish this active round.' });

      expect(promptsStarted).toBe(1);
      expect(result.participantStatuses.Revenue).toBe('COMPLETED');
      expect(result.constraint).toMatchObject({ forced_close: true, reason: 'max_time', voluntary_close_allowed: false });
      await expect(orchestrator.runBoardRound(run, { to: 'all', message: 'Do not start another round.' })).rejects.toThrow(/forced close/i);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('gives each member only pre-round conversation history, then exposes accepted responses next round', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-round-isolation-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'isolation-review',
        briefContent: '# Brief\n\n## Situation\nKeep rounds isolated.',
        boardMembers: ['Revenue', 'Contrarian'],
      });
      const promptsByRound: string[][] = [];
      let currentRoundPrompts: string[] = [];
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new class extends ScriptedPiAgentClient {
            async prompt(text: string) {
              currentRoundPrompts.push(text);
              await super.prompt(text);
            }
          }({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      await orchestrator.runBoardRound(run, { to: 'all', message: 'Round one instruction.' });
      promptsByRound.push(currentRoundPrompts);
      currentRoundPrompts = [];
      await orchestrator.runBoardRound(run, { to: 'all', message: 'Round two instruction.' });
      promptsByRound.push(currentRoundPrompts);

      expect(promptsByRound[0]).toHaveLength(2);
      expect(promptsByRound[0]?.every((prompt) => !prompt.includes('The board should proceed with the offer.'))).toBe(true);
      expect(promptsByRound[1]).toHaveLength(2);
      expect(promptsByRound[1]?.every((prompt) => prompt.includes('The board should proceed with the offer.'))).toBe(true);
      expect(promptsByRound[1]?.every((prompt) => prompt.includes('Round one instruction.'))).toBe(true);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('hides a current-round artifact from peers and exposes it after the barrier', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-artifact-round-isolation-'));
    const contrarianArtifactVisibility: boolean[] = [];

    try {
      const run = await createRun(projectRoot, {
        briefName: 'artifact-isolation-review',
        briefContent: '# Brief\n\n## Situation\nKeep artifacts isolated until the barrier.',
        boardMembers: ['Revenue', 'Contrarian'],
      });
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new class extends ScriptedPiAgentClient {
            async prompt(text: string) {
              if (config.agentName === 'Revenue') {
                await writeFile(join(config.cwd, 'decision.svg'), '<svg>Revenue proposal</svg>', 'utf8');
              } else {
                try {
                  const artifact = await readFile(join(config.cwd, 'decision.svg'), 'utf8');
                  contrarianArtifactVisibility.push(artifact.includes('Revenue proposal'));
                } catch {
                  contrarianArtifactVisibility.push(false);
                }
              }
              await super.prompt(text);
            }
          }({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      const firstRound = await orchestrator.runBoardRound(run, { to: 'all', message: 'Create and assess the proposal.' });
      expect(firstRound.memberResults.Revenue.error).toBeNull();
      expect(await readFile(join(run.sessionPath, 'decision.svg'), 'utf8')).toBe('<svg>Revenue proposal</svg>');
      await orchestrator.runBoardRound(run, { to: 'Contrarian', message: 'Review prior-round artifacts.' });

      expect(contrarianArtifactVisibility).toEqual([false, true]);
      expect(await readFile(join(run.sessionPath, 'decision.svg'), 'utf8')).toBe('<svg>Revenue proposal</svg>');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('does not promote an artifact created by a failed board attempt', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-failed-artifact-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'failed-artifact-review',
        briefContent: '# Brief\n\n## Situation\nA failed attempt leaves a private artifact.',
        boardMembers: ['Revenue'],
      });
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new class extends ScriptedPiAgentClient {
            async prompt() {
              await writeFile(join(config.cwd, 'failed.svg'), '<svg>partial</svg>', 'utf8');
              throw new Error('member failed after artifact write');
            }
          }({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      const result = await orchestrator.runBoardRound(run, { to: 'all', message: 'Create a draft artifact.' });

      expect(result.participantStatuses.Revenue).toBe('UNAVAILABLE');
      await expect(readFile(join(run.sessionPath, 'failed.svg'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(join(run.sessionPath, 'pi-sessions', 'revenue', 'workspace', 'failed.svg'), 'utf8'))
        .toBe('<svg>partial</svg>');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('completes the round when one member is unavailable and excludes its response', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-unavailable-member-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'partial-review',
        briefContent: '# Brief\n\n## Situation\nOne member will be unavailable.',
        boardMembers: ['Revenue', 'Contrarian'],
      });
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          if (config.agentName === 'Revenue') {
            return {
              agentName: config.agentName,
              piSessionId: config.sessionId,
              async start() { throw new Error('process exited'); },
              async prompt() { return; },
              async waitUntilSettled() { return; },
              async getLastAssistantText() { return 'Must not be accepted.'; },
              async getSessionStats() {
                return { messageCount: 0, pendingMessageCount: 0, sessionId: config.sessionId, isStreaming: false };
              },
              async setAutoRetry() { return; },
              async abort() { return; },
              onEvent() { return () => {}; },
              isHealthy() { return false; },
              async close() { return; },
            };
          }

          return new ScriptedPiAgentClient({
            agentName: config.agentName,
            piSessionId: config.sessionId,
          });
        },
      });

      const turn = await orchestrator.runBoardTurn(run, {
        Revenue: 'Analyze the acquisition case.',
        Contrarian: 'Challenge the acquisition case.',
      });
      const conversation = (await readFile(join(run.sessionPath, 'conversation.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      expect(turn.memberResults.Revenue.status).toBe('FAILED');
      expect(turn.memberResults.Revenue.output).toBeNull();
      expect(turn.memberResults.Contrarian.status).toBe('COMPLETED');
      expect(turn.outputs.Contrarian).toBe('The final argument is to keep the lower-risk path.');
      expect(conversation.some((record) => record.from === 'Revenue')).toBe(false);
      expect(conversation.some((record) => record.from === 'Contrarian')).toBe(true);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('disables Pi-native auto retry so retry ownership remains in the orchestrator', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-no-pi-retry-'));

    try {
      const retrySettings: boolean[] = [];
      const run = await createRun(projectRoot, {
        briefName: 'retry-policy',
        briefContent: '# Brief\n\n## Situation\nTest retry ownership.',
        boardMembers: ['Revenue'],
      });
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new class extends ScriptedPiAgentClient {
            async setAutoRetry(enabled: boolean) {
              retrySettings.push(enabled);
              await super.setAutoRetry(enabled);
            }
          }({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      }, { autoRetry: true });

      await orchestrator.runBoardTurn(run, { Revenue: 'Analyze the acquisition case.' });

      expect(retrySettings).toEqual([false]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('calculates per-turn cost, token, and remaining-context deltas from Pi stats', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-usage-delta-'));

    try {
      let statsRead = 0;
      const run = await createRun(projectRoot, {
        briefName: 'usage-review',
        briefContent: '# Brief\n\n## Situation\nMeasure usage.',
        boardMembers: ['Revenue'],
      });
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new class extends ScriptedPiAgentClient {
            async getSessionStats() {
              statsRead += 1;
              const afterTurn = statsRead > 1;
              return {
                messageCount: afterTurn ? 4 : 2,
                pendingMessageCount: 0,
                sessionId: config.sessionId,
                isStreaming: false,
                cost: afterTurn ? 0.75 : 0.25,
                tokens: {
                  input: afterTurn ? 120 : 50,
                  output: afterTurn ? 30 : 10,
                  cacheRead: afterTurn ? 8 : 3,
                  cacheWrite: afterTurn ? 4 : 1,
                  total: afterTurn ? 162 : 64,
                },
                contextUsage: { tokens: afterTurn ? 900 : 400, contextWindow: 1000, percent: afterTurn ? 90 : 40 },
              };
            }
          }({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      const turn = await orchestrator.runBoardTurn(run, { Revenue: 'Analyze the acquisition case.' });

      expect(turn.memberResults.Revenue.usage).toEqual({
        costDelta: 0.5,
        tokenDelta: { input: 70, output: 20, cacheRead: 5, cacheWrite: 3, total: 98 },
        remainingContextTokens: 100,
      });

      await orchestrator.writeCEOConclusion(run, turn, 'Proceed with the acquisition.');
      const sessionJson = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8'));
      expect(sessionJson.telemetry.Revenue.usage).toEqual(turn.memberResults.Revenue.usage);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('aborts a board turn after the inactivity deadline', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-inactivity-'));
    vi.useFakeTimers();

    let beginSettling: (() => void) | undefined;
    let releaseSettling: (() => void) | undefined;
    let abortCount = 0;
    const settlingStarted = new Promise<void>((resolve) => { beginSettling = resolve; });
    const run = await createRun(projectRoot, {
      briefName: 'inactivity-review',
      briefContent: '# Brief\n\n## Situation\nTest inactivity handling.',
      boardMembers: ['Revenue'],
    });
    const orchestrator = new BoardOrchestrator({
      async create(config) {
        const client: PiAgentClient = {
          agentName: config.agentName,
          piSessionId: config.sessionId,
          async start() { return; },
          async prompt() { return; },
          async waitUntilSettled() {
            beginSettling?.();
            return new Promise<void>((resolve) => { releaseSettling = resolve; });
          },
          async getLastAssistantText() { return null; },
          async getSessionStats() {
            return { messageCount: 0, pendingMessageCount: 0, sessionId: config.sessionId, isStreaming: false };
          },
          async setAutoRetry() { return; },
          async abort() { abortCount += 1; },
          onEvent() { return () => {}; },
          isHealthy() { return true; },
          async close() { return; },
        };
        return client;
      },
    });

    try {
      const turn = orchestrator.runBoardTurn(run, { Revenue: 'Analyze the acquisition case.' });
      const turnResult = expect(turn).resolves.toMatchObject({
        memberResults: {
          Revenue: { status: 'FAILED', error: expect.stringMatching(/inactivity/i) },
        },
      });
      await settlingStarted;
      await vi.advanceTimersByTimeAsync(90_001);

      expect(abortCount).toBe(1);
      await turnResult;
    } finally {
      releaseSettling?.();
      vi.useRealTimers();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('resets the inactivity deadline on message and tool activity', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-activity-reset-'));
    vi.useFakeTimers();

    let beginSettling: (() => void) | undefined;
    let releaseSettling: (() => void) | undefined;
    let abortCount = 0;
    const handlers = new Set<(event: PiAgentEvent) => void>();
    const settlingStarted = new Promise<void>((resolve) => { beginSettling = resolve; });
    const run = await createRun(projectRoot, {
      briefName: 'active-review',
      briefContent: '# Brief\n\n## Situation\nActivity should keep the turn alive.',
      boardMembers: ['Revenue'],
    });
    const orchestrator = new BoardOrchestrator({
      async create(config) {
        const client: PiAgentClient = {
          agentName: config.agentName,
          piSessionId: config.sessionId,
          async start() { return; },
          async prompt() { return; },
          async waitUntilSettled() {
            beginSettling?.();
            return new Promise<void>((resolve) => { releaseSettling = resolve; });
          },
          async getLastAssistantText() { return 'Active work completed.'; },
          async getSessionStats() {
            return { messageCount: 0, pendingMessageCount: 0, sessionId: config.sessionId, isStreaming: false };
          },
          async setAutoRetry() { return; },
          async abort() { abortCount += 1; },
          onEvent(handler) {
            handlers.add(handler);
            return () => { handlers.delete(handler); };
          },
          isHealthy() { return true; },
          async close() { return; },
        };
        return client;
      },
    }, { inactivityTimeoutMs: 100 });

    try {
      const turn = orchestrator.runBoardTurn(run, { Revenue: 'Analyze the acquisition case.' });
      const turnFinished = expect(turn).resolves.toMatchObject({ outputs: { Revenue: 'Active work completed.' } });
      await settlingStarted;
      await vi.advanceTimersByTimeAsync(80);
      handlers.forEach((handler) => handler({ type: 'message_update' }));
      await vi.advanceTimersByTimeAsync(80);
      handlers.forEach((handler) => handler({ type: 'tool_execution_start', toolName: 'read' }));
      await vi.advanceTimersByTimeAsync(80);

      expect(abortCount).toBe(0);
      releaseSettling?.();
      await turnFinished;
    } finally {
      releaseSettling?.();
      vi.useRealTimers();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('resets the inactivity deadline on lifecycle, file, and artifact activity (implementation-1.4 N6)', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-full-activity-reset-'));
    vi.useFakeTimers();

    let beginSettling: (() => void) | undefined;
    let releaseSettling: (() => void) | undefined;
    let abortCount = 0;
    const handlers = new Set<(event: PiAgentEvent) => void>();
    const settlingStarted = new Promise<void>((resolve) => { beginSettling = resolve; });
    const run = await createRun(projectRoot, {
      briefName: 'full-activity-review',
      briefContent: '# Brief\n\n## Situation\nLifecycle, file, and artifact activity should keep the turn alive.',
      boardMembers: ['Revenue'],
    });
    const orchestrator = new BoardOrchestrator({
      async create(config) {
        const client: PiAgentClient = {
          agentName: config.agentName,
          piSessionId: config.sessionId,
          async start() { return; },
          async prompt() { return; },
          async waitUntilSettled() {
            beginSettling?.();
            return new Promise<void>((resolve) => { releaseSettling = resolve; });
          },
          async getLastAssistantText() { return 'Active work completed.'; },
          async getSessionStats() {
            return { messageCount: 0, pendingMessageCount: 0, sessionId: config.sessionId, isStreaming: false };
          },
          async setAutoRetry() { return; },
          async abort() { abortCount += 1; },
          onEvent(handler) {
            handlers.add(handler);
            return () => { handlers.delete(handler); };
          },
          isHealthy() { return true; },
          async close() { return; },
        };
        return client;
      },
    }, { inactivityTimeoutMs: 100 });

    try {
      const turn = orchestrator.runBoardTurn(run, { Revenue: 'Analyze the acquisition case.' });
      await settlingStarted;
      await vi.advanceTimersByTimeAsync(80);
      handlers.forEach((handler) => handler({ type: 'lifecycle_update' }));
      await vi.advanceTimersByTimeAsync(80);
      handlers.forEach((handler) => handler({ type: 'file_change', path: 'notes.md' }));
      await vi.advanceTimersByTimeAsync(80);
      handlers.forEach((handler) => handler({ type: 'artifact_created', path: 'artifact.md' }));
      await vi.advanceTimersByTimeAsync(80);

      expect(abortCount).toBe(0);
      releaseSettling?.();
      await expect(turn).resolves.toMatchObject({ outputs: { Revenue: 'Active work completed.' } });
    } finally {
      releaseSettling?.();
      vi.useRealTimers();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('starts each member subprocess with the model from its agent frontmatter (implementation-1.4 N8)', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-agent-model-'));

    try {
      await writeFile(join(projectRoot, 'ceo-and-board-configuration.yaml'), [
        'meeting:',
        '  constraints:',
        '    min_time_minutes: 0',
        '    max_time_minutes: 60',
        '    min_budget: 1',
        '    max_budget: 25',
        '  editor: code',
        'paths:',
        '  briefs: briefs',
        '  deliberations: .pi/ceo-agents/deliberations',
        '  memos: .pi/ceo-agents/memos',
        '  agents: agents',
        'board:',
        '  - name: Revenue',
        '    path: revenue.md',
      ].join('\n'), 'utf8');
      await mkdir(join(projectRoot, 'agents'), { recursive: true });
      await writeFile(join(projectRoot, 'agents', 'revenue.md'), [
        '---',
        'name: revenue',
        'model: commandcode/deepseek/deepseek-v4-flash',
        '---',
        '',
        '## Purpose',
        'Assess revenue impact.',
      ].join('\n'), 'utf8');

      const run = await createRun(projectRoot, {
        briefName: 'model-wiring',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue'],
        boardMemberPaths: { Revenue: join(projectRoot, 'agents', 'revenue.md') },
      });
      const capturedConfigs: Array<Record<string, unknown>> = [];
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          capturedConfigs.push(config as unknown as Record<string, unknown>);
          return new ScriptedPiAgentClient({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      await orchestrator.runBoardRound(run, { to: 'all', message: 'Assess the case.' });

      expect(capturedConfigs).toHaveLength(1);
      expect(capturedConfigs[0].model).toBe('commandcode/deepseek/deepseek-v4-flash');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('persists actual Pi tool starts separately from accepted board messages', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-tool-events-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'tool-event-review',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue'],
      });

      const orchestrator = new BoardOrchestrator({
        async create(config) {
          const eventHandlers = new Set<(event: PiAgentEvent) => void>();
          const client: PiAgentClient = {
            agentName: config.agentName,
            piSessionId: config.sessionId,
            async start() { return; },
            async prompt() {
              eventHandlers.forEach((handler) => handler({ type: 'agent_start' }));
              eventHandlers.forEach((handler) => handler({ type: 'tool_execution_start', toolName: 'read' }));
              eventHandlers.forEach((handler) => handler({ type: 'tool_execution_update', toolName: 'read' }));
              eventHandlers.forEach((handler) => handler({ type: 'tool_execution_end', toolName: 'read' }));
            },
            async waitUntilSettled() { return; },
            async getLastAssistantText() { return 'Proceed with the offer.'; },
            async getSessionStats() {
              return { messageCount: 1, pendingMessageCount: 0, sessionId: config.sessionId, isStreaming: false };
            },
            async setAutoRetry() { return; },
            async abort() { return; },
            onEvent(handler) {
              eventHandlers.add(handler);
              return () => { eventHandlers.delete(handler); };
            },
            isHealthy() { return true; },
            async close() { return; },
          };

          return client;
        },
      });

      await orchestrator.runBoardTurn(run, { Revenue: 'Analyze the acquisition case.' });

      const conversation = (await readFile(join(run.sessionPath, 'conversation.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const toolUse = (await readFile(join(run.sessionPath, 'tool-use.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      expect(conversation).toHaveLength(2);
      expect(conversation[1]).toEqual({ from: 'Revenue', to: 'all', message: 'Proceed with the offer.' });
      expect(toolUse).toHaveLength(1);
      expect(toolUse[0]).toMatchObject({ agent: 'Revenue', tool_name: 'read' });
      expect(toolUse[0]?.timestamp).toEqual(expect.any(String));
      expect(toolUse[0]).not.toHaveProperty('args');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('writes a final memo after the CEO synthesis round', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-synthesis-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'acquisition-decision',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue', 'Contrarian'],
      });

      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new ScriptedPiAgentClient({
            agentName: config.agentName,
            piSessionId: config.sessionId,
          });
        },
      });
      const turn = await orchestrator.runBoardTurn(run, {
        Revenue: 'Analyze the acquisition case.',
        Contrarian: 'We should take the lower-risk path.',
      });

      const memo = await orchestrator.writeCEOConclusion(run, turn, 'The board should proceed with the offer.');

      const sessionJson = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8'));

      expect(memo).toContain('The board should proceed with the offer.');
      expect(await readFile(run.memoPath, 'utf8')).toContain('The board should proceed with the offer.');
      expect(sessionJson.board.Revenue.status).toBe('COMPLETED');
      expect(sessionJson.board.Contrarian.status).toBe('COMPLETED');
      expect(sessionJson.board.Revenue.last_output).toBe('The board should proceed with the offer.');
      expect(sessionJson.board.Contrarian.last_output).toBe('The final argument is to keep the lower-risk path.');
      expect(sessionJson.ceo_conclusion).toBe('The board should proceed with the offer.');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('synthesizes the CEO conclusion through a dedicated CEO adapter session when no direct conclusion is provided', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-ceo-synthesis-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'acquisition-decision',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue', 'Contrarian'],
      });

      const createdCEOEvents: Array<{ agentName: string; sessionId: string; sessionDir: string }> = [];
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          if (config.agentName === 'CEO') {
            createdCEOEvents.push({
              agentName: config.agentName,
              sessionId: config.sessionId,
              sessionDir: config.sessionDir,
            });
            return new ScriptedPiAgentClient({
              agentName: config.agentName,
              piSessionId: config.sessionId,
            });
          }

          return new ScriptedPiAgentClient({
            agentName: config.agentName,
            piSessionId: config.sessionId,
          });
        },
      });

      const turn = await orchestrator.runBoardTurn(run, {
        Revenue: 'Analyze the acquisition case.',
        Contrarian: 'We should take the lower-risk path.',
      });

      const memo = await orchestrator.writeCEOConclusion(run, turn);

      const createdCEO = createdCEOEvents[0];
      expect(createdCEO).toBeDefined();
      if (!createdCEO) {
        throw new Error('The CEO session was not created.');
      }

      expect(createdCEO.sessionId).toBe(`${run.sessionId}.ceo`);
      expect(createdCEO.sessionDir).toContain(`${run.sessionName}/pi-sessions/ceo`);
      expect(memo).toContain('The board should proceed with the offer.');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('retries a bad CEO memo once and fails the run on a second invalid synthesis', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-invalid-memo-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'risk-review',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue'],
      });

      let ceoAttempts = 0;
      const ceoPrompts: string[] = [];
      const factory: PiAgentClientFactory = {
        async create(config) {
          if (config.agentName !== 'CEO') {
            return new ScriptedPiAgentClient({
              agentName: config.agentName,
              piSessionId: config.sessionId,
            });
          }

          ceoAttempts += 1;
          return {
            agentName: config.agentName,
            piSessionId: config.sessionId,
            async start() { return; },
            async prompt(prompt: string) { ceoPrompts.push(prompt); },
            async waitUntilSettled() { return; },
            async getLastAssistantText() {
              return ceoAttempts === 1 ? '' : 'The board should proceed with the offer.';
            },
            async getSessionStats() {
              return { messageCount: ceoAttempts, pendingMessageCount: 0, sessionId: config.sessionId, isStreaming: false };
            },
            async setAutoRetry() { return; },
            async abort() { return; },
            onEvent() { return () => {}; },
            isHealthy() { return true; },
            async close() { return; },
          } as any;
        },
      };

      const turn = await new BoardOrchestrator(factory, { autoRetry: true }).runBoardTurn(run, {
        Revenue: 'Analyze the acquisition case.',
      });

      const memo = await new BoardOrchestrator(factory, { autoRetry: true }).writeCEOConclusion(run, turn, '');

      expect(ceoAttempts).toBe(2);
      expect(ceoPrompts[1]).toMatch(/Final Decision.*non-empty/i);
      expect(memo).toContain('## Final Decision');
      expect(memo).toContain('The board should proceed with the offer.');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('asks the CEO for decision text only and retries heading contamination with validator feedback', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-heading-retry-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'heading-retry-review',
        briefContent: '# Brief\n\n## Situation\nThe CEO response must fit the decision section.',
        boardMembers: ['Revenue'],
      });
      const turn = await new BoardOrchestrator({
        async create(config) {
          return new ScriptedPiAgentClient({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      }).runBoardTurn(run, { Revenue: 'Analyze the acquisition.' });

      const ceoPrompts: string[] = [];
      let ceoResponses = 0;
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return {
            agentName: config.agentName,
            piSessionId: config.sessionId,
            async start() { return; },
            async prompt(prompt: string) { ceoPrompts.push(prompt); },
            async waitUntilSettled() { return; },
            async getLastAssistantText() {
              ceoResponses += 1;
              return ceoResponses === 1
                ? '## Final Decision\nProceed.\n\n## Ranked Recommendations\n1. Proceed.'
                : 'Proceed after confirming integration readiness.';
            },
            async getSessionStats() {
              return { messageCount: ceoResponses, pendingMessageCount: 0, sessionId: config.sessionId, isStreaming: false };
            },
            async setAutoRetry() { return; },
            async abort() { return; },
            onEvent() { return () => {}; },
            isHealthy() { return true; },
            async close() { return; },
          };
        },
      }, { autoRetry: true });

      const memo = await orchestrator.writeCEOConclusion(run, turn);

      expect(ceoResponses).toBe(2);
      expect(ceoPrompts[0]).toMatch(/only the text for the Final Decision section/i);
      expect(ceoPrompts[0]).toMatch(/do not include.*heading|no Markdown headings/i);
      expect(ceoPrompts[1]).toMatch(/exactly once/i);
      expect(memo.match(/^## Final Decision$/gm)).toHaveLength(1);
      expect(memo).toContain('Proceed after confirming integration readiness.');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('preserves accepted final statements and the partial memo when both synthesis attempts fail', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-final-memo-failure-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'memo-failure-review',
        briefContent: '# Brief\n\n## Situation\nFinal statements survive memo failure.',
        boardMembers: ['Revenue'],
      });
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          if (config.agentName === 'CEO') {
            return {
              agentName: config.agentName,
              piSessionId: config.sessionId,
              async start() { return; },
              async prompt() { return; },
              async waitUntilSettled() { return; },
              async getLastAssistantText() { return ''; },
              async getSessionStats() {
                return { messageCount: 1, pendingMessageCount: 0, sessionId: config.sessionId, isStreaming: false };
              },
              async setAutoRetry() { return; },
              async abort() { return; },
              onEvent() { return () => {}; },
              isHealthy() { return true; },
              async close() { return; },
            };
          }
          return new ScriptedPiAgentClient({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      }, { autoRetry: true });
      const turn = await orchestrator.runBoardTurn(run, { Revenue: 'Analyze the acquisition.' });
      const finalStatements = await orchestrator.endDeliberation(run, turn);

      await expect(orchestrator.writeCEOConclusion(run, turn, '')).rejects.toThrow(/failed after two attempts/i);

      const conversation = (await readFile(join(run.sessionPath, 'conversation.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const checkpoint = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8')) as Record<string, any>;
      const memo = await readFile(run.memoPath, 'utf8');

      expect(finalStatements.Revenue).toBeTruthy();
      expect(conversation.some((record) => record.from === 'Revenue' && record.message === finalStatements.Revenue)).toBe(true);
      expect(checkpoint.lifecycle_state).toBe('FAILED');
      expect(memo).toContain('session_id:');
      expect(memo).toContain('## Final Decision');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('persists board telemetry for the current run state', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-telemetry-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'risk-review',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue', 'Contrarian'],
      });

      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new ScriptedPiAgentClient({
            agentName: config.agentName,
            piSessionId: config.sessionId,
          });
        },
      });

      const turn = await orchestrator.runBoardTurn(run, {
        Revenue: 'Analyze the acquisition case.',
        Contrarian: 'We should take the lower-risk path.',
      });

      await orchestrator.writeCEOConclusion(run, turn, 'The board should proceed with the offer.');

      const sessionJson = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8'));

      expect(sessionJson.telemetry).toBeDefined();
      expect(sessionJson.telemetry.Revenue.status).toBe('COMPLETED');
      expect(sessionJson.telemetry.Revenue.response_count).toBe(1);
      expect(sessionJson.telemetry.Revenue.usage).toEqual({
        costDelta: null,
        tokenDelta: null,
        remainingContextTokens: null,
      });
      expect(sessionJson.telemetry.Contrarian.status).toBe('COMPLETED');
      expect(sessionJson.telemetry.Contrarian.response_count).toBe(1);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('collects final statements from each board member before synthesis', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-final-statements-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'closeout-review',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue', 'Contrarian'],
      });

      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new ScriptedPiAgentClient({
            agentName: config.agentName,
            piSessionId: config.sessionId,
          });
        },
      });

      const turn = await orchestrator.runBoardTurn(run, {
        Revenue: 'Analyze the acquisition case.',
        Contrarian: 'We should take the lower-risk path.',
      });

      const finalStatements = await orchestrator.endDeliberation(run, turn, {
        Revenue: 'Final position: proceed.',
        Contrarian: 'Final position: guardrail the risk.',
      });

      expect(finalStatements.Revenue).toContain('Final position: proceed.');
      expect(finalStatements.Contrarian).toContain('Final position: guardrail the risk.');
      const conversation = (await readFile(join(run.sessionPath, 'conversation.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(conversation.slice(-2)).toEqual([
        { from: 'Revenue', to: 'all', message: 'Final position: proceed.' },
        { from: 'Contrarian', to: 'all', message: 'Final position: guardrail the risk.' },
      ]);
      const sessionJson = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8'));
      expect(sessionJson.lifecycle_state).toBe('FINAL_CLOSING');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('executes final statements for available members, retries once, and skips unavailable members', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-final-execution-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'final-execution-review',
        briefContent: '# Brief\n\n## Situation\nCollect real final statements.',
        boardMembers: ['Revenue', 'Contrarian', 'Ops'],
      });
      const firstOrchestrator = new BoardOrchestrator({
        async create(config) {
          return new ScriptedPiAgentClient({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });
      const turn = await firstOrchestrator.runBoardTurn(run, {
        Revenue: 'Initial analysis.',
        Contrarian: 'Initial challenge.',
        Ops: 'Initial operations analysis.',
      });
      const sessionPath = join(run.sessionPath, 'session.json');
      const checkpoint = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;
      checkpoint.created_at = new Date(Date.now() - 61 * 60 * 1000).toISOString();
      checkpoint.board.Ops.status = 'UNAVAILABLE';
      await writeFile(sessionPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');

      const created: string[] = [];
      let revenueAttempts = 0;
      let synthesisPrompt = '';
      const closingOrchestrator = new BoardOrchestrator({
        async create(config) {
          if (config.agentName === 'CEO') {
            return new class extends ScriptedPiAgentClient {
              async prompt(text: string) {
                synthesisPrompt = text;
                await super.prompt(text);
              }
            }({ agentName: config.agentName, piSessionId: config.sessionId });
          }
          created.push(config.agentName);
          return new class extends ScriptedPiAgentClient {
            async prompt(text: string) {
              if (config.agentName === 'Revenue') {
                revenueAttempts += 1;
                if (revenueAttempts === 1) {
                  throw new Error('temporary closeout failure');
                }
              }
              await super.prompt(text);
            }
          }({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      const finalStatements = await closingOrchestrator.endDeliberation(run, turn);
      const finalConversation = (await readFile(join(run.sessionPath, 'conversation.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((record) => record.from === 'Revenue' || record.from === 'Contrarian' || record.from === 'Ops')
        .slice(-2);
      const finalCheckpoint = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, any>;

      expect(revenueAttempts).toBe(2);
      expect([...created].sort()).toEqual(['Contrarian', 'Revenue', 'Revenue']);
      expect(finalStatements.Revenue).toBeTruthy();
      expect(finalStatements.Contrarian).toBeTruthy();
      expect(finalStatements.Ops).toBeUndefined();
      expect(finalConversation.map((record) => record.from)).toEqual(['Revenue', 'Contrarian']);
      expect(finalCheckpoint.board.Ops.status).toBe('UNAVAILABLE');
      expect(finalCheckpoint.final_statements.Ops).toBeUndefined();
      await closingOrchestrator.synthesizeCEOConclusion(run, turn);
      expect(synthesisPrompt.indexOf('Contrarian:')).toBeGreaterThan(synthesisPrompt.indexOf('Revenue:'));
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('runs the final close-through-synthesis handoff for a forced-close board turn', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-final-close-handoff-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'forced-close-review',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue', 'Contrarian'],
      });

      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new ScriptedPiAgentClient({
            agentName: config.agentName,
            piSessionId: config.sessionId,
          });
        },
      });

      const turn = await orchestrator.runBoardTurn(run, {
        Revenue: 'Analyze the acquisition case.',
        Contrarian: 'We should take the lower-risk path.',
      });

      const outcome = await orchestrator.finalizeRun(run, turn, {
        Revenue: 'Final position: proceed with the offer.',
        Contrarian: 'Final position: protect downside until market data arrives.',
      });

      expect(outcome.memo).toContain('The board should proceed with the offer.');
      expect(outcome.finalStatements.Revenue).toContain('Final position: proceed with the offer.');

      const sessionJson = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8'));
      expect(sessionJson.lifecycle_state).toBe('COMPLETED');
      expect(sessionJson.round_state).toBe('CEO_SYNTHESIS_COMPLETE');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('marks an unhealthy member as failed and retries once in the same session', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-retry-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'risk-review',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue'],
      });

      let attempts = 0;
      const retryConfigs: Array<{ sessionId: string; sessionDir: string }> = [];
      const factory: PiAgentClientFactory = {
        async create(config) {
          attempts += 1;
          retryConfigs.push({ sessionId: config.sessionId, sessionDir: config.sessionDir });
          if (attempts === 1) {
            return {
              agentName: config.agentName,
              piSessionId: config.sessionId,
              async start() {
                throw new Error('member unhealthy');
              },
              async prompt() { return; },
              async waitUntilSettled() { return; },
              async getLastAssistantText() { return null; },
              async getSessionStats() { return { messageCount: 0, pendingMessageCount: 0, sessionId: config.sessionId, isStreaming: false }; },
              async setAutoRetry() { return; },
              async abort() { return; },
              onEvent() { return () => {}; },
              isHealthy() { return false; },
              async close() { return; },
            } as any;
          }

          return new ScriptedPiAgentClient({
            agentName: config.agentName,
            piSessionId: config.sessionId,
          });
        },
      };

      const orchestrator = new BoardOrchestrator(factory, { autoRetry: true });
      const result = await orchestrator.runBoardTurn(run, {
        Revenue: 'Analyze the acquisition case.',
      });

      expect(result.memberResults.Revenue.healthy).toBe(true);
      expect(result.memberResults.Revenue.status).toBe('COMPLETED');
      expect(result.memberResults.Revenue.attempts).toBe(2);
      expect(result.outputs.Revenue).toBe('The board should proceed with the offer.');
      expect(attempts).toBe(2);
      expect(retryConfigs).toEqual([
        { sessionId: `${run.sessionId}.revenue`, sessionDir: join(run.sessionPath, 'pi-sessions', 'revenue') },
        { sessionId: `${run.sessionId}.revenue`, sessionDir: join(run.sessionPath, 'pi-sessions', 'revenue') },
      ]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
