import { IdempotencyKeyReused, insertAudit, insertOutbox, runIdempotent, withTransaction } from '@phs/service-kit';
import type pg from 'pg';
import {
  ProjectError, assertActiveUser, bumpProjectRevision, lockProject, type Actor, type ProjectDetail, type ProjectsService,
} from './projects.service.js';

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'rescheduled' | 'cancelled';

export interface Milestone {
  id: string;
  title: string;
  deliverable: string;
  owner: { id: string; displayName: string };
  dueOn: string;
  committedDueOn: string | null;
  critical: boolean;
  status: MilestoneStatus;
  progressPct: number | null;
  completedOn: string | null;
  completionNote: string | null;
  overdue: boolean;
  revision: number;
  canUpdate: boolean;
}

export interface CreateMilestone { title: string; deliverable: string; ownerId: string; dueOn: string; critical: boolean }
export interface UpdateMilestone {
  expectedRevision: number; title?: string; deliverable?: string; ownerId?: string; critical?: boolean;
  progressPct?: number | null; dueOn?: string; reason?: string;
}
export interface TransitionMilestone {
  expectedRevision: number; to: 'pending' | 'in_progress' | 'completed' | 'cancelled'; note?: string; completedOn?: string;
}

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

// Reopening a completed or cancelled milestone is provisional until D08 defines the policy.
const TRANSITIONS: Record<MilestoneStatus, TransitionMilestone['to'][]> = {
  pending: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  rescheduled: ['in_progress', 'completed', 'cancelled'],
  completed: ['in_progress'],
  cancelled: ['pending'],
};
const NOTE_REQUIRED = (from: MilestoneStatus, to: string) => to === 'completed' || to === 'cancelled' || from === 'completed' || from === 'cancelled';

interface Row {
  id: string; title: string; deliverable: string; owner_id: string; owner_name: string; due_on: string;
  committed_due_on: string | null; critical: boolean; status: MilestoneStatus; progress_pct: string | null;
  completed_on: string | null; completion_note: string | null; overdue: boolean; revision: string; today: string;
}

// "Overdue" and "today" use the business date in the project's time zone, not UTC.
const SELECT = `
  SELECT m.id, m.title, m.deliverable, m.owner_id, u.display_name AS owner_name, m.due_on::text AS due_on,
         m.committed_due_on::text AS committed_due_on, m.critical, m.status, m.progress_pct,
         m.completed_on::text AS completed_on, m.completion_note, m.revision,
         (now() AT TIME ZONE p.timezone)::date::text AS today,
         (m.status NOT IN ('completed','cancelled') AND m.due_on < (now() AT TIME ZONE p.timezone)::date) AS overdue
    FROM phs.milestone m
    JOIN phs.app_user u ON u.id = m.owner_id
    JOIN phs.project p ON p.id = m.project_id
   WHERE m.project_id = $1`;

function toMilestone(row: Row, project: ProjectDetail, userId: string): Milestone {
  return {
    id: row.id, title: row.title, deliverable: row.deliverable, owner: { id: row.owner_id, displayName: row.owner_name },
    dueOn: row.due_on, committedDueOn: row.committed_due_on, critical: row.critical, status: row.status,
    progressPct: row.progress_pct === null ? null : Number(row.progress_pct), completedOn: row.completed_on,
    completionNote: row.completion_note, overdue: row.overdue, revision: Number(row.revision),
    canUpdate: project.capabilities.editOperation || row.owner_id === userId,
  };
}

const snapshot = (m: Milestone) => ({
  title: m.title, deliverable: m.deliverable, ownerId: m.owner.id, dueOn: m.dueOn, critical: m.critical,
  status: m.status, progressPct: m.progressPct, completedOn: m.completedOn,
});

export class MilestonesService {
  constructor(private readonly pool: pg.Pool, private readonly projects: ProjectsService) {}

  async list(userId: string, projectId: string): Promise<Milestone[]> {
    const project = await this.projects.get(userId, projectId);
    if (!project) throw new ProjectError('not_found');
    const found = await this.pool.query<Row>(`${SELECT} ORDER BY m.due_on, m.title`, [projectId]);
    return found.rows.map((row) => toMilestone(row, project, userId));
  }

  private async one(db: Queryable, projectId: string, milestoneId: string, lock: boolean): Promise<Row> {
    if (lock) await db.query('SELECT 1 FROM phs.milestone WHERE id = $2 AND project_id = $1 FOR UPDATE', [projectId, milestoneId]);
    const found = await db.query<Row>(`${SELECT} AND m.id = $2`, [projectId, milestoneId]);
    if (!found.rows[0]) throw new ProjectError('not_found');
    return found.rows[0];
  }

  // Timeline entry, audit entry, outbox event and both revisions, all in the caller's transaction.
  private async record(
    client: pg.PoolClient, actor: Actor, projectId: string, action: string, note: string,
    before: Milestone | null, after: Milestone,
  ): Promise<void> {
    const projectRevision = await bumpProjectRevision(client, projectId);
    await client.query(
      `INSERT INTO phs.activity(project_id, milestone_id, actor_id, source, note, before_data, after_data)
       VALUES($1, $2, $3, 'user', $4, $5, $6)`,
      [projectId, after.id, actor.userId, note, JSON.stringify(before ? snapshot(before) : {}), JSON.stringify(snapshot(after))]);
    await insertAudit(client, {
      requestId: actor.requestId, actorId: actor.userId, action, entityType: 'milestone', entityId: after.id, projectId,
      before: before ? snapshot(before) : undefined, after: snapshot(after),
    });
    await insertOutbox(client, {
      projectId, eventType: action, deduplicationKey: `${action}:${after.id}:${after.revision}`,
      payload: { projectId, milestoneId: after.id, milestoneRevision: after.revision, projectRevision },
    });
  }

