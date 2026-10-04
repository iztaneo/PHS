import { IdempotencyKeyReused, insertAudit, insertOutbox, runIdempotent, withTransaction } from '@phs/service-kit';
import type pg from 'pg';
import { ProjectError, lockProject, type Actor, type ProjectDetail, type ProjectsService } from './projects.service.js';

export interface Baseline {
  id: string;
  version: number;
  current: boolean;
  startsOn: string;
  endsOn: string;
  scope: string;
  budget: string | null;
  effortHours: string | null;
  financialsHidden: boolean;
  currency: string;
  milestones: unknown[];
  team: unknown[];
  reason: string;
  createdBy: { id: string; displayName: string };
  createdAt: string;
}

export interface PublishBaseline {
  expectedRevision: number;
  scope: string;
  budget: string | null;
  effortHours: string | null;
  reason: string;
}

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

interface Row {
  id: string; version: number; current: boolean; starts_on: string; ends_on: string; scope: string;
  budget: string | null; effort_hours: string | null; currency: string; milestone_snapshot: unknown[];
  team_snapshot: unknown[]; reason: string; created_by: string; created_by_name: string; created_at: Date;
}

export class BaselinesService {
  constructor(private readonly pool: pg.Pool, private readonly projects: ProjectsService) {}

  private async rows(db: Queryable, project: ProjectDetail): Promise<Baseline[]> {
    const found = await db.query<Row>(
      `SELECT b.id, b.version, b.id = p.current_baseline_id AS current, b.starts_on::text AS starts_on,
              b.ends_on::text AS ends_on, b.scope, b.budget, b.effort_hours, b.currency, b.milestone_snapshot,
              b.team_snapshot, b.reason, b.created_by, u.display_name AS created_by_name, b.created_at
         FROM phs.baseline b
         JOIN phs.project p ON p.id = b.project_id
         JOIN phs.app_user u ON u.id = b.created_by
        WHERE b.project_id = $1 ORDER BY b.version DESC`, [project.id]);
    // Amounts are visible only to those who govern the project (D05).
    const show = project.capabilities.seeFinancials;
    return found.rows.map((r) => ({
      id: r.id, version: r.version, current: r.current, startsOn: r.starts_on, endsOn: r.ends_on, scope: r.scope,
      budget: show ? r.budget : null, effortHours: show ? r.effort_hours : null, financialsHidden: !show,
      currency: r.currency, milestones: r.milestone_snapshot, team: r.team_snapshot, reason: r.reason,
      createdBy: { id: r.created_by, displayName: r.created_by_name }, createdAt: r.created_at.toISOString(),
    }));
  }

  async list(userId: string, projectId: string): Promise<Baseline[]> {
    const project = await this.projects.get(userId, projectId);
    if (!project) throw new ProjectError('not_found');
    return this.rows(this.pool, project);
  }

  // Version 1 freezes the project's dates, its open milestones and its team as they are now.
  async publishInitial(actor: Actor, projectId: string, input: PublishBaseline, idempotencyKey: string): Promise<Baseline> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await runIdempotent(
          client,
          { service: 'projects', userId: actor.userId, key: idempotencyKey, command: 'baseline.publish_initial', payload: { projectId, ...input } },
          async () => ({ status: 201, body: await this.publishInTransaction(client, actor, projectId, input) }),
        );
        return result.body;
      });
    } catch (error) {
      if (error instanceof IdempotencyKeyReused) throw new ProjectError('idempotency_key_reused');
      throw error;
    }
  }

  private async publishInTransaction(client: pg.PoolClient, actor: Actor, projectId: string, input: PublishBaseline): Promise<Baseline> {
    const project = await lockProject(client, this.projects, actor, projectId, 'editOperation');
    const existing = await client.query('SELECT 1 FROM phs.baseline WHERE project_id = $1 LIMIT 1', [projectId]);
    if (existing.rowCount) throw new ProjectError('baseline_exists');
    if (project.revision !== input.expectedRevision) throw new ProjectError('revision_conflict', project.revision);

    const milestones = await client.query(
      `SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', m.id, 'title', m.title, 'deliverable', m.deliverable, 'due_on', m.due_on::text,
                'owner_id', m.owner_id, 'owner_name', u.display_name, 'critical', m.critical, 'weight', 1)
                ORDER BY m.due_on, m.title), '[]'::jsonb) AS snapshot,
              coalesce(array_agg(m.id), '{}') AS ids
         FROM phs.milestone m JOIN phs.app_user u ON u.id = m.owner_id
        WHERE m.project_id = $1 AND m.status <> 'cancelled'`, [projectId]);
    const team = await client.query(
      `SELECT coalesce(jsonb_agg(jsonb_build_object(
                'user_id', t.user_id, 'display_name', u.display_name, 'role', t.role, 'allocation_pct', t.allocation_pct)
                ORDER BY t.position, u.display_name), '[]'::jsonb) AS snapshot
         FROM (
           SELECT pm_id AS user_id, 'pm' AS role, NULL::numeric AS allocation_pct, 1 AS position FROM phs.project WHERE id = $1
           UNION ALL SELECT lead_id, 'lead', NULL, 2 FROM phs.project WHERE id = $1
           UNION ALL SELECT technical_owner_id, 'technical_owner', NULL, 3 FROM phs.project WHERE id = $1
           UNION ALL SELECT sponsor_id, 'sponsor', NULL, 4 FROM phs.project WHERE id = $1 AND sponsor_id IS NOT NULL
           UNION ALL SELECT user_id, role, allocation_pct, 5 FROM phs.project_member WHERE project_id = $1
         ) t JOIN phs.app_user u ON u.id = t.user_id`, [projectId]);

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO phs.baseline(project_id, version, starts_on, ends_on, scope, budget, effort_hours, currency,
                                milestone_snapshot, team_snapshot, reason, created_by)
       VALUES($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [projectId, project.startsOn, project.endsOn, input.scope, input.budget, input.effortHours, project.currency,
        JSON.stringify(milestones.rows[0].snapshot), JSON.stringify(team.rows[0].snapshot), input.reason, actor.userId]);
    const id = inserted.rows[0]!.id;
    const revision = project.revision + 1;
    await client.query('UPDATE phs.project SET current_baseline_id = $2, revision = $3 WHERE id = $1', [projectId, id, revision]);
    // From now on these dates are commitments: moving them is a reschedule or an approved change.
    await client.query('UPDATE phs.milestone SET committed_due_on = due_on WHERE project_id = $1 AND id = ANY($2::uuid[])',
      [projectId, milestones.rows[0].ids]);
    await insertAudit(client, {
      requestId: actor.requestId, actorId: actor.userId, action: 'baseline.published', entityType: 'baseline', entityId: id,
      projectId, after: { version: 1, milestones: milestones.rows[0].ids.length, budgetKnown: input.budget !== null },
    });
    await insertOutbox(client, {
      projectId, eventType: 'baseline.published', deduplicationKey: `baseline.published:${id}`,
      payload: { projectId, baselineId: id, version: 1, projectRevision: revision },
    });
    const published = (await this.rows(client, { ...project, hasBaseline: true })).find((b) => b.id === id);
    return published!;
  }
}
