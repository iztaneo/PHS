import { Decimal } from 'decimal.js';
import { financialDeviation, progress, type MilestoneInput } from './metrics.js';
import { CONFIDENCE, DIMENSION_WEIGHTS, GATE_CAPS, RULE_SET_VERSION, type DimensionKey, type GateKey } from './rules.js';

// Full PHF v1 assessment (docs/producto/REGLAS-PHF-v1.md). Pure: same input, same result.
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const clamp = (value: Decimal) => D.min(100, D.max(0, value));
const fixed = (value: Decimal) => value.toFixed(2);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export interface AssessmentMilestone {
  // Operational date; "overdue" is judged against it.
  dueOn: string;
  // Date committed in the current baseline, or null when the milestone is not part of it.
  committedDueOn: string | null;
  weight: number;
  status: 'pending' | 'in_progress' | 'completed' | 'rescheduled' | 'cancelled';
  progressPct: number | null;
  critical: boolean;
  completedOn: string | null;
}

export interface AssessmentRisk {
  status: 'open' | 'mitigating' | 'mitigated' | 'materialized' | 'closed';
  probability: number;
  impact: number;
  mitigationDueOn: string;
  isClientRisk: boolean;
  isTeamRisk: boolean;
}

export interface AssessmentInput {
  // Business date in the project's time zone.
  today: string;
  hasBaseline: boolean;
  milestones: AssessmentMilestone[];
  budget: string | null;
  cost: string | null;
  effortBudgetHours: string | null;
  effortActualHours: string | null;
  risks: AssessmentRisk[];
  client: { climate: 'good' | 'tense' | 'critical' | null; hasContact: boolean; hasEscalation: boolean };
  // cadenceDays null = no review cycle configured: governance has no data.
  governance: {
    cadenceDays: number | null;
    reviewCount: number;
    daysSinceLastReview: number | null;
    reviewOverdueDays: number;
    overdueTasks: number;
    staleChanges: number;
    completedWithoutRequiredEvidence: number;
    lastReviewsWithoutSupport: number;
    unresolvedExpectations: number;
  };
  team: { memberCount: number; hasTechnicalOwner: boolean; teamChangedInLastReview: boolean };
}

// One line of the explanation: what was found, how many times, and what it cost.
export interface Deduction {
  code: string;
  count: number;
  points: string;
}

export interface DimensionResult {
  key: DimensionKey;
  weight: number;
  // null = no data: excluded from the average, lowers confidence.
  score: string | null;
  deductions: Deduction[];
}

export interface GateResult {
  key: GateKey;
  cap: number;
  active: boolean;
}

export interface Assessment {
  ruleSetVersion: string;
  // null = "Sin evaluación": no dimension has data.
  score: string | null;
  band: 'healthy' | 'attention' | 'risk' | null;
  weightedScore: string | null;
  gateCap: string | null;
  confidence: { value: string; level: 'high' | 'medium' | 'low' };
  dimensions: DimensionResult[];
  gates: GateResult[];
  metrics: {
    committedProgress: string | null;
    actualProgress: string | null;
    projectDeviation: string | null;
    financialDeviation: string | null;
    effortDeviation: string | null;
  };
}

class Score {
  private value = new D(100);
  readonly deductions: Deduction[] = [];
  constructor(start = 100) {
    this.value = new D(start);
  }
  // Subtracts count x each, optionally capped; records it only when something was subtracted.
  minus(code: string, count: number | Decimal, each: number, max?: number): void {
    const times = new D(count);
    if (times.lte(0)) return;
    let points = times.times(each);
    if (max !== undefined) points = D.min(max, points);
    this.value = this.value.minus(points);
    this.deductions.push({ code, count: times.toDecimalPlaces(2).toNumber(), points: fixed(points) });
  }
  result(): string {
    return fixed(clamp(this.value));
  }
}

const open = (m: AssessmentMilestone) => m.status !== 'completed' && m.status !== 'cancelled';
const activeRisk = (r: AssessmentRisk) => r.status === 'open' || r.status === 'mitigating';