  async create(actor: Actor, projectId: string, input: CreateMilestone, idempotencyKey: string): Promise<Milestone> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await runIdempotent(
          client,
          { service: 'projects', userId: actor.userId, key: idempotencyKey, command: 'milestone.create', payload: { projectId, ...input } },
          async () => {
            const project = await lockProject(client, this.projects, actor, projectId, 'editOperation');
            await assertActiveUser(client, input.ownerId);
            const inserted = await client.query<{ id: string }>(
              `INSERT INTO phs.milestone(project_id, title, deliverable, owner_id, due_on, critical)
               VALUES($1, $2, $3, $4, $5, $6) RETURNING id`,
              [projectId, input.title, input.deliverable, input.ownerId, input.dueOn, input.critical]);
            const created = toMilestone(await this.one(client, projectId, inserted.rows[0]!.id, false), project, actor.userId);
            await this.record(client, actor, projectId, 'milestone.created', 'Hito registrado', null, created);
            return { status: 201, body: created };
          },
        );
        return result.body;
      });
    } catch (error) {
      if (error instanceof IdempotencyKeyReused) throw new ProjectError('idempotency_key_reused');
      throw error;
    }
  }

  async update(actor: Actor, projectId: string, milestoneId: string, input: UpdateMilestone): Promise<Milestone> {
    return withTransaction(this.pool, async (client) => {
      const project = await lockProject(client, this.projects, actor, projectId, 'editOperation');
      const row = await this.one(client, projectId, milestoneId, true);
      const before = toMilestone(row, project, actor.userId);
      if (before.revision !== input.expectedRevision) throw new ProjectError('revision_conflict', before.revision);
      if (before.status === 'completed' || before.status === 'cancelled') throw new ProjectError('invalid_transition');

      const next = {
        title: input.title ?? before.title, deliverable: input.deliverable ?? before.deliverable,
        ownerId: input.ownerId ?? before.owner.id, critical: input.critical ?? before.critical,
        progressPct: input.progressPct === undefined ? before.progressPct : input.progressPct,
        dueOn: input.dueOn ?? before.dueOn, status: before.status as MilestoneStatus,
      };
      const moved = next.dueOn !== before.dueOn;
      const unchanged = !moved && next.title === before.title && next.deliverable === before.deliverable
        && next.ownerId === before.owner.id && next.critical === before.critical && next.progressPct === before.progressPct;
      if (unchanged) return before;
      if (next.ownerId !== before.owner.id) await assertActiveUser(client, next.ownerId);
      // Moving a date committed in the baseline is an operational reschedule: the committed date stays,
      // the reason is recorded, and it is not an approved change.
      const reschedule = moved && before.committedDueOn !== null;
      if (reschedule && !input.reason) throw new ProjectError('reason_required');
      if (reschedule) next.status = 'rescheduled';

      await client.query(
        `UPDATE phs.milestone SET title = $3, deliverable = $4, owner_id = $5, critical = $6, progress_pct = $7,
                due_on = $8, status = $9, revision = revision + 1
          WHERE project_id = $1 AND id = $2`,
        [projectId, milestoneId, next.title, next.deliverable, next.ownerId, next.critical, next.progressPct, next.dueOn, next.status]);
      const after = toMilestone(await this.one(client, projectId, milestoneId, false), project, actor.userId);
      await this.record(client, actor, projectId, reschedule ? 'milestone.rescheduled' : 'milestone.updated',
        reschedule ? `Reprogramado: ${input.reason}` : 'Hito actualizado', before, after);
      return after;
    });
  }

  async transition(actor: Actor, projectId: string, milestoneId: string, input: TransitionMilestone): Promise<Milestone> {
    return withTransaction(this.pool, async (client) => {
      const project = await lockProject(client, this.projects, actor, projectId, 'view');
      const row = await this.one(client, projectId, milestoneId, true);
      const before = toMilestone(row, project, actor.userId);
      if (!before.canUpdate) throw new ProjectError('forbidden');
      if (before.revision !== input.expectedRevision) throw new ProjectError('revision_conflict', before.revision);
      if (!TRANSITIONS[before.status].includes(input.to)) throw new ProjectError('invalid_transition');
      if (NOTE_REQUIRED(before.status, input.to) && !input.note) throw new ProjectError('note_required');
      const completedOn = input.to === 'completed' ? input.completedOn ?? row.today : null;
      if (completedOn && completedOn > row.today) throw new ProjectError('invalid_completion_date');

      await client.query(
        `UPDATE phs.milestone SET status = $3, completed_on = $4, completion_note = $5, revision = revision + 1
          WHERE project_id = $1 AND id = $2`,
        [projectId, milestoneId, input.to, completedOn, input.to === 'completed' ? input.note : null]);
      const after = toMilestone(await this.one(client, projectId, milestoneId, false), project, actor.userId);
      const labels = { pending: 'Reabierto', in_progress: before.status === 'completed' ? 'Reabierto' : 'En curso', completed: 'Cumplido', cancelled: 'Cancelado' };
      await this.record(client, actor, projectId, `milestone.${input.to}`,
        input.note ? `${labels[input.to]}: ${input.note}` : labels[input.to], before, after);
      return after;
    });
  }
}
