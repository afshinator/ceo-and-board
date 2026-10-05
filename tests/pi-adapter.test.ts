import { describe, expect, it } from 'vitest';

import { ScriptedPiAgentClient, type PiAgentClient } from '../src/pi.js';

describe('pi adapter contract', () => {
  it('tracks a full prompt lifecycle and resolves once the agent settles', async () => {
    const client: PiAgentClient = new ScriptedPiAgentClient({
      agentName: 'Revenue',
      piSessionId: 'session-demo-1',
    });

    const seen: string[] = [];
    const unsubscribe = client.onEvent((event) => {
      seen.push(String(event.type));
    });

    await client.start({
      agentName: 'Revenue',
      sessionId: 'session-demo-1',
      sessionDir: '/tmp/ceo-board-demo',
      cwd: process.cwd(),
      autoRetry: false,
    });

    await client.prompt('Analyze the acquisition case.');
    await client.waitUntilSettled();

    expect(seen).toContain('agent_settled');
    expect(await client.getLastAssistantText()).toBe('The board should proceed with the offer.');

    unsubscribe();
    await client.close();
  });

  it('supports a second prompt in the same run-scoped session', async () => {
    const client = new ScriptedPiAgentClient({
      agentName: 'Contrarian',
      piSessionId: 'session-demo-2',
    });

    await client.start({
      agentName: 'Contrarian',
      sessionId: 'session-demo-2',
      sessionDir: '/tmp/ceo-board-demo',
      cwd: process.cwd(),
      autoRetry: false,
    });

    await client.prompt('We should take the lower-risk path.');
    await client.waitUntilSettled();
    await client.prompt('Now provide the final argument.');
    await client.waitUntilSettled();

    expect(await client.getLastAssistantText()).toBe('The final argument is to keep the lower-risk path.');
    await client.close();
  });
});
