import { describe, expect, it } from 'vitest';
import { exposure, portfolio, type PortfolioProject } from './portfolio.js';

const project = (extra: Partial<PortfolioProject> = {}): PortfolioProject => ({
  status: 'active', score: '85.00', band: 'healthy', confidenceLevel: 'high', freshness: 'fresh', currency: 'MXN', budget: '1000000', financialDeviation: '0.00',
  financialsVisible: true, ...extra,
});

describe('portfolio (D10)', () => {
  it('an empty portfolio has no average instead of a zero', () => {
    expect(portfolio([])).toEqual({
      projects: 0, excluded: 0, assessed: 0, withoutAssessment: 0, average: null, distribution: { healthy: 0, attention: 0, risk: 0 },
      confidence: { high: 0, medium: 0, low: 0 }, freshness: { fresh: 0, stale: 0, never: 0 }, exposure: [], exposureHidden: 0,
    });
  });

  it('simple average over active and renewing projects with a score', () => {
    const result = portfolio([
      project({ score: '90.00' }),
      project({ status: 'renewing', score: '50.00', band: 'risk', confidenceLevel: 'low', freshness: 'stale' }),
      // Without assessment: counted as a project, never as healthy nor as zero.
      project({ score: null, band: null, confidenceLevel: 'low', freshness: 'never' }),
      // Planned, paused and closed are listed but do not count, whatever their score.
      project({ status: 'planned', score: '10.00', band: 'risk' }),
      project({ status: 'paused', score: '10.00', band: 'risk' }),
      project({ status: 'closed', score: '10.00', band: 'risk' }),
    ]);
    expect(result).toMatchObject({
      projects: 3, excluded: 3, assessed: 2, withoutAssessment: 1, average: '70.00',
      distribution: { healthy: 1, attention: 0, risk: 1 }, confidence: { high: 1, medium: 0, low: 1 }, freshness: { fresh: 1, stale: 1, never: 1 },
    });
    // A small and a large project weigh the same.
    expect(portfolio([project({ score: '100.00', budget: '1' }), project({ score: '0.00', band: 'risk', budget: '999999999' })]).average).toBe('50.00');
    expect(portfolio([project({ score: '80.00' }), project({ score: '80.01' }), project({ score: '80.01' })]).average).toBe('80.01');
  });

  it('exposure is the projected overrun, and currencies are never added together', () => {
    expect(exposure({ budget: '1000000', financialDeviation: '32.50' })).toBe('325000.00');
    // Under budget is not negative exposure; unknown data is unknown, not zero.
    expect(exposure({ budget: '1000000', financialDeviation: '-8.00' })).toBe('0.00');
    expect(exposure({ budget: null, financialDeviation: '10.00' })).toBeNull();
    expect(exposure({ budget: '1000', financialDeviation: null })).toBeNull();
    const result = portfolio([
      project({ budget: '1000000', financialDeviation: '10.00' }),
      project({ budget: '500000', financialDeviation: '4.00' }),
      project({ currency: 'USD', budget: '200000', financialDeviation: '5.00' }),
      project({ budget: '900000', financialDeviation: '-3.00' }),
      project({ budget: null, financialDeviation: null }),
      // Not counted: paused; hidden: the user may not see its economy.
      project({ status: 'paused', budget: '9000000', financialDeviation: '50.00' }),
      project({ budget: '7000000', financialDeviation: '50.00', financialsVisible: false }),
    ]);
    expect(result.exposure).toEqual([{ currency: 'MXN', amount: '120000.00', projects: 2 }, { currency: 'USD', amount: '10000.00', projects: 1 }]);
    expect(result.exposureHidden).toBe(1);
  });
});
