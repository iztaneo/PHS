import { describe, expect, it } from 'vitest';
import { assess, type AssessmentInput, type AssessmentMilestone, type AssessmentRisk } from './assessment.js';

// Cases numbered as in docs/producto/REGLAS-PHF-v1.md section 7.
const TODAY = '2026-06-15';
const milestone = (over: Partial<AssessmentMilestone> = {}): AssessmentMilestone => ({
  dueOn: '2026-09-01', committedDueOn: '2026-09-01', weight: 1, status: 'pending', progressPct: null, critical: false, completedOn: null, ...over,
});
const risk = (over: Partial<AssessmentRisk> = {}): AssessmentRisk => ({
  status: 'open', probability: 1, impact: 1, mitigationDueOn: '2026-12-01', isClientRisk: false, isTeamRisk: false, ...over,
});
const empty: AssessmentInput = {
  today: TODAY, hasBaseline: false, milestones: [], budget: null, cost: null, effortBudgetHours: null, effortActualHours: null,
  risks: [], client: { climate: null, hasContact: false, hasEscalation: false },
  governance: {
    cadenceDays: null, reviewCount: 0, daysSinceLastReview: null, reviewOverdueDays: 0, overdueTasks: 0, staleChanges: 0,
    completedWithoutRequiredEvidence: 0, lastReviewsWithoutSupport: 0, unresolvedExpectations: 0,
  },
  team: { memberCount: 0, hasTechnicalOwner: false, teamChangedInLastReview: false },
};
const dim = (result: ReturnType<typeof assess>, key: string) => result.dimensions.find((d) => d.key === key)!;

