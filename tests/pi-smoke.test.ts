import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RpcPiAgentClient } from '../src/pi.js';

const runRealPiSmoke = process.env.CEO_BOARD_REAL_PI_SMOKE === '1';
const smokeModel = process.env.CEO_BOARD_PI_MODEL;

describe.skipIf(!runRealPiSmoke)('real Pi RPC smoke', () => {
  it('runs one prompt, reads stats, and reopens the persistent session', async () => {
    if (!smokeModel) {
      throw new Error('Set CEO_BOARD_PI_MODEL to a Pi-supported configured model before running the opt-in Pi smoke.');
    }

    const root = await mkdtemp(join(tmpdir(), 'ceo-board-real-pi-smoke-'));
    const sessionDir = join(root, 'session');
    const sessionId = `smoke-${Date.now().toString(36)}`;
    const config = {
      agentName: 'Smoke',
      sessionId,
      sessionDir,
      cwd: root,
      autoRetry: false,
    };

    const startClient = () => new RpcPiAgentClient({
      agentName: config.agentName,
      piSessionId: sessionId,
      cwd: root,
      sessionDir,
      model: smokeModel,
    });

    try {
      const first = startClient();
      await first.start(config);
      await first.setAutoRetry(false);
      await first.prompt('Reply with exactly: CEO board smoke passed.');
      await first.waitUntilSettled();
      const firstResponse = await first.getLastAssistantText();
      const firstStats = await first.getSessionStats();
      await first.prompt('Now reply with exactly: second turn persisted.');
      await first.waitUntilSettled();
      const secondResponse = await first.getLastAssistantText();
      const secondStats = await first.getSessionStats();
      await first.close();

      expect(firstResponse?.trim()).toContain('CEO board smoke passed.');
      expect(secondResponse?.trim()).toContain('second turn persisted.');
      expect(secondStats.sessionId).toBe(sessionId);
      expect(secondStats.messageCount).toBeGreaterThan(firstStats.messageCount);

      const replacement = startClient();
      await replacement.start(config);
      const replacementStats = await replacement.getSessionStats();
      expect(replacementStats.sessionId).toBe(sessionId);
      expect(replacementStats.messageCount).toBeGreaterThanOrEqual(secondStats.messageCount);
      await replacement.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 180_000);
});