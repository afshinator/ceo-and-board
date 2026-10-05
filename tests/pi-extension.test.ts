import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { registerCeoBoardExtension } from '../src/pi/extension.js';
import { ScriptedPiAgentClient } from '../src/pi.js';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

describe('Pi CEO–Board extension', () => {
  it('starts a validated run with /ceo-begin and supports CEO converse/end tools', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-pi-extension-'));
    const configPath = join(projectRoot, 'ceo-and-board-configuration.yaml');
    const briefPath = join(projectRoot, '.pi', 'ceo-agents', 'briefs', 'acquisition', 'brief.md');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(join(projectRoot, '.pi', 'ceo-agents', 'briefs', 'acquisition'), { recursive: true }));
    await writeFile(configPath, [
      'meeting:',
      '  constraints:',
      '    min_time_minutes: 0',
      '    max_time_minutes: 60',
      '    min_budget: 1',
      '    max_budget: 25',
      '  editor: code',
      'paths:',
      '  briefs: .pi/ceo-agents/briefs',
      '  deliberations: .pi/ceo-agents/deliberations',
      '  memos: .pi/ceo-agents/memos',
      '  agents: .pi/ceo-agents/agents',
      'board:',
      '  - name: Revenue',
      '    path: revenue.md',
      '  - name: Contrarian',
      '    path: contrarian.md',
    ].join('\n'), 'utf8');
    await writeFile(briefPath, [
      '# Acquisition decision',
      '',
      '## Situation', 'The team must decide.',
      '## Stakes', 'Capital and execution risk.',
      '## Constraints', 'Keep the decision evidence based.',
      '## Key Question', 'Should the team proceed?',
    ].join('\n\n'), 'utf8');

    const commands = new Map<string, any>();
    const tools = new Map<string, any>();
    const events = new Map<string, Array<(event: any, context: any) => unknown>>();
    const notifications: string[] = [];
    const statuses: string[] = [];
    const userMessages: string[] = [];
    const pi = {
      registerCommand(name: string, definition: any) { commands.set(name, definition); },
      registerTool(definition: any) { tools.set(definition.name, definition); },
      sendUserMessage(content: string) { userMessages.push(content); },
      on(name: string, handler: (event: any, context: any) => unknown) {
        events.set(name, [...(events.get(name) ?? []), handler]);
        return () => {};
      },
    } as unknown as ExtensionAPI;

    try {
      registerCeoBoardExtension(pi, {
        clientFactory: {
          async create(config) {
            return new ScriptedPiAgentClient({ agentName: config.agentName, piSessionId: config.sessionId });
          },
        },
      });
      const context: any = {
        mode: 'tui',
        hasUI: true,
        cwd: projectRoot,
        ui: {
          async select() { return 'acquisition'; },
          notify(message: string) { notifications.push(message); },
          setStatus(_key: string, text: string) { statuses.push(text); },
          setWidget() {},
          onTerminalInput() { return () => {}; },
        },
      };

      await commands.get('ceo-begin')?.handler('acquisition', context);
  expect(userMessages[0]).toContain('Review the complete brief');
  expect(userMessages[0]).toContain('## Situation');
      expect(notifications.some((message) => message.includes('run started'))).toBe(true);

      const converse = tools.get('converse');
      const roundResult = await converse.execute('call-1', { to: 'all', message: 'Make an initial recommendation.' }, undefined, undefined, context);
      expect(roundResult.isError).not.toBe(true);
      expect(JSON.parse(roundResult.content[0].text).responses).toHaveLength(2);
      expect(statuses.at(-1)).toContain('deliberating');

      const endResult = await tools.get('end_deliberation').execute('call-2', {}, undefined, undefined, context);
      expect(endResult.isError).not.toBe(true);
      const endPayload = JSON.parse(endResult.content[0].text) as { memo_path: string; memo: string };
      expect(endPayload.memo).toContain('## Final Decision');
      expect(await readFile(endPayload.memo_path, 'utf8')).toContain('session_id:');
      await expect(readFile(join(projectRoot, '.pi', 'ceo-agents', '.active-run.lock'), 'utf8'))
        .rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
