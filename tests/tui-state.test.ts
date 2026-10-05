import { describe, expect, it } from 'vitest';

import { buildBoardRuntimeViewModel, type BoardRuntimeInput } from '../src/tui/state.js';
import { renderBoardRuntimeLines } from '../src/tui/status-display.js';
import { mountBoardRuntimeWidget, mountBoardRuntimeWidgetForMode, type RuntimeWidgetUI } from '../src/tui/runtime-widget.js';

const baseInput: BoardRuntimeInput = {
  lifecycleState: 'DELIBERATING',
  elapsedMinutes: 0.5,
  totalCost: 2,
  constraints: {
    minTimeMinutes: 2,
    maxTimeMinutes: 10,
    minBudget: 5,
    maxBudget: 20,
  },
  members: [
    {
      name: 'Revenue',
      state: 'RUNNING',
      acceptedResponseCount: 1,
      activities: [
        { kind: 'tool', label: 'read brief', timestamp: '2026-10-05T10:00:00.000Z' },
        { kind: 'artifact', label: 'wrote decision.svg', timestamp: '2026-10-05T10:00:02.000Z' },
      ],
      telemetry: { costDelta: 0.8, remainingContextTokens: 1200 },
    },
    {
      name: 'Contrarian',
      state: 'UNAVAILABLE',
      acceptedResponseCount: 0,
      activities: [],
      telemetry: { costDelta: null, remainingContextTokens: null },
    },
  ],
};

describe('board runtime view model', () => {
  it('maps lifecycle and member control states to centralized presentation labels', () => {
    const view = buildBoardRuntimeViewModel(baseInput);

    expect(view.workflow).toEqual({ state: 'DELIBERATING', label: 'deliberating', tone: 'active' });
    expect(view.members.map(({ state, label }) => ({ state, label }))).toEqual([
      { state: 'RUNNING', label: 'responding...' },
      { state: 'UNAVAILABLE', label: 'unavailable' },
    ]);
  });

  it('selects latest meaningful activity and counts accepted responses only', () => {
    const view = buildBoardRuntimeViewModel(baseInput);

    expect(view.members[0]?.latestActivity).toBe('wrote decision.svg');
    expect(view.members[0]?.responseCount).toBe(1);
    expect(view.members[1]?.latestActivity).toBe('waiting');
    expect(view.members[1]?.responseCount).toBe(0);
  });

  it('represents progress from zero through the minimum marker to maximum and keeps raw values unclamped', () => {
    const belowMinimum = buildBoardRuntimeViewModel(baseInput);
    expect(belowMinimum.time.progressPercent).toBe(5);
    expect(belowMinimum.time.minimumMarkerPercent).toBe(20);
    expect(belowMinimum.budget.progressPercent).toBe(10);
    expect(belowMinimum.budget.minimumMarkerPercent).toBe(25);

    const aboveMaximum = buildBoardRuntimeViewModel({
      ...baseInput,
      elapsedMinutes: 12,
      totalCost: 24,
    });
    expect(aboveMaximum.time.progressPercent).toBe(100);
    expect(aboveMaximum.budget.progressPercent).toBe(100);
    expect(aboveMaximum.time.displayValue).toBe('12.0 / 10.0 min');
    expect(aboveMaximum.budget.displayValue).toBe('$24.00 / $20.00');
  });

  it('renders missing cost, remaining-context, and activity telemetry as unavailable', () => {
    const view = buildBoardRuntimeViewModel(baseInput);

    expect(view.members[1]?.telemetry).toEqual({ cost: 'unavailable', remainingContext: 'unavailable' });
  });

  it('renders the required vertical order with compact rows and selected-member details only when expanded', () => {
    const input = {
      ...baseInput,
      members: baseInput.members.map((member, index) => ({
        ...member,
        latestAcceptedResponse: index === 0 ? 'Proceed with the staged acquisition after diligence.' : null,
      })),
    };
    const view = buildBoardRuntimeViewModel(input);
    const compact = renderBoardRuntimeLines(view, { ceoMessage: 'Address the integration risk.' });
    const expanded = renderBoardRuntimeLines(view, { ceoMessage: 'Address the integration risk.', expanded: true });

    expect(compact[0]).toContain('CEO → Board:');
    expect(compact[1]).toContain('Board: deliberating');
    expect(compact[2]).toContain('Time');
    expect(compact[3]).toContain('Revenue');
    expect(compact.some((line) => line.includes('Response:'))).toBe(false);
    expect(expanded.some((line) => line.includes('Response: Proceed with the staged acquisition'))).toBe(true);
    expect(expanded.some((line) => line.includes('Context remaining:'))).toBe(true);
  });

  it('mounts a persistent widget, supports selection/expand keys, updates, and disposes cleanly', () => {
    const widgets = new Map<string, string[] | undefined>();
    const handlers = new Set<(data: string) => { consume?: boolean } | undefined>();
    const ui: RuntimeWidgetUI = {
      setWidget(key, content) { widgets.set(key, content); },
      onTerminalInput(handler) {
        handlers.add(handler);
        return () => { handlers.delete(handler); };
      },
    };
    const widget = mountBoardRuntimeWidget(ui, {
      ...baseInput,
      members: baseInput.members.map((member, index) => ({
        ...member,
        latestAcceptedResponse: index === 0 ? 'Accepted response.' : null,
      })),
    });

    expect(widgets.get('ceo-board-runtime')?.[2]).toContain('> Revenue');
    const handler = [...handlers][0];
    expect(handler?.('j')).toEqual({ consume: true });
    expect(widgets.get('ceo-board-runtime')?.[3]).toContain('> Contrarian');
    expect(handler?.(' ')).toEqual({ consume: true });
    expect(widgets.get('ceo-board-runtime')?.some((line) => line.includes('Context remaining:'))).toBe(true);

    widget.update({ ...baseInput, lifecycleState: 'FINAL_CLOSING' }, 'Final statements incoming.');
    expect(widgets.get('ceo-board-runtime')?.[0]).toContain('Final statements incoming.');
    expect(widgets.get('ceo-board-runtime')?.[1]).toContain('closing');

    widget.dispose();
    expect(widgets.get('ceo-board-runtime')).toBeUndefined();
    expect(handlers.size).toBe(0);
  });

  it('does not mount a terminal widget outside interactive TUI mode', () => {
    let widgetWrites = 0;
    const ui: RuntimeWidgetUI = {
      setWidget() { widgetWrites += 1; },
      onTerminalInput() { return () => {}; },
    };

    expect(mountBoardRuntimeWidgetForMode('rpc', true, ui, baseInput)).toBeUndefined();
    expect(mountBoardRuntimeWidgetForMode('tui', false, ui, baseInput)).toBeUndefined();
    expect(widgetWrites).toBe(0);
    expect(mountBoardRuntimeWidgetForMode('tui', true, ui, baseInput)).toBeDefined();
    expect(widgetWrites).toBe(1);
  });
});
