// PHF rule set v1 (docs/producto/REGLAS-PHF-v1.md). Changing a value here means a new version.
export const RULE_SET_VERSION = 'phf-v1';

// Strict thresholds: exactly 10 or exactly 3 does not trigger the gate.
export const GATE_THRESHOLDS = { projectDeviation: '10', financialDeviation: '3' } as const;
