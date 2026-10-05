import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';

import YAML from 'yaml';
import { z } from 'zod';

export const BudgetValueSchema = z.union([z.number(), z.string()]);

export const MeetingConstraintsSchema = z.object({
  min_time_minutes: z.number(),
  max_time_minutes: z.number(),
  min_budget: BudgetValueSchema,
  max_budget: BudgetValueSchema,
});

export const BriefSectionConfigSchema = z.object({
  section: z.string(),
  description: z.string().optional(),
});

export const PathsConfigSchema = z.object({
  briefs: z.string(),
  deliberations: z.string(),
  memos: z.string(),
  agents: z.string(),
});

export const BoardConfigEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  color: z.string().optional(),
});

export const CeoBoardConfigSchema = z.object({
  meeting: z.object({
    constraints: MeetingConstraintsSchema,
    editor: z.string(),
  }),
  brief_sections: z.array(BriefSectionConfigSchema).optional(),
  paths: PathsConfigSchema,
  board: z.array(BoardConfigEntrySchema),
});

export type CeoBoardConfig = z.infer<typeof CeoBoardConfigSchema>;

export async function loadConfig(filePath: string): Promise<CeoBoardConfig> {
  const content = await readFile(filePath, 'utf8');
  const parsed = YAML.parse(content);

  if (parsed === undefined || parsed === null || typeof parsed !== 'object') {
    throw new Error(`Config at ${filePath} is empty or invalid.`);
  }

  return CeoBoardConfigSchema.parse(parsed);
}

export function resolveAgentPath(
  boardPath: string,
  config: CeoBoardConfig,
  projectRoot: string,
): string {
  if (boardPath.startsWith('/')) {
    return boardPath;
  }

  if (boardPath.startsWith('.')) {
    return resolvePath(projectRoot, boardPath);
  }

  return resolvePath(projectRoot, config.paths.agents, boardPath);
}
