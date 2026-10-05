import { describe, expect, it } from 'vitest';

import { validateDecisionMemo, type ExpectedMemoMetadata } from '../src/memo-validator.js';

const expectedMetadata: ExpectedMemoMetadata = {
  title: 'CEO Decision',
  date: '2026-10-05T11:00:00.000Z',
  sessionId: 'run-123',
  duration: 4.5,
  budgetUsed: 1.25,
  boardMembers: ['Revenue', 'Contrarian'],
  brief: 'acquisition-decision',
  transcript: '.pi/ceo-agents/deliberations/run-123/conversation.jsonl',
};

function makeMemo(overrides: { frontmatter?: string; headings?: string; finalDecision?: string; appendix?: string } = {}): string {
  const frontmatter = overrides.frontmatter ?? [
    'title: CEO Decision',
    'date: 2026-10-05T11:00:00.000Z',
    'session_id: run-123',
    'duration: 4.5',
    'budget_used: 1.25',
    'board_members:',
    '  - Revenue',
    '  - Contrarian',
    'brief: acquisition-decision',
    'transcript: .pi/ceo-agents/deliberations/run-123/conversation.jsonl',
  ].join('\n');
  const headings = overrides.headings ?? [
    '## Final Decision',
    overrides.finalDecision ?? 'Proceed with the acquisition under the stated conditions.',
    '## Ranked Recommendations',
    '1. Proceed with diligence conditions.',
    '## Decision Map',
    'The board supports a conditional path.',
    '## Board Stances',
    'Revenue: proceed. Contrarian: protect downside.',
    '## Tensions & Dissent',
    'The board disagreed about execution risk.',
    '## Trade-offs & Risks',
    'Integration risk remains material.',
    '## Next Actions',
    '1. Validate the customer pipeline.',
    '## Deliberation Summary',
    'The board assessed the acquisition.',
  ].join('\n\n');

  return [
    '---',
    frontmatter,
    '---',
    '',
    '# Board Memo: CEO Decision',
    '',
    headings,
    overrides.appendix ?? '',
  ].join('\n');
}

describe('decision memo validator', () => {
  it('accepts valid metadata and required Markdown structure without requiring optional SVGs', () => {
    const result = validateDecisionMemo(makeMemo({ appendix: '\n[Decision map](decision-map.svg)\n' }), expectedMetadata);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing or malformed frontmatter', () => {
    expect(validateDecisionMemo('# Board Memo: CEO Decision\n\n## Final Decision\nProceed.', expectedMetadata).errors)
      .toContain('missing YAML frontmatter');
    expect(validateDecisionMemo(makeMemo({ frontmatter: 'title: [' }), expectedMetadata).errors)
      .toContain('invalid YAML frontmatter');
  });

  it('rejects incorrect deterministic session, budget, or board metadata', () => {
    const wrongSession = makeMemo().replace('session_id: run-123', 'session_id: other-run');
    const wrongBudget = makeMemo().replace('budget_used: 1.25', 'budget_used: 2.5');
    const wrongBoard = makeMemo().replace('  - Contrarian', '  - Ops');

    expect(validateDecisionMemo(wrongSession, expectedMetadata).errors.join(' ')).toMatch(/session_id/i);
    expect(validateDecisionMemo(wrongBudget, expectedMetadata).errors.join(' ')).toMatch(/budget_used/i);
    expect(validateDecisionMemo(wrongBoard, expectedMetadata).errors.join(' ')).toMatch(/board_members/i);
    const invalidBudget = makeMemo().replace('budget_used: 1.25', 'budget_used: not-a-number');
    expect(validateDecisionMemo(invalidBudget, expectedMetadata).errors.join(' ')).toMatch(/budget_used.*valid/i);
  });

  it('rejects missing or duplicate required headings and an empty final decision', () => {
    const missing = makeMemo().replace('## Trade-offs & Risks\n\nIntegration risk remains material.\n\n', '');
    const duplicate = makeMemo({ appendix: '\n## Next Actions\n\nDuplicate section.\n' });
    const empty = makeMemo({ finalDecision: '' });

    expect(validateDecisionMemo(missing, expectedMetadata).errors.join(' ')).toMatch(/Trade-offs & Risks/);
    expect(validateDecisionMemo(duplicate, expectedMetadata).errors.join(' ')).toMatch(/Next Actions.*exactly once/i);
    expect(validateDecisionMemo(empty, expectedMetadata).errors.join(' ')).toMatch(/Final Decision.*non-empty/i);
  });
});