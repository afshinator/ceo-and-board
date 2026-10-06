import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runBoardLifecycle } from '../src/controller.js';
import { runBoardFromBrief } from '../src/cli.js';
import { BoardOrchestrator } from '../src/orchestrator.js';
import { ScriptedPiAgentClient } from '../src/pi.js';
import { createRun } from '../src/run.js';

describe('board lifecycle controller', () => {
  it('runs multiple rounds through final closing and validated synthesis', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-controller-normal-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'multi-round-decision',
        briefContent: '# Brief\n\n## Situation\nComplete a normal multi-round lifecycle.',
        boardMembers: ['Revenue', 'Contrarian'],
      });
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new ScriptedPiAgentClient({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      const result = await runBoardLifecycle(run, orchestrator, {
        roundRequests: [
          { to: 'all', message: 'Round one: make an initial recommendation.' },
          { to: 'all', message: 'Round two: address the strongest disagreement.' },
        ],
      });
      const checkpoint = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8')) as Record<string, any>;
      const conversation = (await readFile(join(run.sessionPath, 'conversation.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      expect(result.status).toBe('COMPLETED');
      expect(result.rounds).toBe(2);
      expect(result.finalStatements.Revenue).toBeTruthy();
      expect(result.finalStatements.Contrarian).toBeTruthy();
      expect(result.memo).toContain('## Final Decision');
      expect(checkpoint.lifecycle_state).toBe('COMPLETED');
      expect(conversation.some((record) => record.from === 'CEO' && record.message === 'Round two: address the strongest disagreement.')).toBe(true);
      expect(conversation.at(-1)?.type).toBe('meeting_end');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('stops at forced close after the active round and does not start queued rounds', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-controller-forced-'));
    let promptsStarted = 0;

    try {
      const run = await createRun(projectRoot, {
        briefName: 'forced-close-decision',
        briefContent: '# Brief\n\n## Situation\nFinish the active round after budget is crossed.',
        boardMembers: ['Revenue'],
        constraints: { min_time_minutes: 0, max_time_minutes: 60, min_budget: 500, max_budget: 0.25 },
      });
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new class extends ScriptedPiAgentClient {
            async prompt(text: string) {
              promptsStarted += 1;
              await super.prompt(text);
            }

            async getSessionStats() {
              const current = await super.getSessionStats();
              return { ...current, cost: current.messageCount === 0 ? 0 : 0.5 };
            }
          }({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      const result = await runBoardLifecycle(run, orchestrator, {
        roundRequests: [
          { to: 'all', message: 'Active round crosses the budget.' },
          { to: 'all', message: 'This must not execute.' },
        ],
      });
      const checkpoint = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8')) as Record<string, any>;

      expect(promptsStarted).toBe(3);
      expect(result.rounds).toBe(1);
      expect(checkpoint.forced_close).toMatchObject({ active: true, reason: 'max_budget' });
      expect(checkpoint.lifecycle_state).toBe('COMPLETED');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('leaves an eligible multi-round run open when the CEO has no next action before min_time', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-controller-minimum-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'minimum-time-decision',
        briefContent: '# Brief\n\n## Situation\nKeep the run open until minimum time.',
        boardMembers: ['Revenue'],
        constraints: { min_time_minutes: 30, max_time_minutes: 60, min_budget: 1000, max_budget: 5000 },
      });
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          return new ScriptedPiAgentClient({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      await expect(runBoardLifecycle(run, orchestrator, {
        roundRequests: [{ to: 'all', message: 'Make the initial recommendation.' }],
      })).rejects.toThrow(/min_time/i);
      const checkpoint = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8')) as Record<string, any>;
      expect(checkpoint.lifecycle_state).toBe('DELIBERATING');
      expect(checkpoint.status).toBe('RUNNING');
      expect(checkpoint.round_state).toBe('IDLE');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('marks an unrecoverable synthesis failure as FAILED and releases no accepted final history', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-controller-failure-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'failed-decision',
        briefContent: '# Brief\n\n## Situation\nThe CEO cannot produce a valid decision.',
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
      });

      await expect(runBoardLifecycle(run, orchestrator, {
        roundRequests: [{ to: 'all', message: 'Initial round.' }],
      })).rejects.toThrow(/synthesis failed/i);
      const checkpoint = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8')) as Record<string, any>;

      expect(checkpoint.lifecycle_state).toBe('FAILED');
      expect(checkpoint.round_state).toBe('IDLE');
      expect(checkpoint.final_statements.Revenue).toBeTruthy();
      expect(await readFile(run.memoPath, 'utf8')).toContain('session_id:');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('recovers a stale interrupted-run lock before starting a new controlled lifecycle', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-controller-stale-lock-'));

    try {
      const interruptedRun = await createRun(projectRoot, {
        briefName: 'interrupted-run',
        briefContent: '# Brief\n\n## Situation\nThis run was interrupted.',
        boardMembers: ['Revenue'],
      });
      await writeFile(interruptedRun.lockPath, `${JSON.stringify({
        owner: 'dead-controller',
        pid: 2_147_483_647,
        acquired_at: new Date().toISOString(),
        session_name: interruptedRun.sessionName,
      })}\n`, 'utf8');

      const result = await runBoardFromBrief(projectRoot, {
        briefName: 'replacement-run',
        briefContent: '# Brief\n\n## Situation\nA replacement run should complete.',
        boardMembers: ['Revenue'],
        factory: {
          async create(config) {
            return new ScriptedPiAgentClient({ agentName: config.agentName, piSessionId: config.sessionId });
          },
        },
      });
      const interruptedCheckpoint = JSON.parse(await readFile(join(interruptedRun.sessionPath, 'session.json'), 'utf8')) as Record<string, any>;

      expect(interruptedCheckpoint.lifecycle_state).toBe('FAILED');
      expect(interruptedCheckpoint.failure_reason).toBe('interrupted');
      expect(result.status).toBe('COMPLETED');
      await expect(readFile(interruptedRun.lockPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('recovers from a transient CEO process failure and completes synthesis', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-controller-ceo-retry-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'ceo-retry-run',
        briefContent: '# Brief\n\n## Situation\nCEO should recover once.',
        boardMembers: ['Revenue'],
      });
      let ceoStarts = 0;
      const orchestrator = new BoardOrchestrator({
        async create(config) {
          if (config.agentName !== 'CEO') {
            return new ScriptedPiAgentClient({ agentName: config.agentName, piSessionId: config.sessionId });
          }
          ceoStarts += 1;
          if (ceoStarts === 1) {
            return {
              agentName: config.agentName,
              piSessionId: config.sessionId,
              async start() { throw new Error('transient CEO process failure'); },
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
          return new ScriptedPiAgentClient({ agentName: config.agentName, piSessionId: config.sessionId });
        },
      });

      const result = await runBoardLifecycle(run, orchestrator, {
        roundRequests: [{ to: 'all', message: 'Initial board round.' }],
      });
      const checkpoint = JSON.parse(await readFile(join(run.sessionPath, 'session.json'), 'utf8')) as Record<string, any>;

      expect(ceoStarts).toBe(2);
      expect(result.status).toBe('COMPLETED');
      expect(checkpoint.lifecycle_state).toBe('COMPLETED');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
