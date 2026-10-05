import {
  assess, countsInPortfolio, exposure, portfolio, trend, type Cut, type PortfolioIndicators, type PortfolioProject,
} from '@phs/health-engine';
import type pg from 'pg';
import type { AssessmentsService } from './assessments.service.js';
import type { ProjectsClient } from './projects.client.js';

export interface PortfolioRow extends PortfolioProject {
  id: string; code: string; name: string; practiceName: string; clientId: string; clientName: string; serviceTypeCode: string; serviceTypeName: string;
  pmName: string; leadId: string; leadName: string;
  // Whether the project counts in the indicators (active or renewing).
  counted: boolean;
  // false: the calculation failed; different from "sin evaluación".
  assessed: boolean;
  trend: 'up' | 'down' | 'flat' | null;
  lastReviewOn: string | null;
  exposure: string | null;
}
export interface PortfolioFilters { clientId?: string; serviceTypeCode?: string; leadId?: string; status?: string; band?: 'healthy' | 'attention' | 'risk' | 'none' }
export interface PortfolioView {
  today: string;
  // What can be filtered by, taken from everything the user may see, not from the filtered rows.
  options: { clients: { id: string; name: string }[]; serviceTypes: { code: string; name: string }[]; leads: { id: string; name: string }[] };
  indicators: PortfolioIndicators;
  projects: PortfolioRow[];
  incomplete: boolean;
}

// Portfolio for those who govern (PHS-037), with the rules of decision D10. Indicators and table
// are always computed over the same rows: the projects of the user's scope that pass the filters.
export class PortfolioService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly projects: ProjectsClient,
    private readonly assessments: AssessmentsService,
  ) {}

  async view(signedIdentity: string, filters: PortfolioFilters): Promise<PortfolioView> {
    const listed = await this.projects.list(signedIdentity);
    const today = (await this.pool.query<{ today: string }>("SELECT (now() AT TIME ZONE 'America/Mexico_City')::date::text AS today")).rows[0]!.today;
    const ids = listed.projects.map((p) => p.id);
    const extra = new Map((await this.pool.query<{ id: string; lead_id: string; lead_name: string; currency: string; last_review_on: string | null }>(
      `SELECT p.id, p.lead_id, u.display_name AS lead_name, p.currency,
              (SELECT max(r.effective_on)::text FROM phs.health_review r WHERE r.project_id = p.id) AS last_review_on
         FROM phs.project p JOIN phs.app_user u ON u.id = p.lead_id WHERE p.id = ANY($1::uuid[])`, [ids])).rows.map((r) => [r.id, r]));
    const cuts = await this.pool.query<Cut & { project_id: string }>(
      `SELECT project_id, "cycleDueOn", "effectiveOn", score, "ruleSetVersion" FROM (
         SELECT c.project_id, c.due_on::text AS "cycleDueOn", a.effective_on::text AS "effectiveOn", a.score, rs.version AS "ruleSetVersion",
                row_number() OVER (PARTITION BY c.project_id ORDER BY c.due_on DESC, c.starts_on DESC) AS n
           FROM phs.review_cycle c
           JOIN LATERAL (SELECT r.id FROM phs.health_review r WHERE r.cycle_id = c.id ORDER BY r.revision_no DESC LIMIT 1) l ON true
           JOIN phs.health_assessment a ON a.review_id = l.id AND a.assessment_kind = 'cycle'
           JOIN phs.rule_set rs ON rs.id = a.rule_set_id
          WHERE c.project_id = ANY($1::uuid[])) x WHERE n <= 2 ORDER BY project_id, n`, [ids]);

    let incomplete = listed.truncated;
    const rows: PortfolioRow[] = [];
    for (const p of listed.projects) {
      const more = extra.get(p.id);
      if (!more) continue;
      const visible = p.capabilities.seeFinancials;
      let result: ReturnType<typeof assess> | null = null;
      let budget: string | null = null;
      let freshness: PortfolioRow['freshness'] = 'never';
      try {
        const loaded = await this.assessments.inputs(this.pool, p.id);
        if (loaded) {
          result = assess(loaded.input);
          budget = loaded.input.budget;
          const g = loaded.input.governance;
          freshness = g.daysSinceLastReview === null ? 'never' : g.daysSinceLastReview <= (g.cadenceDays ?? 7) ? 'fresh' : 'stale';
        }
      } catch {
        incomplete = true;
      }
      const money = { budget: visible ? budget : null, financialDeviation: visible ? result?.metrics.financialDeviation ?? null : null };
      const status = p.status as PortfolioRow['status'];
      rows.push({
        id: p.id, code: p.code, name: p.name, status, counted: countsInPortfolio(status), practiceName: p.practiceName, clientId: p.clientId,
        clientName: p.clientName, serviceTypeCode: p.serviceTypeCode, serviceTypeName: p.serviceTypeName, pmName: p.pmName, leadId: more.lead_id,
        leadName: more.lead_name, assessed: result !== null, score: result?.score ?? null, band: result?.band ?? null,
        confidenceLevel: result?.confidence.level ?? null, freshness, trend: trend(cuts.rows.filter((c) => c.project_id === p.id)).direction,
        lastReviewOn: more.last_review_on, currency: more.currency, ...money, financialsVisible: visible, exposure: visible ? exposure(money) : null,
      });
    }
    const unique = <T, K>(items: T[], key: (item: T) => K) => [...new Map(items.map((i) => [key(i), i])).values()];
    const shown = rows.filter((r) => (!filters.clientId || r.clientId === filters.clientId)
      && (!filters.serviceTypeCode || r.serviceTypeCode === filters.serviceTypeCode)
      && (!filters.leadId || r.leadId === filters.leadId)
      && (!filters.status || r.status === filters.status)
      && (!filters.band || (filters.band === 'none' ? r.band === null : r.band === filters.band)));
    // Lowest score first; without assessment at the end; what does not count after what does.
    shown.sort((a, b) => Number(b.counted) - Number(a.counted) || Number(a.score ?? 101) - Number(b.score ?? 101) || a.name.localeCompare(b.name));
    return {
      today, incomplete, indicators: portfolio(shown), projects: shown,
      options: {
        clients: unique(rows, (r) => r.clientId).map((r) => ({ id: r.clientId, name: r.clientName })).sort((a, b) => a.name.localeCompare(b.name)),
        serviceTypes: unique(rows, (r) => r.serviceTypeCode).map((r) => ({ code: r.serviceTypeCode, name: r.serviceTypeName })).sort((a, b) => a.name.localeCompare(b.name)),
        leads: unique(rows, (r) => r.leadId).map((r) => ({ id: r.leadId, name: r.leadName })).sort((a, b) => a.name.localeCompare(b.name)),
      },
    };
  }
}
