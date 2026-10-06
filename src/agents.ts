import { readFile } from 'node:fs/promises';

import YAML from 'yaml';
import { z } from 'zod';

export const ExpertiseEntrySchema = z.object({
  path: z.string(),
  'use-when': z.string().optional(),
  updatable: z.boolean().optional(),
});

export const SkillEntrySchema = z.object({
  path: z.string(),
  'use-when': z.string().optional(),
});

export const PROVENANCE_STATUSES = ['recovered', 'partially-recovered', 'reconstructed', 'unrecovered', 'harness-generated'] as const;
export type ProvenanceStatus = typeof PROVENANCE_STATUSES[number];

export interface PromptProvenance {
  frontmatter: ProvenanceStatus;
  sections: Record<string, ProvenanceStatus>;
}

const ProvenanceStatusSchema = z.enum(PROVENANCE_STATUSES);

const PromptProvenanceSchema = z.object({
  frontmatter: ProvenanceStatusSchema,
  sections: z.record(z.string(), ProvenanceStatusSchema).optional().default({}),
});

export const AgentFrontmatterSchema = z.object({
  name: z.string(),
  expertise: z.array(ExpertiseEntrySchema).optional(),
  skills: z.array(SkillEntrySchema).optional(),
  model: z.string().min(1, 'Agent definitions must declare a model.'),
  domain: z.array(z.string()).optional(),
  provenance: PromptProvenanceSchema.optional(),
});

export type AgentFrontmatter = z.infer<typeof AgentFrontmatterSchema>;

export interface AgentDefinition {
  frontmatter: AgentFrontmatter;
  body: string;
  sourcePath: string;
  provenance: PromptProvenance;
}

export async function loadAgentDefinition(filePath: string): Promise<AgentDefinition> {
  const source = await readFile(filePath, 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  if (!match) {
    throw new Error(`Agent definition at ${filePath} is missing YAML frontmatter.`);
  }

  const [, frontmatterText, body] = match;
  const parsed = YAML.parse(frontmatterText ?? '');

  if (parsed === undefined || parsed === null || typeof parsed !== 'object') {
    throw new Error(`Agent frontmatter for ${filePath} is empty or invalid.`);
  }

  const frontmatter = AgentFrontmatterSchema.parse(parsed);

  return {
    frontmatter,
    body: body ?? '',
    sourcePath: filePath,
    provenance: frontmatter.provenance ?? { frontmatter: 'reconstructed', sections: {} },
  };
}

export function extractRuntimeVariables(agent: AgentDefinition): string[] {
  const matches = [...agent.body.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)];

  return [...new Set(matches.map((match) => match[1]))].sort();
}
