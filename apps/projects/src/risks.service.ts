import { IdempotencyKeyReused, insertAudit, insertOutbox, runIdempotent, withTransaction } from '@phs/service-kit';
import type pg from 'pg';
import {
  ProjectError, assertActiveUser, bumpProjectRevision, lockProject, type Actor, type ProjectDetail, type ProjectsService,
} from './projects.service.js';

export type RiskStatus = 'open' | 'mitigating' | 'mitigated' | 'materialized' | 'closed';

export interface Risk {
  id: string;
  title: string;
  description: string;
  riskType: 'project' | 'client';
  category: string;
  probability: number;
  impact: number;
  severity: number;
  owner: { id: string; displayName: string };
  mitigationDueOn: string;
  strategy: string;
  status: RiskStatus;
  overdue: boolean;
  revision: number;
  canUpdate: boolean;
}

export interface CreateRisk {
  title: string; description: string; riskType: 'project' | 'client'; category: string; probability: number;
  impact: number; ownerId: string; mitigationDueOn: string; strategy: string;
}
export interface FollowUp {
  expectedRevision: number; comment: string; probability?: number; impact?: number; mitigationDueOn?: string;
  strategy?: string; ownerId?: string; status?: RiskStatus;
}
export interface HistoryEntry {
  occurredAt: string; actor: { id: string; displayName: string } | null; note: string;
  before: Record<string, unknown>; after: Record<string, unknown>;
}

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

// A materialized risk is not a resolved one: it can only be closed. Reopening goes back to open.
const TRANSITIONS: Record<RiskStatus, RiskStatus[]> = {
  open: ['mitigating', 'materialized', 'closed'],
  mitigating: ['mitigated', 'materialized', 'closed'],
  mitigated: ['closed', 'open'],
  materialized: ['closed'],
  closed: ['open'],
};

interface Row {
  id: string; title: string; description: string; risk_type: Risk['riskType']; category: string; probability: number;
  impact: number; owner_id: string; owner_name: string; mitigation_due_on: string; strategy: string; status: RiskStatus;
  overdue: boolean; revision: string;
}

const SELECT = `
  SELECT r.id, r.title, r.description, r.risk_type, r.category, r.probability, r.impact, r.owner_id,
         u.display_name AS owner_name, r.mitigation_due_on::text AS mitigation_due_on, r.strategy, r.status, r.revision,
         (r.status IN ('open','mitigating') AND r.mitigation_due_on < (now() AT TIME ZONE p.timezone)::date) AS overdue
    FROM phs.risk r
    JOIN phs.app_user u ON u.id = r.owner_id
    JOIN phs.project p ON p.id = r.project_id
   WHERE r.project_id = $1`;

function toRisk(row: Row, project: ProjectDetail, userId: string): Risk {
  return {
    id: row.id, title: row.title, description: row.description, riskType: row.risk_type, category: row.category,
    probability: row.probability, impact: row.impact, severity: row.probability * row.impact,
    owner: { id: row.owner_id, displayName: row.owner_name }, mitigationDueOn: row.mitigation_due_on,
    strategy: row.strategy, status: row.status, overdue: row.overdue, revision: Number(row.revision),
    canUpdate: project.capabilities.editOperation || row.owner_id === userId,
  };
}

const snapshot = (r: Risk) => ({
  probability: r.probability, impact: r.impact, mitigationDueOn: r.mitigationDueOn, strategy: r.strategy,
  status: r.status, ownerId: r.owner.id,
});

export class RisksService {
  constructor(private readonly pool: pg.Pool, private readonly projects: ProjectsService) {}

  async list(userId: string, projectId: string): Promise<Risk[]> {
    const project = await this.projects.get(userId, projectId);
    if (!project) throw new ProjectError('not_found');
    const found = await this.pool.query<Row>(
      `${SELECT} ORDER BY (r.status IN ('mitigated','closed')), r.probability * r.impact DESC, r.mitigation_due_on, r.title`, [projectId]);
    return found.rows.map((row) => toRisk(row, project, userId));
  }

  private async one(db: Queryable, projectId: string, riskId: string, lock: boolean): Promise<Row> {
    if (lock) await db.query('SELECT 1 FROM phs.risk WHERE id = $2 AND project_id = $1 FOR UPDATE', [projectId, riskId]);
    const found = await db.query<Row>(`${SELECT} AND r.id = $2`, [projectId, riskId]);
    if (!found.rows[0]) throw new ProjectError('not_found');
    return found.rows[0];
  }

