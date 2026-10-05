import { Decimal } from 'decimal.js';
import { FORECAST, TREND } from './rules.js';

const D = Decimal.clone({ rounding: Decimal.ROUND_HALF_UP });
const fixed = (value: Decimal) => value.toFixed(2);

// The official assessment of one review cycle.
export interface Cut {
  cycleDueOn: string;
  effectiveOn: string;
  score: string | null;
  ruleSetVersion: string;
}

export interface Trend {
  // null when the two cuts cannot be compared; `reason` says why.
  direction: 'up' | 'down' | 'flat' | null;
  delta: string | null;
  reason: 'insufficient_history' | 'rule_set_changed' | 'no_score' | null;
  current: Cut | null;
  previous: Cut | null;
}

// Compares the last two cycle cuts, newest first. Intraday edits and retrospective recalculations
// are not cuts, so they never count as a new cycle.
export function trend(cuts: Cut[]): Trend {
  const [current = null, previous = null] = cuts;
  const none = (reason: Trend['reason']): Trend => ({ direction: null, delta: null, reason, current, previous });
  if (!current || !previous) return none('insufficient_history');
  // Scores from different rule sets are not on the same scale.
  if (current.ruleSetVersion !== previous.ruleSetVersion) return none('rule_set_changed');
  if (current.score === null || previous.score === null) return none('no_score');
  const delta = new D(current.score).minus(previous.score);
  const direction = delta.gte(TREND.improving) ? 'up' : delta.lte(TREND.deteriorating) ? 'down' : 'flat';
  return { direction, delta: fixed(delta), reason: null, current, previous };
}

export interface ForecastInput {
  // Current score; null when the project has no assessment.
  score: string | null;
  // Open commitments falling due inside the horizon, already filtered by the caller.
  milestones: { id: string; title: string; dueOn: string; critical: boolean }[];
  risks: { id: string; title: string; dueOn: string; severity: number }[];
  tasks: { id: string; title: string; dueOn: string }[];
  renewals: { id: string; dueOn: string }[];
  trend: Trend;
  projectDeviationGate: boolean;
  financialDeviationGate: boolean;
}

export interface ForecastFactor {
  code: 'milestone_due' | 'critical_milestone_due' | 'risk_mitigation_due' | 'task_due' | 'renewal_due' | 'declining_trend'
    | 'project_deviation' | 'financial_deviation';
  // What it points to, so the screen can link to it; null for factors about the project as a whole.
  target: { kind: 'milestone' | 'risk' | 'task' | 'renewal'; id: string; title: string; dueOn: string } | null;
  points: string;
}

export interface Forecast {
  pressure: string;
  // Where the score would be if nothing is done; null without a current score.
  projectedScore: string | null;
  level: 'stable' | 'at_risk' | 'deteriorating';
  factors: ForecastFactor[];
}

export function forecast(input: ForecastInput): Forecast {
  const factors: ForecastFactor[] = [];
  const add = (code: ForecastFactor['code'], points: Decimal.Value, target: ForecastFactor['target'] = null) => {
    factors.push({ code, target, points: fixed(new D(points)) });
  };
  for (const m of input.milestones) {
    const target = { kind: 'milestone' as const, id: m.id, title: m.title, dueOn: m.dueOn };
    add('milestone_due', FORECAST.milestone, target);
    if (m.critical) add('critical_milestone_due', FORECAST.criticalMilestone, target);
  }
  for (const r of input.risks) {
    add('risk_mitigation_due', new D(FORECAST.riskPerSeverityPoint).times(r.severity), { kind: 'risk', id: r.id, title: r.title, dueOn: r.dueOn });
  }
  for (const t of input.tasks) add('task_due', FORECAST.task, { kind: 'task', id: t.id, title: t.title, dueOn: t.dueOn });
  for (const n of input.renewals) add('renewal_due', FORECAST.renewal, { kind: 'renewal', id: n.id, title: `Renovación del ${n.dueOn}`, dueOn: n.dueOn });
  if (input.trend.direction === 'down') add('declining_trend', new D(input.trend.delta!).abs().times(FORECAST.perPointOfDecline));
  if (input.projectDeviationGate) add('project_deviation', FORECAST.activeDeviationGate);
  if (input.financialDeviationGate) add('financial_deviation', FORECAST.activeDeviationGate);

  const pressure = factors.reduce((sum, f) => sum.plus(f.points), new D(0));
  const projected = input.score === null ? null : D.max(0, new D(input.score).minus(pressure));
  return {
    pressure: fixed(pressure), projectedScore: projected ? fixed(projected) : null,
    level: pressure.lt(FORECAST.levels.atRisk) ? 'stable' : pressure.lt(FORECAST.levels.deteriorating) ? 'at_risk' : 'deteriorating',
    factors,
  };
}
