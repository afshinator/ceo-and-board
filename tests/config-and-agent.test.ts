import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { loadConfig, resolveAgentPath } from '../src/config.js';
import { extractRuntimeVariables, loadAgentDefinition } from '../src/agents.js';
import { validateBrief } from '../src/briefs.js';

describe('config and agent preflight', () => {
  it('loads the canonical project config and resolves board agent paths', async () => {
    const configPath = decodeURIComponent(
      new URL('../sample implementation/ceo-and-board-configuration.yaml', import.meta.url).pathname,
    );
    const config = await loadConfig(configPath);

    expect(config.meeting.constraints.min_time_minutes).toBe(1);
    expect(config.meeting.constraints.max_time_minutes).toBe(3);
    expect(config.paths.agents).toBe('.pi/ceo-agents/agents/');

    const resolved = resolveAgentPath(
      config.board[0].path,
      config,
      '/Users/afshin/Documents/dev/ceo-and-board',
    );

    expect(resolved).toBe(
      '/Users/afshin/Documents/dev/ceo-and-board/.pi/ceo-agents/agents/revenue.md',
    );
  });

  it('parses the CEO agent definition and extracts the runtime variables', async () => {
    const agentPath = decodeURIComponent(
      new URL('../sample implementation/expertise/ceo.md', import.meta.url).pathname,
    );
    const agent = await loadAgentDefinition(agentPath);

    expect(agent.frontmatter.name).toBe('ceo');
    expect(agent.frontmatter.model).toBe('anthropic/claude-opus-4-6');
    expect(agent.body).toContain('## Purpose');

    const variables = extractRuntimeVariables(agent);
    expect(variables).toEqual(
      expect.arrayContaining([
        'SESSION_ID',
        'BRIEF_CONTENT',
        'BOARD_MEMBERS',
        'MEMO_PATH',
        'MIN_TIME',
        'MAX_TIME',
        'MIN_BUDGET',
        'MAX_BUDGET',
      ]),
    );
  });

  it('validates a real brief against the required sections', async () => {
    const briefPath = decodeURIComponent(
      new URL('../sample implementation/briefs/03-13-2026-example1.md', import.meta.url).pathname,
    );
    const brief = await readFile(briefPath, 'utf8');

    const validation = validateBrief(brief, [
      { section: 'Situation', description: 'Current state and trigger event' },
      { section: 'Stakes', description: 'What is at risk' },
      { section: 'Constraints', description: 'What limits the decision' },
      { section: 'Key Question', description: 'The question to answer' },
    ]);

    expect(validation.ok).toBe(true);
    expect(validation.errors).toEqual([]);
  });
});