describe('assessment', () => {
  it('case 12: a project without data has no score and no colour', () => {
    const result = assess(empty);
    expect(result).toMatchObject({ score: null, band: null, weightedScore: null, gateCap: null, ruleSetVersion: 'phf-v1' });
    expect(result.dimensions.every((d) => d.score === null)).toBe(true);
    // 100 - 45 (no review) - 6 x 8 (dimensions without data) - 12 (no baseline) = -5 -> 0.
    expect(result.confidence).toMatchObject({ value: '0.00', level: 'low' });
  });

  it('cases 9 and 10: weighted average of the dimensions with data, limited by the lowest active gate', () => {
    // Performance 80: one overdue milestone. Financial 60: deviation of 5.33 %.
    const base: AssessmentInput = {
      ...empty, hasBaseline: true, budget: '100000', cost: '55333.33',
      milestones: [
        milestone({ dueOn: '2026-06-01', committedDueOn: '2026-09-01', status: 'in_progress', progressPct: 100 }),
        milestone({ status: 'completed', completedOn: '2026-05-01', committedDueOn: '2026-09-01', weight: 1 }),
      ],
    };
    const noGate = assess({ ...base, cost: '100000', budget: '100000' });
    expect(dim(noGate, 'performance').score).toBe('80.00');
    const result = assess({ ...base, budget: '300', cost: '316' });
    expect(result.metrics).toMatchObject({ actualProgress: '100.00', financialDeviation: '5.33' });
    // Deductions use the deviation as stored, with two decimals: 100 - 5.33 x 7.5 = 60.03.
    expect(dim(result, 'financial').score).toBe('60.03');
    // (80 x 25 + 60.03 x 20) / 45 = 71.12, capped at 58 by the financial gate.
    expect(result).toMatchObject({ weightedScore: '71.12', gateCap: '58.00', score: '58.00', band: 'risk' });
    const exact = assess({ ...base, budget: '300', cost: '309' });
    expect(exact.metrics.financialDeviation).toBe('3.00');
    expect(exact.gates.find((g) => g.key === 'financial_deviation')?.active).toBe(false);
    expect(exact).toMatchObject({ gateCap: '100.00', band: 'attention' });
  });

  it('case 14: with several gates the lowest cap applies', () => {
    const result = assess({
      ...empty, hasBaseline: true,
      milestones: [milestone({ dueOn: '2026-05-01', committedDueOn: '2026-05-01', critical: true }), milestone(), milestone(), milestone()],
    });
    // Committed 25 %, actual 0 %: deviation 25 points (gate 55) and a critical milestone overdue (gate 50).
    expect(result.metrics.projectDeviation).toBe('25.00');
    expect(result.gates.filter((g) => g.active).map((g) => g.key)).toEqual(['project_deviation', 'critical_milestone_overdue']);
    expect(result.gateCap).toBe('50.00');
    // 100 - 20 (overdue) - 8 (critical) - 35 (deviation, capped) = 37.
    expect(dim(result, 'performance')).toMatchObject({
      score: '37.00',
      deductions: [
        { code: 'milestone_overdue', count: 1, points: '20.00' },
        { code: 'critical_milestone_overdue', count: 1, points: '8.00' },
        { code: 'project_deviation', count: 25, points: '35.00' },
      ],
    });
    expect(result).toMatchObject({ score: '37.00', band: 'risk' });
  });

  it('case 11: the band is decided with the stored value, not with a rounded display', () => {
    // Performance alone: 100 - 20 - 0.016 (deviation 0.01 x 1.6) = 79.98.
    const result = assess({
      ...empty, hasBaseline: true,
      milestones: [milestone({ dueOn: '2026-05-01', committedDueOn: '2026-05-01', status: 'in_progress', progressPct: 99.99 })],
    });
    expect(result).toMatchObject({ score: '79.98', band: 'attention' });
  });

  it('performance: due soon, completed late and rescheduled', () => {
    const result = assess({
      ...empty, hasBaseline: true,
      milestones: [
        milestone({ dueOn: '2026-06-17' }),
        milestone({ dueOn: TODAY }),
        milestone({ status: 'completed', completedOn: '2026-03-10', committedDueOn: '2026-03-01', dueOn: '2026-03-01' }),
        milestone({ status: 'rescheduled', dueOn: '2026-10-01', progressPct: 0 }),
        milestone({ status: 'cancelled', dueOn: '2026-01-01', committedDueOn: '2026-01-01', critical: true }),
      ],
    });
    expect(dim(result, 'performance').deductions).toEqual([
      { code: 'milestone_due_soon', count: 2, points: '8.00' },
      { code: 'milestone_completed_late', count: 1, points: '5.00' },
      { code: 'milestone_rescheduled', count: 1, points: '6.00' },
    ]);
    expect(dim(result, 'performance').score).toBe('81.00');
    expect(result.gates.some((g) => g.active)).toBe(false);
  });

  it('risks: severity, overdue mitigation, materialized, and the critical risk gate', () => {
    const scored = assess({
      ...empty,
      risks: [
        risk({ probability: 2, impact: 2 }),
        risk({ probability: 1, impact: 2, mitigationDueOn: '2026-06-01' }),
        risk({ mitigationDueOn: '2026-06-16' }),
        risk({ status: 'closed', probability: 3, impact: 3, mitigationDueOn: '2026-01-01' }),
        risk({ status: 'mitigated', probability: 3, impact: 3, mitigationDueOn: '2026-01-01' }),
      ],
    });
    // 100 - 2 x (4 + 2 + 1) - 12 - 4 = 70; closed and mitigated risks do not count.
    expect(dim(scored, 'risks').score).toBe('70.00');
    expect(scored.gates.find((g) => g.key === 'critical_risk')?.active).toBe(false);
    const critical = assess({ ...empty, risks: [risk({ probability: 2, impact: 3, mitigationDueOn: '2026-06-14' })] });
    expect(critical.gates.find((g) => g.key === 'critical_risk')?.active).toBe(true);
    const notOverdue = assess({ ...empty, risks: [risk({ probability: 3, impact: 3, mitigationDueOn: TODAY })] });
    expect(notOverdue.gates.find((g) => g.key === 'critical_risk')?.active).toBe(false);
    const materialized = assess({ ...empty, risks: [risk({ status: 'materialized' })] });
    expect(dim(materialized, 'risks').score).toBe('78.00');
    expect(materialized).toMatchObject({ gateCap: '50.00', score: '50.00' });
  });

  it('client: climate sets the base; a critical client caps the score', () => {
    const contact = { hasContact: true, hasEscalation: true };
    expect(dim(assess({ ...empty, client: { climate: null, ...contact } }), 'client').score).toBe('82.00');
    expect(dim(assess({ ...empty, client: { climate: 'good', hasContact: true, hasEscalation: false } }), 'client').score).toBe('96.00');
    expect(dim(assess({ ...empty, client: { climate: 'tense', ...contact }, risks: [risk({ isClientRisk: true })] }), 'client').score).toBe('58.00');
    const critical = assess({ ...empty, client: { climate: 'critical', hasContact: false, hasEscalation: false } });
    expect(dim(critical, 'client').score).toBe('28.00');
    expect(critical).toMatchObject({ gateCap: '45.00', score: '28.00' });
    expect(dim(assess(empty), 'client').score).toBeNull();
  });

  it('governance: no data without a cycle; with a cycle it measures reviews, tasks, changes and baseline', () => {
    expect(dim(assess(empty), 'governance').score).toBeNull();
    const governance = { ...empty.governance, cadenceDays: 7 };
    expect(dim(assess({ ...empty, governance }), 'governance').deductions.map((d) => d.code)).toEqual(['no_reviews', 'no_baseline']);
    const late = assess({
      ...empty, hasBaseline: true,
      governance: { ...governance, reviewCount: 3, daysSinceLastReview: 10, reviewOverdueDays: 3, overdueTasks: 1, staleChanges: 1, completedWithoutRequiredEvidence: 2 },
    });
    // 100 - 9 (3 days late x 3) - 9 (3 days overdue x 3) - 10 - 8 - 8 = 56.
    expect(dim(late, 'governance').score).toBe('56.00');
    expect(late.gates.find((g) => g.key === 'review_overdue')?.active).toBe(true);
    expect(late.gateCap).toBe('65.00');
  });

  it('team and effort overrun', () => {
    expect(dim(assess({ ...empty, team: { memberCount: 0, hasTechnicalOwner: true, teamChangedInLastReview: false } }), 'team').score).toBe('75.00');
    const result = assess({
      ...empty, hasBaseline: true, effortBudgetHours: '1000', effortActualHours: '1150', budget: '100', cost: '50',
      milestones: [milestone({ status: 'completed', completedOn: '2026-01-01' }), milestone()],
      team: { memberCount: 2, hasTechnicalOwner: true, teamChangedInLastReview: true },
      risks: [risk({ isTeamRisk: true })],
    });
    expect(result.metrics.effortDeviation).toBe('15.00');
    // 100 - 14 (team risk) - 8 (team changed) - 10 (overrun above 10 %) = 68.
    expect(dim(result, 'team').score).toBe('68.00');
    // Financial deviation 0 %: only the effort overrun counts, 15 x 1.2 = 18.
    expect(dim(result, 'financial')).toMatchObject({ score: '82.00', deductions: [{ code: 'effort_overrun', count: 15, points: '18.00' }] });
  });

  it('case 13 and confidence: missing data lowers confidence, not the score', () => {
    const result = assess({
      ...empty, hasBaseline: true, milestones: [milestone({ status: 'completed', completedOn: '2026-05-01' })],
      team: { memberCount: 1, hasTechnicalOwner: true, teamChangedInLastReview: false },
      governance: { ...empty.governance, cadenceDays: 7, reviewCount: 4, daysSinceLastReview: 6, lastReviewsWithoutSupport: 1, unresolvedExpectations: 6 },
    });
    expect(dim(result, 'financial').score).toBeNull();
    expect(result.score).not.toBeNull();
    // 100 - 8 (review older than 3/4 of the cadence) - 3 x 8 (financial, risks, client) - 9 - 24 (capped) = 35.
    expect(result.confidence).toMatchObject({ value: '35.00', level: 'low' });
    // Every point taken from 100 is explained.
    expect(result.confidence.deductions.reduce((sum, d) => sum + Number(d.points), 0)).toBe(65);
    expect(result.confidence.deductions.map((d) => d.code)).toContain('review_stale');
    const fresh = assess({ ...empty, hasBaseline: true, governance: { ...empty.governance, cadenceDays: 7, reviewCount: 1, daysSinceLastReview: 2 }, milestones: [milestone()],
      team: { memberCount: 1, hasTechnicalOwner: true, teamChangedInLastReview: false }, risks: [risk()], client: { climate: 'good', hasContact: true, hasEscalation: true }, budget: '10', cost: '0' });
    expect(fresh.confidence).toEqual({ value: '100.00', level: 'high', deductions: [] });
  });

  it('is deterministic: the same input gives the same result', () => {
    const input: AssessmentInput = { ...empty, hasBaseline: true, milestones: [milestone({ dueOn: '2026-05-01', committedDueOn: '2026-05-01' })], risks: [risk()] };
    expect(assess(input)).toEqual(assess(JSON.parse(JSON.stringify(input))));
  });
});
