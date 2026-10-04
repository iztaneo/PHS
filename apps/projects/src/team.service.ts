import { insertAudit, withTransaction } from '@phs/service-kit';
import type pg from 'pg';
import {
  ProjectError, assertActiveUser, bumpProjectRevision, lockProject, type Actor, type ProjectsService,
} from './projects.service.js';

export interface Member {
  userId: string;
  displayName: string;
  email: string;
  active: boolean;
  role: 'contributor' | 'viewer';
  allocationPct: number | null;
}

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

export class TeamService {
  constructor(private readonly pool: pg.Pool, private readonly projects: ProjectsService) {}

  private async members(db: Queryable, projectId: string): Promise<Member[]> {
    const found = await db.query<{ user_id: string; display_name: string; email: string; active: boolean; role: Member['role']; allocation_pct: string | null }>(
      `SELECT m.user_id, u.display_name, u.email, u.active, m.role, m.allocation_pct
         FROM phs.project_member m JOIN phs.app_user u ON u.id = m.user_id
        WHERE m.project_id = $1 ORDER BY u.display_name`, [projectId]);
    return found.rows.map((r) => ({
      userId: r.user_id, displayName: r.display_name, email: r.email, active: r.active, role: r.role,
      allocationPct: r.allocation_pct === null ? null : Number(r.allocation_pct),
    }));
  }

  async list(userId: string, projectId: string): Promise<Member[]> {
    if (!(await this.projects.get(userId, projectId))) throw new ProjectError('not_found');
    return this.members(this.pool, projectId);
  }

  // Adds or updates in one statement: asking twice never produces two members.
  async put(actor: Actor, projectId: string, userId: string, input: { role: Member['role']; allocationPct: number | null }): Promise<Member[]> {
    return withTransaction(this.pool, async (client) => {
      await lockProject(client, this.projects, actor, projectId, 'editOperation');
      await assertActiveUser(client, userId);
      const before = (await this.members(client, projectId)).find((m) => m.userId === userId);
      if (before?.role === input.role && before.allocationPct === input.allocationPct) return this.members(client, projectId);
      await client.query(
        `INSERT INTO phs.project_member(project_id, user_id, role, allocation_pct) VALUES($1, $2, $3, $4)
         ON CONFLICT (project_id, user_id) DO UPDATE SET role = excluded.role, allocation_pct = excluded.allocation_pct`,
        [projectId, userId, input.role, input.allocationPct]);
      await bumpProjectRevision(client, projectId);
      await insertAudit(client, {
        requestId: actor.requestId, actorId: actor.userId, action: before ? 'member.updated' : 'member.added',
        entityType: 'project_member', entityId: userId, projectId,
        before: before ? { role: before.role, allocationPct: before.allocationPct } : undefined, after: input,
      });
      return this.members(client, projectId);
    });
  }

  async remove(actor: Actor, projectId: string, userId: string, keepResponsibilities: boolean): Promise<Member[]> {
    return withTransaction(this.pool, async (client) => {
      await lockProject(client, this.projects, actor, projectId, 'editOperation');
      const member = (await this.members(client, projectId)).find((m) => m.userId === userId);
      if (!member) throw new ProjectError('not_found');
      const open = await client.query<{ milestones: string; risks: string; renewals: string; tasks: string }>(
        `SELECT (SELECT count(*) FROM phs.milestone WHERE project_id = $1 AND owner_id = $2 AND status NOT IN ('completed','cancelled')) AS milestones,
                (SELECT count(*) FROM phs.risk WHERE project_id = $1 AND owner_id = $2 AND status NOT IN ('mitigated','closed')) AS risks,
                (SELECT count(*) FROM phs.renewal WHERE project_id = $1 AND owner_id = $2 AND status = 'pending') AS renewals,
                (SELECT count(*) FROM phs.health_task WHERE project_id = $1 AND owner_id = $2 AND status NOT IN ('completed','cancelled')) AS tasks`,
        [projectId, userId]);
      const responsibilities = Object.fromEntries(Object.entries(open.rows[0]!).map(([k, v]) => [k, Number(v)]));
      const pending = Object.values(responsibilities).some((n) => n > 0);
      // The owner of an open element keeps read access through it; removing the member needs that to be explicit.
      if (pending && !keepResponsibilities) throw new ProjectError('member_has_responsibilities', undefined, { responsibilities });
      await client.query('DELETE FROM phs.project_member WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
      await bumpProjectRevision(client, projectId);
      await insertAudit(client, {
        requestId: actor.requestId, actorId: actor.userId, action: 'member.removed', entityType: 'project_member',
        entityId: userId, projectId, before: { role: member.role, allocationPct: member.allocationPct },
        after: pending ? { keptResponsibilities: responsibilities } : undefined,
      });
      return this.members(client, projectId);
    });
  }
}