export function assess(input: AssessmentInput): Assessment {
  const { today } = input;
  const milestones = input.milestones.filter((m) => m.status !== 'cancelled');
  const committed: MilestoneInput[] = milestones.filter((m) => m.committedDueOn !== null)
    .map((m) => ({ weight: m.weight, committedDueOn: m.committedDueOn!, status: m.status, progressPct: m.progressPct }));
  const prog = input.hasBaseline ? progress(committed, today) : { committed: null, actual: null, deviation: null, gate: false };
  const fin = financialDeviation({ budget: input.budget, cost: input.cost, actualProgress: prog.actual });
  const effort = input.effortBudgetHours !== null && new D(input.effortBudgetHours).gt(0) && input.effortActualHours !== null
    ? new D(input.effortActualHours).minus(input.effortBudgetHours).div(input.effortBudgetHours).times(100) : null;

  const overdue = milestones.filter((m) => open(m) && m.dueOn < today);
  const criticalOverdue = overdue.filter((m) => m.critical).length;

  const dimensions: DimensionResult[] = [];
  const add = (key: DimensionKey, hasData: boolean, build: (s: Score) => void, start = 100) => {
    if (!hasData) { dimensions.push({ key, weight: DIMENSION_WEIGHTS[key], score: null, deductions: [] }); return; }
    const score = new Score(start);
    build(score);
    dimensions.push({ key, weight: DIMENSION_WEIGHTS[key], score: score.result(), deductions: score.deductions });
  };

  add('performance', milestones.length > 0, (s) => {
    s.minus('milestone_overdue', overdue.length, 20);
    s.minus('critical_milestone_overdue', criticalOverdue, 8);
    s.minus('milestone_due_soon', milestones.filter((m) => open(m) && m.dueOn >= today && daysBetween(today, m.dueOn) <= 3).length, 4);
    if (prog.deviation !== null) s.minus('project_deviation', new D(prog.deviation), 1.6, 35);
    s.minus('milestone_completed_late', milestones.filter((m) => m.status === 'completed' && m.completedOn !== null && m.completedOn > (m.committedDueOn ?? m.dueOn)).length, 5);
    s.minus('milestone_rescheduled', milestones.filter((m) => m.status === 'rescheduled').length, 6);
  });

  add('financial', fin.deviation !== null, (s) => {
    if (new D(fin.deviation!).gt(0)) s.minus('financial_deviation', new D(fin.deviation!), 7.5, 75);
    if (effort?.gt(0)) s.minus('effort_overrun', effort, 1.2, 20);
  });

  add('risks', input.risks.length > 0, (s) => {
    s.minus('risk_materialized', input.risks.filter((r) => r.status === 'materialized').length, 22);
    const active = input.risks.filter(activeRisk);
    s.minus('risk_severity', active.reduce((sum, r) => sum + r.probability * r.impact, 0), 2);
    s.minus('risk_mitigation_overdue', active.filter((r) => r.mitigationDueOn < today).length, 12);
    s.minus('risk_mitigation_due_soon', active.filter((r) => r.mitigationDueOn >= today && daysBetween(today, r.mitigationDueOn) <= 3).length, 4);
  });

  const clientRisks = input.risks.filter((r) => activeRisk(r) && r.isClientRisk).length;
  const climateBase = { good: 100, tense: 68, critical: 38 } as const;
  add('client', input.client.climate !== null || clientRisks > 0 || input.client.hasContact, (s) => {
    s.minus('client_risk', clientRisks, 10);
    s.minus('client_contact_missing', input.client.hasContact ? 0 : 1, 6);
    s.minus('client_escalation_missing', input.client.hasEscalation ? 0 : 1, 4);
  }, input.client.climate ? climateBase[input.client.climate] : 82);

  const g = input.governance;
  add('governance', g.cadenceDays !== null, (s) => {
    s.minus('no_reviews', g.reviewCount === 0 ? 1 : 0, 30);
    if (g.daysSinceLastReview !== null) s.minus('review_late', g.daysSinceLastReview - g.cadenceDays!, 3, 40);
    s.minus('review_overdue', g.reviewOverdueDays, 3, 30);
    s.minus('task_overdue', g.overdueTasks, 10);
    s.minus('change_undecided', g.staleChanges, 8);
    s.minus('evidence_missing', g.completedWithoutRequiredEvidence, 4);
    s.minus('no_baseline', input.hasBaseline ? 0 : 1, 20);
  });

  add('team', input.team.memberCount > 0 || input.team.hasTechnicalOwner, (s) => {
    s.minus('no_team_members', input.team.memberCount === 0 ? 1 : 0, 25);
    s.minus('no_technical_owner', input.team.hasTechnicalOwner ? 0 : 1, 15);
    s.minus('team_risk', input.risks.filter((r) => activeRisk(r) && r.isTeamRisk).length, 14);
    s.minus('team_changed', input.team.teamChangedInLastReview ? 1 : 0, 8);
    s.minus('effort_overrun_high', effort?.gt(10) ? 1 : 0, 10);
  });

  const gateOn: Record<GateKey, boolean> = {
    project_deviation: prog.gate,
    financial_deviation: fin.gate,
    critical_milestone_overdue: criticalOverdue > 0,
    critical_risk: input.risks.some((r) => r.status === 'materialized' || (activeRisk(r) && r.probability * r.impact >= 6 && r.mitigationDueOn < today)),
    review_overdue: g.reviewOverdueDays > 0,
    client_critical: input.client.climate === 'critical',
  };
  const gates: GateResult[] = (Object.keys(GATE_CAPS) as GateKey[]).map((key) => ({ key, cap: GATE_CAPS[key], active: gateOn[key] }));

  const withData = dimensions.filter((d) => d.score !== null);
  let score: string | null = null; let weightedScore: string | null = null; let gateCap: string | null = null;
  let band: Assessment['band'] = null;
  if (withData.length > 0) {
    const weights = withData.reduce((sum, d) => sum + d.weight, 0);
    const weighted = withData.reduce((sum, d) => sum.plus(new D(d.score!).times(d.weight)), new D(0)).div(weights);
    const cap = new D(Math.min(100, ...gates.filter((x) => x.active).map((x) => x.cap)));
    // Both are rounded first so the stored values satisfy score = least(weighted, cap) exactly.
    weightedScore = fixed(weighted);
    gateCap = fixed(cap);
    const final = D.min(new D(weightedScore), new D(gateCap));
    score = fixed(final);
    band = final.gte(80) ? 'healthy' : final.gte(60) ? 'attention' : 'risk';
  }

  const confidence = new Score();
  const cadence = g.cadenceDays ?? CONFIDENCE.defaultCadenceDays;
  if (g.daysSinceLastReview === null || g.daysSinceLastReview > cadence * 2) confidence.minus('review_stale', 1, 45);
  else if (g.daysSinceLastReview > cadence) confidence.minus('review_stale', 1, 25);
  else if (g.daysSinceLastReview > cadence * 0.75) confidence.minus('review_stale', 1, 8);
  confidence.minus('dimension_without_data', dimensions.length - withData.length, 8);
  confidence.minus('review_without_support', g.lastReviewsWithoutSupport, 9);
  confidence.minus('expectation_unresolved', g.unresolvedExpectations, 5, 24);
  confidence.minus('no_baseline', input.hasBaseline ? 0 : 1, 12);
  const confidenceValue = new D(confidence.result());

  return {
    ruleSetVersion: RULE_SET_VERSION, score, band, weightedScore, gateCap,
    confidence: { value: fixed(confidenceValue), level: confidenceValue.gte(75) ? 'high' : confidenceValue.gte(50) ? 'medium' : 'low' },
    dimensions, gates,
    metrics: {
      committedProgress: prog.committed, actualProgress: prog.actual, projectDeviation: prog.deviation,
      financialDeviation: fin.deviation, effortDeviation: effort ? fixed(effort) : null,
    },
  };
}
