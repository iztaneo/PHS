import { Decimal } from 'decimal.js';
import { GATE_THRESHOLDS } from './rules.js';

// Pure calculations: no clock, no database, no network. Dates are business dates (YYYY-MM-DD)
// already expressed in the project's time zone; amounts are decimal strings.
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const fixed = (value: Decimal) => value.toFixed(2);

export interface MilestoneInput {
  weight: number;
  // Date committed in the current baseline.
  committedDueOn: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rescheduled' | 'cancelled';
  progressPct: number | null;
}

export interface ProgressResult {
  // null = no data: there is no baseline, or it has no milestone that counts.
  committed: string | null;
  actual: string | null;
  // Percentage points of committed progress not achieved; never negative.
  deviation: string | null;
  gate: boolean;
}

function achievement(m: MilestoneInput): Decimal {
  if (m.status === 'completed') return new D(1);
  if (m.status === 'in_progress' || m.status === 'rescheduled') return new D(m.progressPct ?? 0).div(100);
  return new D(0);
}

// Rules 1: progress by milestone weight. `today` is the business date in the project's time zone.
export function progress(milestones: MilestoneInput[], today: string): ProgressResult {
  const counted = milestones.filter((m) => m.status !== 'cancelled');
  const total = counted.reduce((sum, m) => sum.plus(m.weight), new D(0));
  if (total.lte(0)) return { committed: null, actual: null, deviation: null, gate: false };
  const due = counted.filter((m) => m.committedDueOn < today).reduce((sum, m) => sum.plus(m.weight), new D(0));
  const done = counted.reduce((sum, m) => sum.plus(achievement(m).times(m.weight)), new D(0));
  const committed = due.div(total).times(100);
  const actual = done.div(total).times(100);
  const deviation = D.max(0, committed.minus(actual));
  // Thresholds are compared before rounding.
  return { committed: fixed(committed), actual: fixed(actual), deviation: fixed(deviation), gate: deviation.gt(GATE_THRESHOLDS.projectDeviation) };
}

export interface FinancialInput {
  budget: string | null;
  cost: string | null;
  // Actual progress as returned by progress(); null when there is no data.
  actualProgress: string | null;
}

export interface FinancialResult {
  // Cost that the achieved progress justifies: budget x actual progress.
  expectedCost: string | null;
  // Percentage of the budget; positive means spending ahead of progress.
  deviation: string | null;
  gate: boolean;
  missing: ('budget' | 'cost' | 'progress')[];
}

// Rules 2: cost against actual progress.
export function financialDeviation(input: FinancialInput): FinancialResult {
  const missing: FinancialResult['missing'] = [];
  if (input.budget === null || new D(input.budget).lte(0)) missing.push('budget');
  if (input.cost === null) missing.push('cost');
  if (input.actualProgress === null) missing.push('progress');
  if (missing.length) return { expectedCost: null, deviation: null, gate: false, missing };
  const budget = new D(input.budget!);
  const expected = budget.times(input.actualProgress!).div(100);
  const deviation = new D(input.cost!).minus(expected).div(budget).times(100);
  return { expectedCost: fixed(expected), deviation: fixed(deviation), gate: deviation.gt(GATE_THRESHOLDS.financialDeviation), missing };
}
