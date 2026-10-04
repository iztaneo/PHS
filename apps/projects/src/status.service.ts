import { IdempotencyKeyReused, insertAudit, insertOutbox, runIdempotent, withTransaction } from '@phs/service-kit';
import type pg from 'pg';
import {
  JUSTIFICATION_DAYS, ProjectError, assertActiveUser, bumpProjectRevision, lockProject, type Actor, type ProjectDetail,
  type ProjectsService,
} from './projects.service.js';

export type Status = 'planned' | 'active' | 'paused' | 'renewing' | 'closed';

export interface StatusView {
  status: Status;
  since: string | null;
  daysInStatus: number | null;
  allowed: Status[];
  justificationRequired: boolean;
  justificationAfterDays: number;
  open: { milestones: number; risks: number; renewals: number; tasks: number };
  history: { kind: 'transition' | 'justification'; fromStatus: Status | null; toStatus: Status; reason: string; recordedBy: { id: string; displayName: string }; recordedAt: string }[];
}

export interface Renewal {
  id: string; dueOn: string; owner: { id: string; displayName: string }; status: 'pending' | 'renewed' | 'cancelled';
  notes: string; outcomeNote: string | null; closedAt: string | null; daysToDue: number; overdue: boolean; revision: number; canUpdate: boolean;
}

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

// ESPECIFICACION section 6. Closing and reopening are decisions of the practice lead.
const TRANSITIONS: Record<Status, Status[]> = {
  planned: ['active'],
  active: ['paused', 'renewing', 'closed'],
  paused: ['active'],
  renewing: ['active', 'closed'],
  closed: ['active'],
};
const NEEDS_LEAD = (from: Status, to: Status) => to === 'closed' || from === 'closed';

export class StatusService {
  constructor(private readonly pool: pg.Pool, private readonly projects: ProjectsService) {}

  private async view(db: Queryable, project: ProjectDetail): Promise<StatusView> {
    const history = await db.query<{ kind: 'transition' | 'justification'; from_status: Status | null; to_status: Status; reason: string; recorded_by: string; name: string; recorded_at: Date }>(
      `SELECT l.kind, l.from_status, l.to_status, l.reason, l.recorded_by, u.display_name AS name, l.recorded_at
         FROM phs.project_status_log l JOIN phs.app_user u ON u.id = l.recorded_by
        WHERE l.project_id = $1 ORDER BY l.recorded_at DESC`, [project.id]);
    const open = await db.query<{ milestones: number; risks: number; renewals: number; tasks: number }>(
      `SELECT (SELECT count(*)::int FROM phs.milestone WHERE project_id = $1 AND status NOT IN ('completed','cancelled')) AS milestones,
              (SELECT count(*)::int FROM phs.risk WHERE project_id = $1 AND status NOT IN ('mitigated','closed')) AS risks,
              (SELECT count(*)::int FROM phs.renewal WHERE project_id = $1 AND status = 'pending') AS renewals,
              (SELECT count(*)::int FROM phs.health_task WHERE project_id = $1 AND status NOT IN ('completed','cancelled')) AS tasks`, [project.id]);
    const status = project.status as Status;
    const last = history.rows.find((h) => h.kind === 'transition');
    return {
      status, since: last?.recorded_at.toISOString() ?? null,
      daysInStatus: last ? Math.floor((Date.now() - last.recorded_at.getTime()) / 86_400_000) : null,
      allowed: project.capabilities.editOperation
        ? TRANSITIONS[status].filter((to) => !NEEDS_LEAD(status, to) || project.capabilities.decide) : [],
      justificationRequired: project.justificationRequired, justificationAfterDays: JUSTIFICATION_DAYS, open: open.rows[0]!,
      history: history.rows.map((h) => ({
        kind: h.kind, fromStatus: h.from_status, toStatus: h.to_status, reason: h.reason,
        recordedBy: { id: h.recorded_by, displayName: h.name }, recordedAt: h.recorded_at.toISOString(),
      })),
    };
  }

  async get(userId: string, projectId: string): Promise<StatusView> {
    const project = await this.projects.get(userId, projectId);
    if (!project) throw new ProjectError('not_found');
    return this.view(this.pool, project);
  }

  // `at` exists only so the demo seed and the tests can place a transition in the past; the API never sets it.
  async change(actor: Actor, projectId: string, input: { expectedRevision: number; to: Status; reason: string }, at?: Date): Promise<ProjectDetail> {
    return withTransaction(this.pool, async (client) => {
      const project = await lockProject(client, this.projects, actor, projectId, 'editOperation');
      const from = project.status as Status;
      if (project.revision !== input.expectedRevision) throw new ProjectError('revision_conflict', project.revision);
      if (!TRANSITIONS[from].includes(input.to)) throw new ProjectError('invalid_transition');
      if (NEEDS_LEAD(from, input.to) && !project.capabilities.decide) throw new ProjectError('forbidden');
      await client.query('UPDATE phs.project SET status = $2, revision = revision + 1 WHERE id = $1', [projectId, input.to]);
      await client.query(
        `INSERT INTO phs.project_status_log(project_id, kind, from_status, to_status, reason, recorded_by, recorded_at)
         VALUES($1, 'transition', $2, $3, $4, $5, coalesce($6, now()))`, [projectId, from, input.to, input.reason, actor.userId, at ?? null]);
      await insertAudit(client, {
        requestId: actor.requestId, actorId: actor.userId, action: 'project.status_changed', entityType: 'project', entityId: projectId,
        projectId, before: { status: from }, after: { status: input.to, reason: input.reason },
      });
      await insertOutbox(client, {
        projectId, eventType: 'project.status_changed', deduplicationKey: `project.status_changed:${projectId}:${project.revision + 1}`,
        payload: { projectId, from, to: input.to, projectRevision: project.revision + 1 },
      });
      return (await this.projects.get(actor.userId, projectId, client))!;
    });
  }

