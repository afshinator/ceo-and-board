import type { AgentDefinition } from './agents.js';

export interface PromptRuntimeContext {
  sessionId: string;
  briefContent: string;
  boardMembers: string[];
  memoPath: string;
  minTime: number;
  maxTime: number;
  minBudget: number;
  maxBudget: number;
}

const KNOWN_VARIABLES: Record<string, (runtime: PromptRuntimeContext) => string> = {
  SESSION_ID: (runtime) => runtime.sessionId,
  BRIEF_CONTENT: (runtime) => runtime.briefContent,
  BOARD_MEMBERS: (runtime) => runtime.boardMembers.join(', '),
  MEMO_PATH: (runtime) => runtime.memoPath,
  MIN_TIME: (runtime) => String(runtime.minTime),
  MAX_TIME: (runtime) => String(runtime.maxTime),
  MIN_BUDGET: (runtime) => String(runtime.minBudget),
  MAX_BUDGET: (runtime) => String(runtime.maxBudget),
};

const VARIABLE_PATTERN = /\{\{([A-Z0-9_]+)\}\}/g;

export function renderAgentPrompt(agent: AgentDefinition, runtime: PromptRuntimeContext): string {
  const unknown = new Set<string>();
  const renderedBody = agent.body.replace(VARIABLE_PATTERN, (match, name: string) => {
    const resolver = KNOWN_VARIABLES[name];
    if (!resolver) {
      unknown.add(name);
      return match;
    }
    return resolver(runtime);
  });

  if (unknown.size > 0) {
    throw new Error(`Unknown prompt runtime variable(s): ${[...unknown].sort().join(', ')}`);
  }

  return renderedBody;
}

export const FINAL_STATEMENT_PROMPT = [
  'Provide one final board position.',
  'State your final position, strongest supporting reason, and strongest remaining concern or condition.',
].join('\n');
