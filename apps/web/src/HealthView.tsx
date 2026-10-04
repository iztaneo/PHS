import { useEffect, useState } from 'react';
import { api, errorMessage, type Assessment, type ProjectDetail } from './api';
import { Badge, Card, Loading, Notice, type Tone } from './ui';

const BAND: Record<string, { label: string; tone: Tone; text: string }> = {
  healthy: { label: 'Saludable', tone: 'green', text: 'text-ok' },
  attention: { label: 'En atención', tone: 'amber', text: 'text-warn' },
  risk: { label: 'En riesgo', tone: 'red', text: 'text-bad' },
};
const CONFIDENCE = { high: 'Alta', medium: 'Media', low: 'Baja' } as const;
const DIMENSION: Record<string, string> = {
  performance: 'Desempeño', financial: 'Financiero', risks: 'Riesgos', client: 'Cliente', governance: 'Gobernanza', team: 'Equipo',
};
const NO_DATA: Record<string, string> = {
  performance: 'No hay hitos registrados.',
  financial: 'Falta presupuesto, costo registrado o hitos comprometidos.',
  risks: 'No hay riesgos registrados.',
  client: 'No hay clima del cliente, riesgos de cliente ni contacto.',
  governance: 'No hay ciclo de revisión configurado.',
  team: 'No hay integrantes ni responsable técnico.',
};
const GATE: Record<string, string> = {
  project_deviation: 'Desviación de proyecto mayor a 10 puntos',
  financial_deviation: 'Desviación financiera mayor a 3%',
  critical_milestone_overdue: 'Hito crítico vencido',
  critical_risk: 'Riesgo crítico vencido o materializado',
  review_overdue: 'Revisión vencida',
  client_critical: 'Cliente en situación crítica',
};
// What was found, in words. `n` is how many times, or the measured magnitude.
const DEDUCTION: Record<string, (n: number) => string> = {
  milestone_overdue: (n) => `${n} hito(s) vencido(s)`,
  critical_milestone_overdue: (n) => `${n} de ellos crítico(s)`,
  milestone_due_soon: (n) => `${n} hito(s) vence(n) en 3 días o menos`,
  project_deviation: (n) => `Desviación de proyecto de ${n} puntos`,
  milestone_completed_late: (n) => `${n} hito(s) cumplido(s) después de su fecha`,
  milestone_rescheduled: (n) => `${n} hito(s) reprogramado(s) sin cambio aprobado`,
  financial_deviation: (n) => `Desviación financiera de ${n}%`,
  effort_overrun: (n) => `Sobreesfuerzo de ${n}%`,
  risk_materialized: (n) => `${n} riesgo(s) materializado(s)`,
  risk_severity: (n) => `Severidad acumulada de riesgos abiertos: ${n}`,
  risk_mitigation_overdue: (n) => `${n} mitigación(es) vencida(s)`,
  risk_mitigation_due_soon: (n) => `${n} mitigación(es) vence(n) en 3 días o menos`,
  client_risk: (n) => `${n} riesgo(s) de cliente abierto(s)`,
  client_contact_missing: () => 'Falta el contacto del cliente',
  client_escalation_missing: () => 'Falta la ruta de escalación',
  no_reviews: () => 'Aún no hay revisiones',
  review_late: (n) => `Última revisión con ${n} día(s) de atraso`,
  review_overdue: (n) => `Revisión vencida hace ${n} día(s)`,
  task_overdue: (n) => `${n} acción(es) vencida(s)`,
  change_undecided: (n) => `${n} cambio(s) sin decisión en más de 14 días`,
  evidence_missing: (n) => `${n} hito(s) cumplido(s) sin evidencia`,
  no_baseline: () => 'El proyecto no tiene línea base',
  no_team_members: () => 'No hay integrantes en el equipo',
  no_technical_owner: () => 'No hay responsable técnico',
  team_risk: (n) => `${n} riesgo(s) de equipo abierto(s)`,
  team_changed: () => 'La última revisión reportó cambios en el equipo',
  effort_overrun_high: () => 'El sobreesfuerzo supera 10%',
};
const pct = (value: string | null, unit = '%') => (value === null ? 'Sin dato' : `${Number(value).toFixed(1)}${unit}`);

