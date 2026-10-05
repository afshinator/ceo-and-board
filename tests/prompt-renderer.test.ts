import { describe, expect, it } from 'vitest';

import type { AgentDefinition } from '../src/agents.js';

describe('prompt renderer (implementation-1.4 N4)', () => {
  const agent: AgentDefinition = {
    frontmatter: { name: 'ceo', model: 'anthropic/claude-opus-4-6' },
    body: [
      'Purpose text that must survive verbatim.',
      '',
      'Session: {{SESSION_ID}}',
      'Brief:',
      '{{BRIEF_CONTENT}}',
      'Board: {{BOARD_MEMBERS}}',
      'Memo: {{MEMO_PATH}}',
      'Constraints: {{MIN_TIME}} {{MAX_TIME}} {{MIN_BUDGET}} {{MAX_BUDGET}}',
    ].join('\n'),
    sourcePath: 'expertise/ceo.md',
    provenance: { frontmatter: 'recovered', body: 'recovered' },
  };

  const runtime = {
    sessionId: 'abc123',
    briefContent: '# Brief body',
    boardMembers: ['Revenue', 'Contrarian'],
    memoPath: '/tmp/run/memo.md',
    minTime: 1,
    maxTime: 3,
    minBudget: 1,
    maxBudget: 5,
    supportingFiles: [],
    conversationPath: '/tmp/run/conversation.jsonl',
    expertise: [],
    skills: [],
  };

  it('substitutes every known CEO runtime variable', async () => {
    const { renderAgentPrompt } = await import('../src/prompt-renderer.js');

    const rendered = renderAgentPrompt(agent, runtime);

    expect(rendered).toContain('Session: abc123');
    expect(rendered).toContain('# Brief body');
    expect(rendered).toContain('Revenue');
    expect(rendered).toContain('Contrarian');
    expect(rendered).toContain('/tmp/run/memo.md');
    expect(rendered).not.toMatch(
      /\{\{(SESSION_ID|BRIEF_CONTENT|BOARD_MEMBERS|MEMO_PATH|MIN_TIME|MAX_TIME|MIN_BUDGET|MAX_BUDGET)\}\}/,
    );
  });

  it('preserves recovered body text verbatim outside substitutions', async () => {
    const { renderAgentPrompt } = await import('../src/prompt-renderer.js');

    expect(renderAgentPrompt(agent, runtime)).toContain('Purpose text that must survive verbatim.');
  });

  it('rejects unknown runtime variables', async () => {
    const { renderAgentPrompt } = await import('../src/prompt-renderer.js');
    const unknownVariableAgent = { ...agent, body: 'Value: {{UNKNOWN_THING}}' };

    expect(() => renderAgentPrompt(unknownVariableAgent, runtime)).toThrow(/UNKNOWN_THING/);
  });
});
