import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RpcPiAgentClient, ScriptedPiAgentClient, type PiAgentClient } from '../src/pi.js';

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

  it('starts replacement RPC clients with the same persisted Pi session', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-pi-restart-'));
    const cliPath = join(projectRoot, 'fake-pi-cli.js');
    const argsPath = join(projectRoot, 'startup-args.jsonl');

    try {
      await writeFile(cliPath, [
        "import { appendFileSync } from 'node:fs';",
        `appendFileSync(${JSON.stringify(argsPath)}, JSON.stringify(process.argv.slice(2)) + '\\n');`,
        "process.stdin.setEncoding('utf8');",
        "process.stdin.on('data', (chunk) => {",
        "  for (const line of chunk.split('\\n')) {",
        "    if (!line) continue;",
        "    const request = JSON.parse(line);",
        "    if (request.type === 'get_state') {",
        "      process.stdout.write(JSON.stringify({ type: 'response', id: request.id, command: request.type, success: true, data: { state: {} } }) + '\\n');",
        "    }",
        "  }",
        '});',
      ].join('\n'), 'utf8');

      const startConfig = {
        agentName: 'Revenue',
        sessionId: 'run-session.member-revenue',
        sessionDir: join(projectRoot, 'pi-sessions', 'revenue'),
        cwd: projectRoot,
        autoRetry: false,
      };
      const startReplacement = async () => {
        const client = new RpcPiAgentClient({
          agentName: startConfig.agentName,
          piSessionId: startConfig.sessionId,
          cwd: projectRoot,
          cliPath,
            sessionDir: startConfig.sessionDir,
        });
        await client.start(startConfig);
        await client.close();
      };

      await startReplacement();
      await startReplacement();

      const launches = (await readFile(argsPath, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as string[]);
      expect(launches).toHaveLength(2);
      for (const args of launches) {
        expect(args).toContain('--session-id');
        expect(args[args.indexOf('--session-id') + 1]).toBe(startConfig.sessionId);
        expect(args).toContain('--session-dir');
        expect(args[args.indexOf('--session-dir') + 1]).toBe(startConfig.sessionDir);
      }
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