  private async record(client: pg.PoolClient, actor: Actor, projectId: string, action: string, note: string, before: Risk | null, after: Risk): Promise<void> {
    const projectRevision = await bumpProjectRevision(client, projectId);
    await client.query(
      `INSERT INTO phs.activity(project_id, risk_id, actor_id, source, note, before_data, after_data)
       VALUES($1, $2, $3, 'user', $4, $5, $6)`,
      [projectId, after.id, actor.userId, note, JSON.stringify(before ? snapshot(before) : {}), JSON.stringify(snapshot(after))]);
    await insertAudit(client, {
      requestId: actor.requestId, actorId: actor.userId, action, entityType: 'risk', entityId: after.id, projectId,
      before: before ? snapshot(before) : undefined, after: snapshot(after),
    });
    await insertOutbox(client, {
      projectId, eventType: action, deduplicationKey: `${action}:${after.id}:${after.revision}`,
      payload: { projectId, riskId: after.id, riskRevision: after.revision, projectRevision },
    });
  }

  async create(actor: Actor, projectId: string, input: CreateRisk, idempotencyKey: string): Promise<Risk> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await runIdempotent(
          client,
          { service: 'projects', userId: actor.userId, key: idempotencyKey, command: 'risk.create', payload: { projectId, ...input } },
          async () => {
            const project = await lockProject(client, this.projects, actor, projectId, 'editOperation');
            await assertActiveUser(client, input.ownerId);
            const inserted = await client.query<{ id: string }>(
              `INSERT INTO phs.risk(project_id, title, description, risk_type, category, probability, impact, owner_id, mitigation_due_on, strategy)
               VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
              [projectId, input.title, input.description, input.riskType, input.category, input.probability, input.impact,
                input.ownerId, input.mitigationDueOn, input.strategy]);
            const created = toRisk(await this.one(client, projectId, inserted.rows[0]!.id, false), project, actor.userId);
            await this.record(client, actor, projectId, 'risk.created', 'Riesgo registrado', null, created);
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

  // One follow-up records the comment together with whatever changed.
  async followUp(actor: Actor, projectId: string, riskId: string, input: FollowUp): Promise<Risk> {
    return withTransaction(this.pool, async (client) => {
      const project = await lockProject(client, this.projects, actor, projectId, 'view');
      const before = toRisk(await this.one(client, projectId, riskId, true), project, actor.userId);
      if (!before.canUpdate) throw new ProjectError('forbidden');
      if (before.revision !== input.expectedRevision) throw new ProjectError('revision_conflict', before.revision);
      const next = {
        probability: input.probability ?? before.probability, impact: input.impact ?? before.impact,
        mitigationDueOn: input.mitigationDueOn ?? before.mitigationDueOn, strategy: input.strategy ?? before.strategy,
        ownerId: input.ownerId ?? before.owner.id, status: input.status ?? before.status,
      };
      if (next.status !== before.status && !TRANSITIONS[before.status].includes(next.status)) throw new ProjectError('invalid_transition');
      if (next.ownerId !== before.owner.id) {
        if (!project.capabilities.editOperation) throw new ProjectError('forbidden');
        await assertActiveUser(client, next.ownerId);
      }
      await client.query(
        `UPDATE phs.risk SET probability = $3, impact = $4, mitigation_due_on = $5, strategy = $6, owner_id = $7,
                status = $8, revision = revision + 1
          WHERE project_id = $1 AND id = $2`,
        [projectId, riskId, next.probability, next.impact, next.mitigationDueOn, next.strategy, next.ownerId, next.status]);
      const after = toRisk(await this.one(client, projectId, riskId, false), project, actor.userId);
      await this.record(client, actor, projectId, next.status === before.status ? 'risk.followed_up' : `risk.${next.status}`, input.comment, before, after);
      return after;
    });
  }

  async history(userId: string, projectId: string, riskId: string): Promise<HistoryEntry[]> {
    if (!(await this.projects.get(userId, projectId))) throw new ProjectError('not_found');
    await this.one(this.pool, projectId, riskId, false);
    const found = await this.pool.query<{ occurred_at: Date; actor_id: string | null; actor_name: string | null; note: string; before_data: Record<string, unknown>; after_data: Record<string, unknown> }>(
      `SELECT a.occurred_at, a.actor_id, u.display_name AS actor_name, a.note, a.before_data, a.after_data
         FROM phs.activity a LEFT JOIN phs.app_user u ON u.id = a.actor_id
        WHERE a.project_id = $1 AND a.risk_id = $2 ORDER BY a.occurred_at DESC`, [projectId, riskId]);
    return found.rows.map((r) => ({
      occurredAt: r.occurred_at.toISOString(), actor: r.actor_id ? { id: r.actor_id, displayName: r.actor_name! } : null,
      note: r.note, before: r.before_data, after: r.after_data,
    }));
  }
}
