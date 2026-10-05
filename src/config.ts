import { access, readFile } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';

import YAML from 'yaml';
import { z } from 'zod';

export const BudgetValueSchema = z.number().finite().nonnegative();

export const MeetingConstraintsSchema = z.object({
  min_time_minutes: z.number(),
  max_time_minutes: z.number(),
  min_budget: BudgetValueSchema,
  max_budget: BudgetValueSchema,
}).check((ctx) => {
  const value = ctx.value;
  if (value.min_time_minutes > value.max_time_minutes) {
    ctx.issues.push({
      code: 'custom',
      message: 'min_time_minutes must not exceed max_time_minutes.',
      path: ['min_time_minutes'],
      input: value.min_time_minutes,
    });
  }
  if (value.min_budget > value.max_budget) {
    ctx.issues.push({
      code: 'custom',
      message: 'min_budget must not exceed max_budget.',
      path: ['min_budget'],
      input: value.min_budget,
    });
  }
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
  board: z.array(BoardConfigEntrySchema).min(1, 'The board must contain at least one member.'),
}).check((ctx) => {
  const names = ctx.value.board.map((member) => member.name);
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      ctx.issues.push({
        code: 'custom',
        message: `Duplicate board member name: ${name}.`,
        path: ['board'],
        input: name,
      });
      return;
    }
    seen.add(name);
  }
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

export const DEFAULT_RUNTIME_DIR = '.pi/ceo-agents';

export interface ResolvedRunPaths {
  briefsDir: string;
  deliberationsDir: string;
  memosDir: string;
  agentsDir: string;
}

export async function findConfigFile(projectRoot: string): Promise<string | undefined> {
  const candidates = [
    join(projectRoot, 'ceo-and-board-configuration.yaml'),
    join(projectRoot, DEFAULT_RUNTIME_DIR, 'ceo-and-board-configuration.yaml'),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Keep looking for the next candidate.
    }
  }

  return undefined;
}

export async function resolveRunPaths(
  projectRoot: string,
  paths?: Partial<CeoBoardConfig['paths']>,
): Promise<ResolvedRunPaths> {
  const config = paths ? undefined : await (async () => {
    const configPath = await findConfigFile(projectRoot);
    return configPath ? loadConfig(configPath) : undefined;
  })();
  const resolvedPaths = paths ?? config?.paths ?? {};

  return {
    briefsDir: resolvePath(projectRoot, resolvedPaths.briefs ?? join(DEFAULT_RUNTIME_DIR, 'briefs')),
    deliberationsDir: resolvePath(projectRoot, resolvedPaths.deliberations ?? join(DEFAULT_RUNTIME_DIR, 'deliberations')),
    memosDir: resolvePath(projectRoot, resolvedPaths.memos ?? join(DEFAULT_RUNTIME_DIR, 'memos')),
    agentsDir: resolvePath(projectRoot, resolvedPaths.agents ?? join(DEFAULT_RUNTIME_DIR, 'agents')),
  };
}
