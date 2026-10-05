import { Decimal } from 'decimal.js';

const D = Decimal.clone({ rounding: Decimal.ROUND_HALF_UP });
const fixed = (value: Decimal) => value.toFixed(2);

// One project as the portfolio sees it. Decision D10 (2026-10-05).
export interface PortfolioProject {
  status: 'planned' | 'active' | 'paused' | 'renewing' | 'closed';
  // null: "sin evaluación". It is never counted as healthy nor as zero.
  score: string | null;
  band: 'healthy' | 'attention' | 'risk' | null;
  confidenceLevel: 'high' | 'medium' | 'low' | null;
  // Review freshness: within its cadence, older than that, or never reviewed.
  freshness: 'fresh' | 'stale' | 'never';
  currency: string;
  // null when unknown or when the user may not see the economy of the project.
  budget: string | null;
  financialDeviation: string | null;
  financialsVisible: boolean;
}

export interface PortfolioIndicators {
  // Active and renewing projects: the only ones that count.
  projects: number;
  // Planned, paused and closed: listed, not counted.
  excluded: number;
  assessed: number;
  withoutAssessment: number;
  // Simple average of the projects with a score; null when none has one.
  average: string | null;
  distribution: { healthy: number; attention: number; risk: number };
  confidence: { high: number; medium: number; low: number };
  freshness: { fresh: number; stale: number; never: number };
  // Projected overrun, one total per currency: amounts in different currencies are never added.
  exposure: { currency: string; amount: string; projects: number }[];
  // Counted projects whose economy the user may not see, so the exposure does not include them.
  exposureHidden: number;
}

export const countsInPortfolio = (status: PortfolioProject['status']): boolean => status === 'active' || status === 'renewing';

// Projected overrun of one project: budget x financial deviation, only when the deviation is positive.
export function exposure(project: Pick<PortfolioProject, 'budget' | 'financialDeviation'>): string | null {
  if (project.budget === null || project.financialDeviation === null) return null;
  const deviation = new D(project.financialDeviation);
  if (deviation.lte(0)) return '0.00';
  return fixed(new D(project.budget).times(deviation).div(100));
}

export function portfolio(all: PortfolioProject[]): PortfolioIndicators {
  const counted = all.filter((p) => countsInPortfolio(p.status));
  const scored = counted.filter((p) => p.score !== null);
  const tally = <K extends string>(keys: readonly K[], pick: (p: PortfolioProject) => K | null) =>
    Object.fromEntries(keys.map((k) => [k, counted.filter((p) => pick(p) === k).length])) as Record<K, number>;
  const byCurrency = new Map<string, { amount: Decimal; projects: number }>();
  for (const p of counted) {
    const amount = p.financialsVisible ? exposure(p) : null;
    if (amount === null || new D(amount).lte(0)) continue;
    const current = byCurrency.get(p.currency) ?? { amount: new D(0), projects: 0 };
    byCurrency.set(p.currency, { amount: current.amount.plus(amount), projects: current.projects + 1 });
  }
  return {
    projects: counted.length, excluded: all.length - counted.length, assessed: scored.length, withoutAssessment: counted.length - scored.length,
    average: scored.length ? fixed(scored.reduce((sum, p) => sum.plus(p.score!), new D(0)).div(scored.length)) : null,
    distribution: tally(['healthy', 'attention', 'risk'] as const, (p) => p.band),
    confidence: tally(['high', 'medium', 'low'] as const, (p) => (p.score === null ? null : p.confidenceLevel)),
    freshness: tally(['fresh', 'stale', 'never'] as const, (p) => p.freshness),
    exposure: [...byCurrency.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, v]) => ({ currency, amount: fixed(v.amount), projects: v.projects })),
    exposureHidden: counted.filter((p) => !p.financialsVisible).length,
  };
}