export function HealthView({ project }: { project: ProjectDetail }) {
  const [assessment, setAssessment] = useState<Assessment>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let current = true;
    api.assessment(project.id)
      .then((result) => { if (current) setAssessment(result); })
      .catch((failure) => { if (current) setError(errorMessage(failure)); });
    return () => { current = false; };
  }, [project.id, project.revision]);

  if (!assessment) return error ? <Notice tone="red">{error}</Notice> : <Loading />;
  const band = assessment.band ? BAND[assessment.band] : undefined;
  const active = assessment.gates.filter((g) => g.active);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Salud del proyecto</p>
          {assessment.score === null ? (
            <>
              <p className="mt-1 text-2xl font-semibold text-ink">Sin evaluación</p>
              <p className="mt-1 text-xs text-muted">Ninguna dimensión tiene datos todavía.</p>
            </>
          ) : (
            <>
              <p className={`mt-1 flex items-center gap-3 text-5xl font-semibold tracking-tight ${band?.text ?? 'text-ink'}`}>
                {Math.floor(Number(assessment.score))}
                {band && <Badge tone={band.tone}>{band.label}</Badge>}
              </p>
              <p className="mt-2 text-xs text-muted">
                Promedio ponderado {Number(assessment.weightedScore).toFixed(1)}
                {active.length > 0 && ` · limitado a ${Number(assessment.gateCap).toFixed(0)} por regla crítica`}
              </p>
            </>
          )}
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Confianza de la información</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{CONFIDENCE[assessment.confidence.level]}</p>
          <p className="mt-1 text-xs text-muted">{Number(assessment.confidence.value).toFixed(0)} de 100. Mide qué tan completos y recientes son los datos, no la salud.</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Avance y desviaciones</p>
          <p className="mt-1 text-sm text-ink">Avance real {pct(assessment.metrics.actualProgress)} de {pct(assessment.metrics.committedProgress)} comprometido</p>
          <p className="text-sm text-ink">Desviación de proyecto: {pct(assessment.metrics.projectDeviation, ' puntos')}</p>
          <p className="text-sm text-ink">
            Desviación financiera: {assessment.financialsHidden ? 'no visible para tu perfil' : pct(assessment.metrics.financialDeviation)}
          </p>
        </Card>
      </div>

      {!assessment.stored && (
        <Notice tone="amber">El proyecto no tiene línea base: esta evaluación es parcial y no se guarda en el historial.</Notice>
      )}

      <Card title="Reglas críticas">
        {active.length === 0 ? <p className="text-sm text-muted">Ninguna regla crítica activa.</p> : (
          <ul className="space-y-2">
            {active.map((gate) => (
              <li key={gate.key} className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">
                <span>{GATE[gate.key] ?? gate.key}</span><span className="font-medium">El score no puede pasar de {gate.cap}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Dimensiones">
        <ul className="divide-y divide-line">
          {assessment.dimensions.map((dimension) => {
            const value = dimension.score === null ? null : Number(dimension.score);
            const tone = value === null ? 'bg-line-strong' : value >= 80 ? 'bg-ok' : value >= 60 ? 'bg-warn' : 'bg-bad';
            return (
              <li key={dimension.key} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">{DIMENSION[dimension.key] ?? dimension.key} <span className="text-xs font-normal text-muted">peso {dimension.weight}</span></span>
                  <span className="text-sm font-semibold text-ink">{value === null ? 'Sin dato' : value.toFixed(0)}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-subtle" role="presentation">
                  <div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${value ?? 0}%` }} />
                </div>
                {value === null ? <p className="mt-2 text-sm text-muted">{NO_DATA[dimension.key]} No entra al promedio.</p>
                  : dimension.deductions.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">
                      {dimension.key === 'financial' && assessment.financialsHidden ? 'El detalle no es visible para tu perfil.' : 'Sin observaciones.'}
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                      {dimension.deductions.map((d) => (
                        <li key={d.code} className="flex justify-between gap-3">
                          <span>{(DEDUCTION[d.code] ?? (() => d.code))(d.count)}</span><span className="text-muted">−{Number(d.points).toFixed(1)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
              </li>
            );
          })}
        </ul>
      </Card>

      <p className="text-xs text-muted">
        Evaluación {assessment.publication === 'official' ? 'oficial' : 'provisional'} · reglas {assessment.ruleSetVersion} · fecha {assessment.effectiveOn} ·
        calculada el {new Date(assessment.calculatedAt).toLocaleString('es-MX')} con la versión {assessment.projectRevision} de los datos.
      </p>
    </div>
  );
}
