import { describe, expect, it } from 'vitest';
import { financialDeviation, progress, type MilestoneInput } from './metrics.js';

// Cases numbered as in docs/producto/REGLAS-PHF-v1.md section 7.
const TODAY = '2026-06-15';
const past = '2026-05-01';
const future = '2026-09-01';
const m = (weight: number, committedDueOn: string, status: MilestoneInput['status'], progressPct: number | null = null): MilestoneInput =>
  ({ weight, committedDueOn, status, progressPct });

describe('progress by milestone weight', () => {
  it('case 1: equal weights, one done and one in progress at 40%', () => {
    const result = progress([m(1, past, 'completed'), m(1, past, 'in_progress', 40), m(1, future, 'pending'), m(1, future, 'pending')], TODAY);
    expect(result).toEqual({ committed: '50.00', actual: '35.00', deviation: '15.00', gate: true });
  });

  it('case 2: weights 3, 1, 1, 1', () => {
    const result = progress([m(3, past, 'completed'), m(1, past, 'pending'), m(1, future, 'pending'), m(1, future, 'pending')], TODAY);
    expect(result).toEqual({ committed: '66.67', actual: '50.00', deviation: '16.67', gate: true });
  });

  it('cases 3 and 4: exactly 10 does not trigger the gate, 10.01 does', () => {
    const at = (pct: number) => progress([m(1, past, 'in_progress', pct)], TODAY);
    expect(at(90)).toMatchObject({ deviation: '10.00', gate: false });
    expect(at(89.99)).toMatchObject({ deviation: '10.01', gate: true });
  });

  it('a milestone due today is not yet due; being ahead is not a negative deviation', () => {
    expect(progress([m(1, TODAY, 'pending')], TODAY)).toMatchObject({ committed: '0.00', deviation: '0.00' });
    expect(progress([m(1, future, 'completed'), m(1, future, 'pending')], TODAY)).toEqual({ committed: '0.00', actual: '50.00', deviation: '0.00', gate: false });
  });

  it('cancelled milestones do not count; in progress without a reported percentage counts as zero; rescheduled uses its percentage', () => {
    expect(progress([m(1, past, 'completed'), m(5, past, 'cancelled')], TODAY)).toMatchObject({ committed: '100.00', actual: '100.00' });
    expect(progress([m(1, past, 'in_progress')], TODAY)).toMatchObject({ actual: '0.00', deviation: '100.00' });
    expect(progress([m(1, past, 'rescheduled', 75)], TODAY)).toMatchObject({ actual: '75.00', deviation: '25.00' });
  });

  it('has no data without milestones that count', () => {
    const none = { committed: null, actual: null, deviation: null, gate: false };
    expect(progress([], TODAY)).toEqual(none);
    expect(progress([m(1, past, 'cancelled')], TODAY)).toEqual(none);
  });
});

describe('financial deviation against actual progress', () => {
  const at = (cost: string, actualProgress = '50.00') => financialDeviation({ budget: '100000', cost, actualProgress });

  it('cases 5, 6 and 7: 4% triggers, exactly 3% does not, 3.01% does', () => {
    expect(at('54000')).toEqual({ expectedCost: '50000.00', deviation: '4.00', gate: true, missing: [] });
    expect(at('53000')).toMatchObject({ deviation: '3.00', gate: false });
    expect(at('53010')).toMatchObject({ deviation: '3.01', gate: true });
  });

  it('case 8: spending without progress is visible', () => {
    expect(at('50000', '20.00')).toMatchObject({ expectedCost: '20000.00', deviation: '30.00', gate: true });
  });

  it('spending below progress is a negative deviation, never a gate', () => {
    expect(at('30000')).toMatchObject({ deviation: '-20.00', gate: false });
  });

  it('case 13: unknown or zero budget, missing cost or progress give no data, not zero', () => {
    expect(financialDeviation({ budget: null, cost: '10', actualProgress: '50.00' })).toEqual({ expectedCost: null, deviation: null, gate: false, missing: ['budget'] });
    expect(financialDeviation({ budget: '0', cost: null, actualProgress: null }).missing).toEqual(['budget', 'cost', 'progress']);
    expect(financialDeviation({ budget: '100', cost: '0', actualProgress: '0.00' })).toMatchObject({ deviation: '0.00', missing: [] });
  });

  it('keeps cents exact with large amounts', () => {
    expect(financialDeviation({ budget: '9999999999999999.99', cost: '3333333333333333.33', actualProgress: '33.33' }).deviation).toBe('0.00');
    expect(financialDeviation({ budget: '0.03', cost: '0.02', actualProgress: '33.33' }).deviation).toBe('33.34');
  });
});
