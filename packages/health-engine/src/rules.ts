// PHF rule set v1 (docs/producto/REGLAS-PHF-v1.md). Changing a value here means a new version.
export const RULE_SET_VERSION = 'phf-v1';

// Strict thresholds: exactly 10 or exactly 3 does not trigger the gate.
export const GATE_THRESHOLDS = { projectDeviation: '10', financialDeviation: '3' } as const;

export const DIMENSION_WEIGHTS = { performance: 25, financial: 20, risks: 20, client: 12, governance: 13, team: 10 } as const;
export type DimensionKey = keyof typeof DIMENSION_WEIGHTS;

// When a gate is active the score cannot exceed its cap; the lowest active cap applies.
export const GATE_CAPS = {
  project_deviation: 55,
  financial_deviation: 58,
  critical_milestone_overdue: 50,
  critical_risk: 50,
  review_overdue: 65,
  client_critical: 45,
} as const;
export type GateKey = keyof typeof GATE_CAPS;

// D03: reviews are weekly unless the project configures another cadence.
export const CONFIDENCE = { defaultCadenceDays: 7 } as const;

// Stored with every rule set row so an assessment can be traced to the exact values used.
export const RULE_SET_DEFINITION = {
  version: RULE_SET_VERSION, gateThresholds: GATE_THRESHOLDS, dimensionWeights: DIMENSION_WEIGHTS, gateCaps: GATE_CAPS,
  bands: { healthy: 80, attention: 60 }, confidence: CONFIDENCE,
} as const;
