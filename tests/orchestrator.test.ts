import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ScriptedPiAgentClient, type PiAgentClientFactory } from '../src/pi.js';
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

  it('marks an unhealthy member as failed and retries once in the same session', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-retry-'));

    try {
      const run = await createRun(projectRoot, {
        briefName: 'risk-review',
        briefContent: '# Brief\n\n## Situation\nTest',
        boardMembers: ['Revenue'],
      });

      let attempts = 0;
      const factory: PiAgentClientFactory = {
        async create(config) {
          attempts += 1;
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
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
