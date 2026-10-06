import YAML from 'yaml';
import { z } from 'zod';
import { unified } from 'unified';
import remarkParse from 'remark-parse';

import { parseBudgetAmount } from './constraints.js';
import { extractNodeText } from './markdown.js';

interface MarkdownNode {
  type: string;
  depth?: number;
  value?: unknown;
  children?: MarkdownNode[];
}

export const DecisionMemoFrontmatterSchema = z.object({
  title: z.string().min(1),
  date: z.string().min(1),
  session_id: z.string().min(1),
  duration: z.number().nonnegative(),
  budget_used: z.union([z.number().nonnegative(), z.string().min(1)]),
  board_members: z.array(z.string().min(1)),
  brief: z.string().min(1),
  transcript: z.string().min(1),
});

export interface ExpectedMemoMetadata {
  title: string;
  date: string;
  sessionId: string;
  duration: number;
  budgetUsed: number;
  boardMembers: string[];
  brief: string;
  transcript: string;
}

export interface MemoValidationResult {
  ok: boolean;
  errors: string[];
}

export const REQUIRED_SECTION_HEADINGS = [
  'Final Decision',
  'Ranked Recommendations',
  'Decision Map',
  'Board Stances',
  'Tensions & Dissent',
  'Trade-offs & Risks',
  'Next Actions',
  'Deliberation Summary',
];

function splitMemo(markdown: string): { frontmatter: string | null; body: string } {
  const normalized = markdown.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { frontmatter: null, body: normalized };
  }

  const closingDelimiter = normalized.indexOf('\n---\n', 4);
  if (closingDelimiter < 0) {
    return { frontmatter: null, body: normalized };
  }

  return {
    frontmatter: normalized.slice(4, closingDelimiter),
    body: normalized.slice(closingDelimiter + 5),
  };
}

export function validateDecisionMemo(markdown: string, expected: ExpectedMemoMetadata): MemoValidationResult {
  const errors: string[] = [];
  const parts = splitMemo(markdown);
  if (parts.frontmatter === null) {
    return { ok: false, errors: ['missing YAML frontmatter'] };
  }

  let parsedFrontmatter: unknown;
  try {
    parsedFrontmatter = YAML.parse(parts.frontmatter);
  } catch {
    return { ok: false, errors: ['invalid YAML frontmatter'] };
  }

  const frontmatterResult = DecisionMemoFrontmatterSchema.safeParse(parsedFrontmatter);
  if (!frontmatterResult.success) {
    for (const issue of frontmatterResult.error.issues) {
      errors.push(`invalid frontmatter ${issue.path.join('.') || 'object'}: ${issue.message}`);
    }
    return { ok: false, errors };
  }

  const frontmatter = frontmatterResult.data;
  try {
    if (parseBudgetAmount(frontmatter.budget_used) !== expected.budgetUsed) {
      errors.push('frontmatter budget_used does not match harness state');
    }
  } catch {
    errors.push('frontmatter budget_used must be a valid non-negative amount');
  }
  const metadataChecks: Array<[string, boolean]> = [
    ['title', frontmatter.title === expected.title],
    ['date', frontmatter.date === expected.date],
    ['session_id', frontmatter.session_id === expected.sessionId],
    ['duration', frontmatter.duration === expected.duration],
    ['board_members', JSON.stringify(frontmatter.board_members) === JSON.stringify(expected.boardMembers)],
    ['brief', frontmatter.brief === expected.brief],
    ['transcript', frontmatter.transcript === expected.transcript],
  ];
  for (const [field, matches] of metadataChecks) {
    if (!matches) {
      errors.push(`frontmatter ${field} does not match harness state`);
    }
  }

  let tree: { children: MarkdownNode[] };
  try {
    tree = unified().use(remarkParse).parse(parts.body) as unknown as { children: MarkdownNode[] };
  } catch {
    return { ok: false, errors: [...errors, 'invalid Markdown body'] };
  }

  const headings = tree.children
    .filter((node) => node.type === 'heading' && typeof node.depth === 'number')
    .map((node) => ({ depth: node.depth!, text: extractNodeText(node).trim() }));
  const titleHeading = `Board Memo: ${expected.title}`;
  if (headings.filter((heading) => heading.depth === 1 && heading.text === titleHeading).length !== 1) {
    errors.push(`required title heading "# ${titleHeading}" must appear exactly once`);
  }

  for (const section of REQUIRED_SECTION_HEADINGS) {
    const count = headings.filter((heading) => heading.depth === 2 && heading.text === section).length;
    if (count !== 1) {
      errors.push(`required heading "${section}" must appear exactly once`);
    }
  }

  const finalDecisionIndex = tree.children.findIndex((node) =>
    node.type === 'heading' && node.depth === 2 && extractNodeText(node).trim() === 'Final Decision');
  if (finalDecisionIndex >= 0) {
    const decisionContent: string[] = [];
    for (const node of tree.children.slice(finalDecisionIndex + 1)) {
      if (node.type === 'heading' && (node.depth ?? 0) <= 2) {
        break;
      }
      decisionContent.push(extractNodeText(node));
    }
    if (decisionContent.join('').trim().length === 0) {
      errors.push('Final Decision must contain non-empty content');
    }
  }

  return { ok: errors.length === 0, errors };
}
