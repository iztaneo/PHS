import { describe, expect, it } from 'vitest';
import { addDays, dueDate, firstDueOnOrAfter, skipHolidays } from '../src/cadence.js';

describe('review calendar (D03)', () => {
  it('weekly and fortnightly keep the cut-off weekday', () => {
    expect(dueDate('2026-10-09', 'weekly', 1)).toBe('2026-10-16');
    expect(dueDate('2026-10-09', 'fortnightly', 2)).toBe('2026-11-06');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('monthly is a calendar month and falls back to the last day of a shorter month', () => {
    expect(dueDate('2026-01-31', 'monthly', 1)).toBe('2026-02-28');
    expect(dueDate('2026-01-31', 'monthly', 2)).toBe('2026-03-31');
    expect(dueDate('2026-01-31', 'monthly', 3)).toBe('2026-04-30');
    expect(dueDate('2027-12-31', 'monthly', 2)).toBe('2028-02-29');
    expect(dueDate('2026-11-15', 'monthly', 2)).toBe('2027-01-15');
  });

  it('a late review skips the missed dates and keeps the schedule', () => {
    // Weekly on Fridays; reviewed 10 days late, so the next cycle starts on the 20th.
    expect(firstDueOnOrAfter('2026-10-09', 'weekly', '2026-10-20')).toBe('2026-10-23');
    expect(firstDueOnOrAfter('2026-10-09', 'weekly', '2026-10-23')).toBe('2026-10-23');
    expect(firstDueOnOrAfter('2026-10-09', 'weekly', '2026-10-01')).toBe('2026-10-09');
    expect(firstDueOnOrAfter('2026-10-09', 'fortnightly', '2026-10-10')).toBe('2026-10-23');
    expect(firstDueOnOrAfter('2026-01-31', 'monthly', '2026-02-01')).toBe('2026-02-28');
    expect(firstDueOnOrAfter('2026-01-31', 'monthly', '2026-03-01')).toBe('2026-03-31');
    expect(firstDueOnOrAfter('2026-01-31', 'monthly', '2028-02-29')).toBe('2028-02-29');
  });

  it('a due date on a weekend or a holiday moves to the next working day', () => {
    const holidays = new Set(['2026-12-24', '2026-12-25', '2027-01-01']);
    expect(skipHolidays('2026-12-23', holidays)).toBe('2026-12-23');
    // Thursday and Friday are holidays, then the weekend: Monday.
    expect(skipHolidays('2026-12-24', holidays)).toBe('2026-12-28');
    expect(skipHolidays('2027-01-01', holidays)).toBe('2027-01-04');
    // Saturday and Sunday without any holiday.
    expect(skipHolidays('2026-10-10', new Set())).toBe('2026-10-12');
    expect(skipHolidays('2026-10-11', new Set())).toBe('2026-10-12');
  });
});
