import { describe, expect, it } from 'vitest';

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import registerExtension from '../apps/ceo/extensions/ceo-and-board.js';

describe('documented app entrypoint (implementation-1.4 N7)', () => {
  it('registers /ceo-begin, converse, and end_deliberation alongside the runtime widget', () => {
    const commands: string[] = [];
    const tools: string[] = [];
    const events: string[] = [];
    const pi = {
      registerCommand(name: string) { commands.push(name); },
      registerTool(definition: { name: string }) { tools.push(definition.name); },
      on(name: string) { events.push(name); return () => {}; },
      sendUserMessage() {},
    } as unknown as ExtensionAPI;

    registerExtension(pi);

    expect(commands).toContain('ceo-begin');
    expect(tools).toEqual(expect.arrayContaining(['converse', 'end_deliberation']));
    expect(events).toContain('session_start');
  });
});
