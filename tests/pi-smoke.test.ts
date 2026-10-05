import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RpcPiAgentClient } from '../src/pi.js';
import { BoardOrchestrator } from '../src/orchestrator.js';
import { createRun } from '../src/run.js';

const runRealPiSmoke = process.env.CEO_BOARD_REAL_PI_SMOKE === '1';
const smokeModel = process.env.CEO_BOARD_PI_MODEL;

describe.skipIf(!runRealPiSmoke)('real Pi RPC smoke', () => {
  it('runs one CEO and one board member through two turns, artifact, synthesis, and session replacement', async () => {
    if (!smokeModel) {
      throw new Error('Set CEO_BOARD_PI_MODEL to a Pi-supported configured model before running the opt-in Pi smoke.');
    }

    const root = await mkdtemp(join(tmpdir(), 'ceo-board-real-pi-smoke-'));
    const run = await createRun(root, {
      briefName: 'real-pi-smoke',
      briefContent: '# Real Pi smoke\n\n## Situation\nVerify one CEO and one board member can complete a decision.',
      boardMembers: ['Revenue'],
    });
    const clients = new Map<string, RpcPiAgentClient>();
    const configs = new Map<string, Parameters<RpcPiAgentClient['start']>[0]>();
    const observedEvents: string[] = [];
    const orchestrator = new BoardOrchestrator({
      async create(config) {
        const client = new RpcPiAgentClient({
          agentName: config.agentName,
          piSessionId: config.sessionId,
          cwd: config.cwd,
          sessionDir: config.sessionDir,
          model: smokeModel,
        });
        clients.set(config.agentName, client);
        configs.set(config.agentName, config);
        client.onEvent((event) => observedEvents.push(`${config.agentName}:${event.type}`));
        return client;
      },
    }, { cwd: root, autoRetry: true, inactivityTimeoutMs: 300_000 });

    try {
      const firstRound = await orchestrator.runBoardRound(run, {
        to: 'all',
        message: [
          'Use the write tool to create smoke-artifact.txt in your current workspace with exactly this text: Pi artifact smoke passed.',
          'After writing it, provide a concise recommendation and confirm the artifact exists.',
        ].join('\n'),
      });
      expect(firstRound.participantStatuses.Revenue).toBe('COMPLETED');
      expect(firstRound.outputs.Revenue).toBeTruthy();
      const firstStats = await clients.get('Revenue')?.getSessionStats();
      expect(firstStats).toBeDefined();

      const secondRound = await orchestrator.runBoardRound(run, {
        to: 'Revenue',
        message: 'Review your prior recommendation and the promoted smoke-artifact.txt; add one final risk observation.',
      });
      expect(secondRound.participantStatuses.Revenue).toBe('COMPLETED');
      const secondStats = await clients.get('Revenue')?.getSessionStats();
      expect(secondStats).toBeDefined();
      expect(secondStats!.messageCount).toBeGreaterThan(firstStats!.messageCount);

      const finalStatements = await orchestrator.endDeliberation(run, secondRound);
      expect(finalStatements.Revenue).toBeTruthy();
      const memo = await orchestrator.writeCEOConclusion(run, secondRound);
      expect(memo).toContain('## Final Decision');
      await orchestrator.closeRun(run);

      const artifactPath = join(run.sessionPath, 'smoke-artifact.txt');
      expect(await readFile(artifactPath, 'utf8')).toBe('Pi artifact smoke passed.');
      expect(observedEvents).toContain('Revenue:tool_execution_start');
      const toolUseLog = await readFile(join(run.sessionPath, 'tool-use.jsonl'), 'utf8');
      expect(toolUseLog).toContain('"tool_name":"write"');
      expect(clients.has('CEO')).toBe(true);

      const memberConfig = configs.get('Revenue');
      if (!memberConfig) {
        throw new Error('The board member Pi session configuration was not captured.');
      }
      const replacement = new RpcPiAgentClient({
        agentName: 'Revenue',
        piSessionId: memberConfig.sessionId,
        cwd: memberConfig.cwd,
        sessionDir: memberConfig.sessionDir,
        model: smokeModel,
      });
      await replacement.start(memberConfig);
      const replacementStats = await replacement.getSessionStats();
      expect(replacementStats.sessionId).toBe(memberConfig.sessionId);
      expect(replacementStats.messageCount).toBeGreaterThanOrEqual(secondStats!.messageCount);
      await replacement.close();
    } finally {
      await orchestrator.closeRun(run);
      await rm(root, { recursive: true, force: true });
    }
  }, 300_000);
});