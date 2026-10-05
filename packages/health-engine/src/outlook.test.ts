import { describe, expect, it } from 'vitest';
import { forecast, trend, type Cut, type ForecastInput } from './outlook.js';

const cut = (score: string | null, cycleDueOn: string, ruleSetVersion = 'phf-v1'): Cut => ({ cycleDueOn, effectiveOn: cycleDueOn, score, ruleSetVersion });

describe('trend (RN-09, example 15)', () => {
  it('compares the last two cycle cuts', () => {
    expect(trend([cut('82.00', '2026-10-16'), cut('78.50', '2026-10-09')])).toMatchObject({ direction: 'up', delta: '3.50', reason: null });
    expect(trend([cut('70.00', '2026-10-16'), cut('73.00', '2026-10-09')])).toMatchObject({ direction: 'down', delta: '-3.00' });
    // Less than three points either way is stable.
    expect(trend([cut('80.99', '2026-10-16'), cut('78.00', '2026-10-09')])).toMatchObject({ direction: 'flat', delta: '2.99' });
    expect(trend([cut('75.01', '2026-10-16'), cut('78.00', '2026-10-09')])).toMatchObject({ direction: 'flat', delta: '-2.99' });
    // Only the two newest count.
    expect(trend([cut('90.00', '2026-10-23'), cut('80.00', '2026-10-16'), cut('20.00', '2026-10-09')]).delta).toBe('10.00');
  });

  it('says why two cuts cannot be compared instead of inventing a direction', () => {
    expect(trend([])).toMatchObject({ direction: null, delta: null, reason: 'insufficient_history', current: null, previous: null });
    expect(trend([cut('80.00', '2026-10-16')])).toMatchObject({ direction: null, reason: 'insufficient_history', previous: null });
    expect(trend([cut('80.00', '2026-10-16', 'phf-v2'), cut('60.00', '2026-10-09')])).toMatchObject({ direction: null, reason: 'rule_set_changed' });
    expect(trend([cut(null, '2026-10-16'), cut('60.00', '2026-10-09')])).toMatchObject({ direction: null, reason: 'no_score' });
  });
});

describe('forecast (RN-10)', () => {
  const quiet: ForecastInput = {
    score: '85.00', milestones: [], risks: [], tasks: [], renewals: [], trend: trend([]), projectDeviationGate: false, financialDeviationGate: false,
  };

  it('nothing coming means no pressure', () => {
    expect(forecast(quiet)).toEqual({ pressure: '0.00', projectedScore: '85.00', level: 'stable', factors: [] });
  });

  it('adds up every factor and names it', () => {
    const result = forecast({
      ...quiet,
      milestones: [{ id: 'm1', title: 'Entrega', dueOn: '2026-10-20', critical: true }, { id: 'm2', title: 'Demo', dueOn: '2026-10-22', critical: false }],
      risks: [{ id: 'r1', title: 'Proveedor', dueOn: '2026-10-21', severity: 6 }],
      tasks: [{ id: 't1', title: 'Llamar', dueOn: '2026-10-19' }],
      renewals: [{ id: 'n1', dueOn: '2026-10-30' }],
      trend: trend([cut('85.00', '2026-10-16'), cut('90.00', '2026-10-09')]),
      projectDeviationGate: true, financialDeviationGate: true,
    });
    // 4 + 4 + 4 (milestones) + 7.2 (risk) + 2 (task) + 6 (renewal) + 6 (five points down) + 8 + 8
    expect(result.pressure).toBe('49.20');
    expect(result.projectedScore).toBe('35.80');
    expect(result.level).toBe('deteriorating');
    expect(result.factors.map((f) => [f.code, f.points, f.target?.id ?? null])).toEqual([
      ['milestone_due', '4.00', 'm1'], ['critical_milestone_due', '4.00', 'm1'], ['milestone_due', '4.00', 'm2'],
      ['risk_mitigation_due', '7.20', 'r1'], ['task_due', '2.00', 't1'], ['renewal_due', '6.00', 'n1'],
      ['declining_trend', '6.00', null], ['project_deviation', '8.00', null], ['financial_deviation', '8.00', null],
    ]);
  });

  it('levels at 8 and 20, never below zero, and no projection without a score', () => {
    const tasks = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: 'Acción', dueOn: '2026-10-19' }));
    expect(forecast({ ...quiet, tasks: tasks(3) }).level).toBe('stable');
    expect(forecast({ ...quiet, tasks: tasks(4) }).level).toBe('at_risk');
    expect(forecast({ ...quiet, tasks: tasks(9) }).level).toBe('at_risk');
    expect(forecast({ ...quiet, tasks: tasks(10) }).level).toBe('deteriorating');
    expect(forecast({ ...quiet, score: '10.00', tasks: tasks(10) }).projectedScore).toBe('0.00');
    expect(forecast({ ...quiet, score: null, tasks: tasks(2) })).toMatchObject({ pressure: '4.00', projectedScore: null });
    // A stable or improving trend adds nothing.
    expect(forecast({ ...quiet, trend: trend([cut('90.00', '2026-10-16'), cut('80.00', '2026-10-09')]) }).pressure).toBe('0.00');
  });
});
