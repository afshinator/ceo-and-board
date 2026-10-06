import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig, CeoBoardConfigSchema, resolveAgentPath } from '../src/config.js';
import { extractRuntimeVariables, loadAgentDefinition } from '../src/agents.js';
import { discoverBriefs, validateBrief } from '../src/briefs.js';

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

describe('config strictness negatives (implementation-1.4 N1)', () => {
  const validConfig = {
    meeting: {
      constraints: { min_time_minutes: 1, max_time_minutes: 3, min_budget: 1, max_budget: 5 },
      editor: 'code',
    },
    paths: { briefs: 'briefs', deliberations: 'deliberations', memos: 'memos', agents: 'agents' },
    board: [{ name: 'Revenue', path: 'revenue.md' }],
  };

  const withConstraints = (constraints: Record<string, unknown>) => ({
    ...validConfig,
    meeting: { ...validConfig.meeting, constraints: { ...validConfig.meeting.constraints, ...constraints } },
  });

  it('rejects string budget values', () => {
    expect(() => CeoBoardConfigSchema.parse(withConstraints({ min_budget: '$1' }))).toThrow();
    expect(() => CeoBoardConfigSchema.parse(withConstraints({ max_budget: '$5' }))).toThrow();
  });

  it('rejects min_time greater than max_time', () => {
    expect(() => CeoBoardConfigSchema.parse(withConstraints({ min_time_minutes: 5, max_time_minutes: 3 }))).toThrow();
  });

  it('rejects min_budget greater than max_budget', () => {
    expect(() => CeoBoardConfigSchema.parse(withConstraints({ min_budget: 10, max_budget: 5 }))).toThrow();
  });

  it('rejects an empty board', () => {
    expect(() => CeoBoardConfigSchema.parse({ ...validConfig, board: [] })).toThrow();
  });

  it('rejects duplicate board member names', () => {
    const board = [
      { name: 'Revenue', path: 'revenue.md' },
      { name: 'Revenue', path: 'other.md' },
    ];
    expect(() => CeoBoardConfigSchema.parse({ ...validConfig, board })).toThrow();
  });
});

describe('agent definition negatives (implementation-1.4 N2)', () => {
  it('rejects an agent definition without a model', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-agent-no-model-'));

    try {
      const agentPath = join(projectRoot, 'agent.md');
      await writeFile(agentPath, '---\nname: nomodel\n---\n\n## Purpose\nNo model declared.\n', 'utf8');

      await expect(loadAgentDefinition(agentPath)).rejects.toThrow(/model/i);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('rejects malformed expertise entries', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-agent-bad-expertise-'));

    try {
      const agentPath = join(projectRoot, 'agent.md');
      await writeFile(agentPath, '---\nname: bad\nmodel: test/model\nexpertise:\n  - use-when: always\n---\n\nBody.\n', 'utf8');

      await expect(loadAgentDefinition(agentPath)).rejects.toThrow();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('exposes prompt provenance for the recovered CEO source', async () => {
    const agentPath = decodeURIComponent(
      new URL('../.pi/ceo-agents/expertise/ceo.md', import.meta.url).pathname,
    );
    const agent = await loadAgentDefinition(agentPath);

    expect(agent.provenance.frontmatter).toBe('recovered');
    expect(agent.provenance.sections).toMatchObject({
      Purpose: 'recovered',
      Variables: 'recovered',
      Instructions: 'reconstructed',
      Workflow: 'reconstructed',
      Context: 'harness-generated',
    });
    expect(agent.body).toMatch(/## Instructions\n\s*\S/);
    expect(agent.body).toMatch(/## Workflow\n\s*\S/);
  });

  it('marks Compounder variables partially recovered (implementation-1.5 F13)', async () => {
    const agentPath = decodeURIComponent(
      new URL('../.pi/ceo-agents/agents/compounder.md', import.meta.url).pathname,
    );
    const agent = await loadAgentDefinition(agentPath);

    expect(agent.provenance.frontmatter).toBe('recovered');
    expect(agent.provenance.sections).toMatchObject({
      Purpose: 'recovered',
      Variables: 'partially-recovered',
    });
  });

  it('marks Revenue partially recovered from transcript evidence (implementation-1.5 F13)', async () => {
    const agentPath = decodeURIComponent(
      new URL('../.pi/ceo-agents/agents/revenue.md', import.meta.url).pathname,
    );
    const agent = await loadAgentDefinition(agentPath);

    expect(agent.provenance.frontmatter).toBe('reconstructed');
    expect(agent.provenance.sections).toMatchObject({
      Purpose: 'partially-recovered',
      Variables: 'partially-recovered',
    });
  });

  it('marks reconstructed board members reconstructed and defaults missing provenance (implementation-1.5 F13)', async () => {
    const strategistPath = decodeURIComponent(
      new URL('../.pi/ceo-agents/agents/product-strategist.md', import.meta.url).pathname,
    );
    const strategist = await loadAgentDefinition(strategistPath);
    expect(strategist.provenance.frontmatter).toBe('reconstructed');
    expect(strategist.provenance.sections).toMatchObject({
      Purpose: 'reconstructed',
      Variables: 'reconstructed',
    });

    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-agent-no-provenance-'));
    try {
      const barePath = join(projectRoot, 'agent.md');
      await writeFile(barePath, '---\nname: bare\nmodel: test/model\n---\n\nBody.\n', 'utf8');
      const bare = await loadAgentDefinition(barePath);
      expect(bare.provenance).toEqual({ frontmatter: 'reconstructed', sections: {} });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

describe('brief validation negatives (implementation-1.4 N3)', () => {
  const requiredSections = [
    { section: 'Situation' },
    { section: 'Stakes' },
    { section: 'Constraints' },
    { section: 'Key Question' },
  ];

  const fullBrief = [
    '# Brief',
    '## Situation',
    'State.',
    '## Stakes',
    'Risk.',
    '## Constraints',
    'Limits.',
    '## Key Question',
    'Proceed?',
  ].join('\n\n');

  for (const missing of ['Situation', 'Stakes', 'Constraints', 'Key Question']) {
    it(`rejects a brief missing ${missing}`, () => {
      const brief = fullBrief.replace(new RegExp(`## ${missing}\\n\\n[^#]+`), '');
      const validation = validateBrief(brief, requiredSections);

      expect(validation.ok).toBe(false);
      expect(validation.errors.join('; ')).toContain(missing);
    });
  }

  it('rejects a duplicate required section', () => {
    const validation = validateBrief(`${fullBrief}\n\n## Situation\n\nDuplicated.`, requiredSections);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join('; ')).toMatch(/duplicate.*Situation/i);
  });

  it('ignores non-directory entries and directories without brief.md during discovery', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'ceo-board-brief-discovery-'));

    try {
      const briefsDir = join(projectRoot, 'briefs');
      await mkdir(join(briefsDir, 'valid-package'), { recursive: true });
      await mkdir(join(briefsDir, 'not-a-package'), { recursive: true });
      await writeFile(join(briefsDir, 'flat-file.md'), '# Flat', 'utf8');
      await writeFile(join(briefsDir, 'valid-package', 'brief.md'), fullBrief, 'utf8');
      await writeFile(join(briefsDir, 'valid-package', 'context.txt'), 'context', 'utf8');

      const discovered = await discoverBriefs(briefsDir);

      expect(discovered.map((brief) => brief.name)).toEqual(['valid-package']);
      expect(discovered[0].supportingFiles).toEqual(['context.txt']);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
