export type WorkflowPresentationTone = 'active' | 'closing' | 'complete' | 'failed';

export interface BoardRuntimeActivity {
  kind: 'lifecycle' | 'message' | 'tool' | 'file' | 'artifact' | 'status';
  label: string;
  timestamp: string;
}

export interface BoardRuntimeMemberInput {
  name: string;
  state: string;
  acceptedResponseCount: number;
  latestAcceptedResponse?: string | null;
  activities: BoardRuntimeActivity[];
  telemetry: {
    costDelta: number | null;
    remainingContextTokens: number | null;
  };
}

export interface BoardRuntimeInput {
  lifecycleState: string;
  elapsedMinutes: number;
  totalCost: number;
  constraints: {
    minTimeMinutes: number;
    maxTimeMinutes: number;
    minBudget: number;
    maxBudget: number;
  };
  members: BoardRuntimeMemberInput[];
}

export interface BoardRuntimeViewModel {
  workflow: {
    state: string;
    label: string;
    tone: WorkflowPresentationTone;
  };
  members: Array<{
    name: string;
    state: string;
    label: string;
    latestActivity: string;
    responseCount: number;
    latestAcceptedResponse: string | null;
    telemetry: {
      cost: string;
      remainingContext: string;
    };
  }>;
  time: {
    value: number;
    maximum: number;
    progressPercent: number;
    minimumMarkerPercent: number;
    displayValue: string;
  };
  budget: {
    value: number;
    maximum: number;
    progressPercent: number;
    minimumMarkerPercent: number;
    displayValue: string;
  };
}

const WORKFLOW_PRESENTATION: Record<string, { label: string; tone: WorkflowPresentationTone }> = {
  INITIALIZING: { label: 'initializing', tone: 'active' },
  CEO_FRAMING: { label: 'framing', tone: 'active' },
  DELIBERATING: { label: 'deliberating', tone: 'active' },
  FINAL_CLOSING: { label: 'closing', tone: 'closing' },
  SYNTHESIS: { label: 'synthesizing', tone: 'closing' },
  CEO_SYNTHESIS: { label: 'synthesizing', tone: 'closing' },
  COMPLETED: { label: 'complete', tone: 'complete' },
  FAILED: { label: 'failed', tone: 'failed' },
};

const MEMBER_PRESENTATION: Record<string, string> = {
  READY: 'ready',
  ACTIVE: 'responding...',
  RUNNING: 'responding...',
  RETRYING: 'retrying...',
  COMPLETED: 'complete',
  FAILED: 'failed',
  UNAVAILABLE: 'unavailable',
};

function progressPercent(value: number, maximum: number): number {
  if (maximum <= 0) {
    return value > 0 ? 100 : 0;
  }
  return Math.min(100, Math.max(0, value / maximum * 100));
}

function markerPercent(value: number, maximum: number): number {
  if (maximum <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, value / maximum * 100));
}

function latestActivity(activities: BoardRuntimeActivity[]): string {
  const latest = activities.reduce<BoardRuntimeActivity | undefined>((current, candidate) => {
    if (!current || new Date(candidate.timestamp).getTime() > new Date(current.timestamp).getTime()) {
      return candidate;
    }
    return current;
  }, undefined);
  return latest?.label ?? 'waiting';
}

function formatCost(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'unavailable' : `$${value.toFixed(2)}`;
}

function formatContext(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'unavailable' : `${Math.max(0, Math.round(value)).toLocaleString()} tokens`;
}

export function buildBoardRuntimeViewModel(input: BoardRuntimeInput): BoardRuntimeViewModel {
  const workflow = WORKFLOW_PRESENTATION[input.lifecycleState] ?? {
    label: input.lifecycleState.toLowerCase(),
    tone: 'active' as const,
  };
  const maxTime = input.constraints.maxTimeMinutes;
  const maxBudget = input.constraints.maxBudget;

  return {
    workflow: { state: input.lifecycleState, ...workflow },
    members: input.members.map((member) => ({
      name: member.name,
      state: member.state,
      label: MEMBER_PRESENTATION[member.state] ?? member.state.toLowerCase(),
      latestActivity: latestActivity(member.activities),
      responseCount: Math.max(0, Math.floor(member.acceptedResponseCount)),
      latestAcceptedResponse: member.latestAcceptedResponse ?? null,
      telemetry: {
        cost: formatCost(member.telemetry.costDelta),
        remainingContext: formatContext(member.telemetry.remainingContextTokens),
      },
    })),
    time: {
      value: input.elapsedMinutes,
      maximum: maxTime,
      progressPercent: progressPercent(input.elapsedMinutes, maxTime),
      minimumMarkerPercent: markerPercent(input.constraints.minTimeMinutes, maxTime),
      displayValue: `${input.elapsedMinutes.toFixed(1)} / ${maxTime.toFixed(1)} min`,
    },
    budget: {
      value: input.totalCost,
      maximum: maxBudget,
      progressPercent: progressPercent(input.totalCost, maxBudget),
      minimumMarkerPercent: markerPercent(input.constraints.minBudget, maxBudget),
      displayValue: `$${input.totalCost.toFixed(2)} / $${maxBudget.toFixed(2)}`,
    },
  };
}
