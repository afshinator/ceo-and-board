import { evaluateConstraintState, type ConstraintEvaluation, type ForcedCloseReason } from './run.js';

export interface MeetingConstraintValues {
  min_time_minutes: number;
  max_time_minutes: number;
  min_budget: number;
  max_budget: number;
}

export interface MeetingConstraintState extends ConstraintEvaluation {
  elapsedMinutes: number;
  totalBudget: number;
  reason?: ForcedCloseReason;
}

export function parseBudgetAmount(value: number | string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Budget amounts must be finite non-negative numbers.');
    }
    return value;
  }

  const normalized = value.trim().replace(/^\$/, '').replaceAll(',', '');
  const amount = Number(normalized);
  if (!normalized || !Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid budget amount: ${value}`);
  }
  return amount;
}

export function evaluateMeetingConstraints(input: {
  createdAt: string;
  constraints: MeetingConstraintValues;
  totalBudget: number;
  now?: number;
}): MeetingConstraintState {
  const elapsedMinutes = Math.max(0, ((input.now ?? Date.now()) - new Date(input.createdAt).getTime()) / 60_000);
  const evaluation = evaluateConstraintState({
    elapsedMinutes,
    totalBudget: input.totalBudget,
    minTimeMinutes: input.constraints.min_time_minutes,
    maxTimeMinutes: input.constraints.max_time_minutes,
    maxBudget: parseBudgetAmount(input.constraints.max_budget),
  });

  return {
    ...evaluation,
    elapsedMinutes,
    totalBudget: input.totalBudget,
  };
}