  async justify(actor: Actor, projectId: string, reason: string): Promise<StatusView> {
    return withTransaction(this.pool, async (client) => {
      const project = await lockProject(client, this.projects, actor, projectId, 'editOperation', true);
      if (!project.justificationRequired) throw new ProjectError('justification_not_required');
      await client.query(
        `INSERT INTO phs.project_status_log(project_id, kind, to_status, reason, recorded_by) VALUES($1, 'justification', $2, $3, $4)`,
        [projectId, project.status, reason, actor.userId]);
      await insertAudit(client, {
        requestId: actor.requestId, actorId: actor.userId, action: 'project.status_justified', entityType: 'project', entityId: projectId,
        projectId, after: { status: project.status, reason },
      });
      return this.view(client, (await this.projects.get(actor.userId, projectId, client))!);
    });
  }

  // ---- Renewals

  private async renewals(db: Queryable, project: ProjectDetail, userId: string, renewalId?: string): Promise<Renewal[]> {
    const found = await db.query<{ id: string; due_on: string; owner_id: string; owner: string; status: Renewal['status']; notes: string; outcome_note: string | null; closed_at: Date | null; days: number; revision: string }>(
      `SELECT r.id, r.due_on::text AS due_on, r.owner_id, u.display_name AS owner, r.status, r.notes, r.outcome_note, r.closed_at,
              r.due_on - (now() AT TIME ZONE p.timezone)::date AS days, r.revision
         FROM phs.renewal r JOIN phs.app_user u ON u.id = r.owner_id JOIN phs.project p ON p.id = r.project_id
        WHERE r.project_id = $1 AND ($2::uuid IS NULL OR r.id = $2)
        ORDER BY (r.status <> 'pending'), r.due_on`, [project.id, renewalId ?? null]);
    return found.rows.map((r) => ({
      id: r.id, dueOn: r.due_on, owner: { id: r.owner_id, displayName: r.owner }, status: r.status, notes: r.notes,
      outcomeNote: r.outcome_note, closedAt: r.closed_at?.toISOString() ?? null, daysToDue: r.days,
      overdue: r.status === 'pending' && r.days < 0, revision: Number(r.revision),
      canUpdate: r.status === 'pending' && (project.capabilities.editOperation || r.owner_id === userId),
    }));
  }

  async listRenewals(userId: string, projectId: string): Promise<Renewal[]> {
    const project = await this.projects.get(userId, projectId);
    if (!project) throw new ProjectError('not_found');
    return this.renewals(this.pool, project, userId);
  }

  async createRenewal(actor: Actor, projectId: string, input: { dueOn: string; ownerId: string; notes: string }, idempotencyKey: string): Promise<Renewal> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await runIdempotent(
          client,
          { service: 'projects', userId: actor.userId, key: idempotencyKey, command: 'renewal.create', payload: { projectId, ...input } },
          async () => {
            const project = await lockProject(client, this.projects, actor, projectId, 'editOperation');
            await assertActiveUser(client, input.ownerId);
            const inserted = await client.query<{ id: string }>(
              'INSERT INTO phs.renewal(project_id, due_on, owner_id, notes) VALUES($1, $2, $3, $4) RETURNING id',
              [projectId, input.dueOn, input.ownerId, input.notes]);
            const id = inserted.rows[0]!.id;
            await bumpProjectRevision(client, projectId);
            await insertAudit(client, {
              requestId: actor.requestId, actorId: actor.userId, action: 'renewal.created', entityType: 'renewal', entityId: id,
              projectId, after: { ...input },
            });
            return { status: 201, body: (await this.renewals(client, project, actor.userId, id))[0]! };
          },
        );
        return result.body;
      });
    } catch (error) {
      if (error instanceof IdempotencyKeyReused) throw new ProjectError('idempotency_key_reused');
      throw error;
    }
  }

  async decideRenewal(
    actor: Actor, projectId: string, renewalId: string, input: { expectedRevision: number; outcome: 'renewed' | 'cancelled'; comment: string },
  ): Promise<Renewal> {
    return withTransaction(this.pool, async (client) => {
      const project = await lockProject(client, this.projects, actor, projectId, 'view');
      const before = (await this.renewals(client, project, actor.userId, renewalId))[0];
      if (!before) throw new ProjectError('not_found');
      if (before.revision !== input.expectedRevision) throw new ProjectError('revision_conflict', before.revision);
      if (before.status !== 'pending') throw new ProjectError('invalid_transition');
      if (!before.canUpdate) throw new ProjectError('forbidden');
      await client.query(
        `UPDATE phs.renewal SET status = $3, outcome_note = $4, closed_at = now(), revision = revision + 1 WHERE project_id = $1 AND id = $2`,
        [projectId, renewalId, input.outcome, input.comment]);
      await bumpProjectRevision(client, projectId);
      await insertAudit(client, {
        requestId: actor.requestId, actorId: actor.userId, action: `renewal.${input.outcome}`, entityType: 'renewal', entityId: renewalId,
        projectId, before: { status: 'pending' }, after: { status: input.outcome, comment: input.comment },
      });
      return (await this.renewals(client, project, actor.userId, renewalId))[0]!;
    });
  }
}
