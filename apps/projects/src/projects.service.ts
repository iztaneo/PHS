import {
  IdempotencyKeyReused, canCreateProject, insertAudit, insertOutbox, loadAccess, practicesWithFullView,
  projectCapabilities, runIdempotent, withTransaction, type Membership, type ProjectCapabilities,
} from '@phs/service-kit';
import type pg from 'pg';

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;
interface Person { id: string; displayName: string }

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  status: string;
  practiceId: string;
  practiceName: string;
  clientId: string;
  clientName: string;
  serviceTypeCode: string;
  serviceTypeName: string;
  pmName: string;
  startsOn: string;
  endsOn: string;
  capabilities: ProjectCapabilities;
}

export interface ProjectDetail extends ProjectSummary {
  description: string;
  pm: Person;
  lead: Person;
  technicalOwner: Person;
  sponsor: Person | null;
  clientContact: string;
  escalationNotes: string;
  currency: string;
  timezone: string;
  revision: number;
  hasBaseline: boolean;
}

export interface ProjectPage { items: ProjectSummary[]; total: number; page: number; pageSize: number }

export interface ListQuery {
  q?: string;
  clientId?: string;
  serviceTypeCode?: string;
  status?: string;
  page: number;
  pageSize: number;
}

export interface CreateProject {
  practiceId: string;
  code: string;
  name: string;
  description: string;
  clientName: string;
  serviceTypeCode: string;
  pmId: string;
  leadId: string;
  technicalOwnerId: string;
  sponsorId: string | null;
  clientContact: string;
  escalationNotes: string;
  startsOn: string;
  endsOn: string;
  currency: string;
}

export interface UpdateProject {
  expectedRevision: number;
  name?: string;
  description?: string;
  serviceTypeCode?: string;
  pmId?: string;
  leadId?: string;
  technicalOwnerId?: string;
  sponsorId?: string | null;
  clientContact?: string;
  escalationNotes?: string;
  startsOn?: string;
  endsOn?: string;
}

export interface Actor { userId: string; requestId: string }

export type ProjectErrorCode =
  | 'not_found' | 'forbidden' | 'practice_not_authorized' | 'code_taken' | 'invalid_dates'
  | 'service_type_inactive' | 'pm_not_eligible' | 'lead_not_eligible' | 'responsible_not_enabled'
  | 'revision_conflict' | 'baseline_change_required' | 'idempotency_key_reused'
  | 'member_has_responsibilities' | 'invalid_transition' | 'note_required' | 'reason_required'
  | 'invalid_completion_date' | 'baseline_exists';

export class ProjectError extends Error {
  constructor(
    readonly code: ProjectErrorCode,
    readonly currentRevision?: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

interface ProjectRow {
  id: string; code: string; name: string; status: string; description: string;
  practice_id: string; practice_name: string; client_id: string; client_name: string;
  service_type_code: string; service_type_name: string;
  pm_id: string; pm_name: string; lead_id: string; lead_name: string;
  technical_owner_id: string; technical_owner_name: string; sponsor_id: string | null; sponsor_name: string | null;
  starts_on: string; ends_on: string; currency: string; timezone: string; revision: string; has_baseline: boolean;
  client_contact: string; escalation_notes: string;
  is_pm: boolean; is_team_member: boolean; is_named: boolean; owns_element: boolean;
}

// $1 = user, $2 = practices where the user is lead or director. The final WHERE is the "view" rule
// of D05; capabilities are then computed by the same pure function used in tests.
const SCOPED = `
  WITH scoped AS (
    SELECT p.id, p.code, p.name, p.status, p.description, p.practice_id, pr.name AS practice_name,
           p.client_id, c.name AS client_name, p.service_type_code, st.name AS service_type_name,
           p.pm_id, pm.display_name AS pm_name, p.lead_id, ld.display_name AS lead_name,
           p.technical_owner_id, tech.display_name AS technical_owner_name,
           p.sponsor_id, sp.display_name AS sponsor_name, p.client_contact, p.escalation_notes,
           p.starts_on::text AS starts_on, p.ends_on::text AS ends_on, p.currency, p.timezone, p.revision,
           p.current_baseline_id IS NOT NULL AS has_baseline,
           p.pm_id = $1 AS is_pm,
           EXISTS (SELECT 1 FROM phs.project_member m WHERE m.project_id = p.id AND m.user_id = $1) AS is_team_member,
           (p.lead_id = $1 OR p.technical_owner_id = $1 OR coalesce(p.sponsor_id = $1, false)) AS is_named,
           (EXISTS (SELECT 1 FROM phs.milestone x WHERE x.project_id = p.id AND x.owner_id = $1)
             OR EXISTS (SELECT 1 FROM phs.risk x WHERE x.project_id = p.id AND x.owner_id = $1)
             OR EXISTS (SELECT 1 FROM phs.renewal x WHERE x.project_id = p.id AND x.owner_id = $1)
             OR EXISTS (SELECT 1 FROM phs.health_task x WHERE x.project_id = p.id AND x.owner_id = $1)) AS owns_element
      FROM phs.project p
      JOIN phs.practice pr ON pr.id = p.practice_id
      JOIN phs.client c ON c.id = p.client_id
      JOIN phs.service_type st ON st.code = p.service_type_code
      JOIN phs.app_user pm ON pm.id = p.pm_id
      JOIN phs.app_user ld ON ld.id = p.lead_id
      JOIN phs.app_user tech ON tech.id = p.technical_owner_id
      LEFT JOIN phs.app_user sp ON sp.id = p.sponsor_id
  ), visible AS (
    SELECT * FROM scoped
     WHERE (is_pm OR is_team_member OR is_named OR owns_element OR practice_id = ANY($2::uuid[]))
  )`;

function toDetail(row: ProjectRow, memberships: Membership[]): ProjectDetail {
  return {
    id: row.id, code: row.code, name: row.name, status: row.status,
    practiceId: row.practice_id, practiceName: row.practice_name,
    clientId: row.client_id, clientName: row.client_name,
    serviceTypeCode: row.service_type_code, serviceTypeName: row.service_type_name,
    pmName: row.pm_name, startsOn: row.starts_on, endsOn: row.ends_on,
    capabilities: projectCapabilities(memberships, {
      practiceId: row.practice_id, isPm: row.is_pm, isTeamMember: row.is_team_member,
      isNamedResponsible: row.is_named, ownsElement: row.owns_element,
    }),
    description: row.description,
    pm: { id: row.pm_id, displayName: row.pm_name },
    lead: { id: row.lead_id, displayName: row.lead_name },
    technicalOwner: { id: row.technical_owner_id, displayName: row.technical_owner_name },
    sponsor: row.sponsor_id ? { id: row.sponsor_id, displayName: row.sponsor_name! } : null,
    clientContact: row.client_contact, escalationNotes: row.escalation_notes,
    currency: row.currency, timezone: row.timezone, revision: Number(row.revision), hasBaseline: row.has_baseline,
  };
}

function toSummary(detail: ProjectDetail): ProjectSummary {
  const { description: _d, pm: _p, lead: _l, technicalOwner: _t, sponsor: _s, currency: _c, timezone: _z,
    revision: _r, hasBaseline: _b, clientContact: _cc, escalationNotes: _e, ...summary } = detail;
  return summary;
}

export class ProjectsService {
  constructor(private readonly pool: pg.Pool) {}

  async list(userId: string, query: ListQuery): Promise<ProjectPage> {
    const empty = { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    const access = await loadAccess(this.pool, userId);
    if (!access?.active) return empty;
    const params: unknown[] = [userId, practicesWithFullView(access.memberships)];
    const filters: string[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      filters.push(sql.replaceAll('?', `$${params.length}`));
    };
    // LIKE wildcards typed by the user are matched literally.
    if (query.q) add("(name ILIKE ? ESCAPE '!' OR code ILIKE ? ESCAPE '!')", `%${query.q.replace(/[!%_]/g, '!$&')}%`);
    if (query.clientId) add('client_id = ?', query.clientId);
    if (query.serviceTypeCode) add('service_type_code = ?', query.serviceTypeCode);
    if (query.status) add('status = ?', query.status);
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    params.push(query.pageSize, (query.page - 1) * query.pageSize);
    const found = await this.pool.query<ProjectRow & { total: string }>(
      `${SCOPED} SELECT *, count(*) OVER () AS total FROM visible ${where}
        ORDER BY name, code LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      items: found.rows.map((row) => toSummary(toDetail(row, access.memberships))),
      total: Number(found.rows[0]?.total ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // Null both when the project does not exist and when the user may not see it.
  async get(userId: string, projectId: string, db: Queryable = this.pool): Promise<ProjectDetail | null> {
    const access = await loadAccess(db, userId);
    if (!access?.active) return null;
    const found = await db.query<ProjectRow>(
      `${SCOPED} SELECT * FROM visible WHERE id = $3`,
      [userId, practicesWithFullView(access.memberships), projectId],
    );
    const row = found.rows[0];
    return row ? toDetail(row, access.memberships) : null;
  }

  async clients(userId: string): Promise<{ id: string; name: string }[]> {
    const access = await loadAccess(this.pool, userId);
    if (!access?.active) return [];
    const found = await this.pool.query<{ id: string; name: string }>(
      `${SCOPED} SELECT DISTINCT client_id AS id, client_name AS name FROM visible ORDER BY name`,
      [userId, practicesWithFullView(access.memberships)],
    );
    return found.rows;
  }

  // Directory used to name responsibles; only for those who may create projects in the practice.
  async people(userId: string, practiceId: string): Promise<{ id: string; displayName: string; email: string; roles: string[] }[]> {
    const access = await loadAccess(this.pool, userId);
    if (!access?.active || !canCreateProject(access.memberships, practiceId)) throw new ProjectError('forbidden');
    const found = await this.pool.query<{ id: string; display_name: string; email: string; roles: string[] }>(
      `SELECT u.id, u.display_name, u.email,
              coalesce(array_agg(m.role ORDER BY m.role) FILTER (WHERE m.role IS NOT NULL), '{}') AS roles
         FROM phs.app_user u
         LEFT JOIN phs.practice_membership m ON m.user_id = u.id AND m.practice_id = $1
        WHERE u.active
        GROUP BY u.id ORDER BY u.display_name`,
      [practiceId],
    );
    return found.rows.map((r) => ({ id: r.id, displayName: r.display_name, email: r.email, roles: r.roles }));
  }

  private async assertServiceType(client: pg.PoolClient, code: string): Promise<void> {
    const found = await client.query('SELECT 1 FROM phs.service_type WHERE code = $1 AND active', [code]);
    if (!found.rowCount) throw new ProjectError('service_type_inactive');
  }

  // PM and lead must be active and hold that role in the practice; other responsibles must be active.
  private async assertResponsibles(
    client: pg.PoolClient,
    practiceId: string,
    people: { pmId?: string; leadId?: string; technicalOwnerId?: string; sponsorId?: string | null },
  ): Promise<void> {
    const ids = [people.pmId, people.leadId, people.technicalOwnerId, people.sponsorId].filter((id): id is string => Boolean(id));
    if (!ids.length) return;
    const found = await client.query<{ id: string; roles: string[] }>(
      `SELECT u.id, coalesce(array_agg(m.role) FILTER (WHERE m.role IS NOT NULL), '{}') AS roles
         FROM phs.app_user u
         LEFT JOIN phs.practice_membership m ON m.user_id = u.id AND m.practice_id = $2
        WHERE u.id = ANY($1::uuid[]) AND u.active
        GROUP BY u.id`,
      [ids, practiceId],
    );
    const roles = new Map(found.rows.map((r) => [r.id, r.roles]));
    if (people.pmId && !roles.get(people.pmId)?.includes('pm')) throw new ProjectError('pm_not_eligible');
    if (people.leadId && !roles.get(people.leadId)?.includes('lead')) throw new ProjectError('lead_not_eligible');
    if (ids.some((id) => !roles.has(id))) throw new ProjectError('responsible_not_enabled');
  }

  async create(actor: Actor, input: CreateProject, idempotencyKey: string): Promise<{ project: ProjectDetail; replayed: boolean }> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await runIdempotent(
          client,
          { service: 'projects', userId: actor.userId, key: idempotencyKey, command: 'project.create', payload: input },
          async () => ({ status: 201, body: await this.createInTransaction(client, actor, input) }),
        );
        return { project: result.body, replayed: result.replayed };
      });
    } catch (error) {
      if (error instanceof IdempotencyKeyReused) throw new ProjectError('idempotency_key_reused');
      throw error;
    }
  }

  private async createInTransaction(client: pg.PoolClient, actor: Actor, input: CreateProject): Promise<ProjectDetail> {
    const access = await loadAccess(client, actor.userId);
    if (!access?.active || !canCreateProject(access.memberships, input.practiceId)) {
      throw new ProjectError('practice_not_authorized');
    }
    if (input.endsOn < input.startsOn) throw new ProjectError('invalid_dates');
    await this.assertServiceType(client, input.serviceTypeCode);
    await this.assertResponsibles(client, input.practiceId, input);
    // A PM registers their own projects; assigning another PM requires the lead role.
    const isLead = access.memberships.some((m) => m.practiceId === input.practiceId && m.role === 'lead');
    if (!isLead && input.pmId !== actor.userId) throw new ProjectError('pm_not_eligible');
    const taken = await client.query('SELECT 1 FROM phs.project WHERE code = $1', [input.code]);
    if (taken.rowCount) throw new ProjectError('code_taken');

    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`client:${input.clientName.toLowerCase()}`]);
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM phs.client WHERE lower(name) = lower($1) ORDER BY created_at LIMIT 1', [input.clientName]);
    const clientId = existing.rows[0]?.id
      ?? (await client.query<{ id: string }>('INSERT INTO phs.client(name) VALUES($1) RETURNING id', [input.clientName])).rows[0]!.id;

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO phs.project(practice_id, client_id, code, name, description, service_type_code, pm_id, lead_id,
                               technical_owner_id, sponsor_id, starts_on, ends_on, currency, client_contact,
                               escalation_notes, timezone)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, pr.timezone FROM phs.practice pr WHERE pr.id = $1
       RETURNING id`,
      [input.practiceId, clientId, input.code, input.name, input.description, input.serviceTypeCode, input.pmId,
        input.leadId, input.technicalOwnerId, input.sponsorId, input.startsOn, input.endsOn, input.currency,
        input.clientContact, input.escalationNotes],
    );
    const id = inserted.rows[0]!.id;
    await insertAudit(client, {
      requestId: actor.requestId, actorId: actor.userId, action: 'project.created', entityType: 'project', entityId: id,
      projectId: id, after: { ...input, clientId },
    });
    await insertOutbox(client, {
      projectId: id, eventType: 'project.created', deduplicationKey: `project.created:${id}`,
      payload: { projectId: id, revision: 1 },
    });
    const project = await this.get(actor.userId, id, client);
    if (!project) throw new ProjectError('forbidden');
    return project;
  }

  async update(actor: Actor, projectId: string, input: UpdateProject): Promise<ProjectDetail> {
    return withTransaction(this.pool, async (client) => {
      // Lock the row first so two editors are decided one after the other.
      const locked = await client.query<{ revision: string }>(
        'SELECT revision FROM phs.project WHERE id = $1 FOR UPDATE', [projectId]);
      const before = locked.rows[0] ? await this.get(actor.userId, projectId, client) : null;
      if (!before) throw new ProjectError('not_found');
      if (!before.capabilities.editOperation) throw new ProjectError('forbidden');
      if (before.revision !== input.expectedRevision) throw new ProjectError('revision_conflict', before.revision);

      const { expectedRevision: _expected, ...changes } = input;
      const current: Record<string, unknown> = {
        name: before.name, description: before.description, serviceTypeCode: before.serviceTypeCode,
        pmId: before.pm.id, leadId: before.lead.id, technicalOwnerId: before.technicalOwner.id,
        sponsorId: before.sponsor?.id ?? null, startsOn: before.startsOn, endsOn: before.endsOn,
        clientContact: before.clientContact, escalationNotes: before.escalationNotes,
      };
      const changed = Object.fromEntries(
        Object.entries(changes).filter(([key, value]) => value !== undefined && value !== current[key]));
      if (!Object.keys(changed).length) return before;

      // Reassigning who governs the project is a decision of the practice lead.
      if (('pmId' in changed || 'leadId' in changed) && !before.capabilities.decide) throw new ProjectError('forbidden');
      // Dates are commitments once a baseline exists: they change through an approved change.
      if (('startsOn' in changed || 'endsOn' in changed) && before.hasBaseline) throw new ProjectError('baseline_change_required');
      const next = { ...current, ...changed } as Record<string, string | null>;
      if (next.endsOn! < next.startsOn!) throw new ProjectError('invalid_dates');
      if ('serviceTypeCode' in changed) await this.assertServiceType(client, next.serviceTypeCode!);
      await this.assertResponsibles(client, before.practiceId, changed as Parameters<ProjectsService['assertResponsibles']>[2]);

      await client.query(
        `UPDATE phs.project
            SET name = $2, description = $3, service_type_code = $4, pm_id = $5, lead_id = $6,
                technical_owner_id = $7, sponsor_id = $8, starts_on = $9, ends_on = $10, client_contact = $11,
                escalation_notes = $12, revision = revision + 1
          WHERE id = $1`,
        [projectId, next.name, next.description, next.serviceTypeCode, next.pmId, next.leadId,
          next.technicalOwnerId, next.sponsorId, next.startsOn, next.endsOn, next.clientContact, next.escalationNotes],
      );
      const revision = before.revision + 1;
      await insertAudit(client, {
        requestId: actor.requestId, actorId: actor.userId, action: 'project.updated', entityType: 'project',
        entityId: projectId, projectId,
        before: Object.fromEntries(Object.keys(changed).map((key) => [key, current[key]])),
        after: changed,
      });
      await insertOutbox(client, {
        projectId, eventType: 'project.updated', deduplicationKey: `project.updated:${projectId}:${revision}`,
        payload: { projectId, revision, fields: Object.keys(changed) },
      });
      // The actor may have reassigned themselves out of the project; return what they just saved.
      return (await this.get(actor.userId, projectId, client)) ?? { ...before, ...{ revision } };
    });
  }
}

export type Capability = 'view' | 'editOperation';

// Locks the project row and returns it as the actor sees it. Every command on a project or its
// children starts here, so concurrent commands on one project are decided one after the other.
export async function lockProject(
  client: pg.PoolClient,
  projects: ProjectsService,
  actor: Actor,
  projectId: string,
  capability: Capability,
): Promise<ProjectDetail> {
  const locked = await client.query('SELECT 1 FROM phs.project WHERE id = $1 FOR UPDATE', [projectId]);
  const project = locked.rowCount ? await projects.get(actor.userId, projectId, client) : null;
  if (!project) throw new ProjectError('not_found');
  if (!project.capabilities[capability]) throw new ProjectError('forbidden');
  return project;
}

// A change to a child is a change to the project's inputs: the project revision moves too.
export async function bumpProjectRevision(client: pg.PoolClient, projectId: string): Promise<number> {
  const updated = await client.query<{ revision: string }>(
    'UPDATE phs.project SET revision = revision + 1 WHERE id = $1 RETURNING revision', [projectId]);
  return Number(updated.rows[0]!.revision);
}

export async function assertActiveUser(client: pg.PoolClient, userId: string): Promise<void> {
  const found = await client.query('SELECT 1 FROM phs.app_user WHERE id = $1 AND active', [userId]);
  if (!found.rowCount) throw new ProjectError('responsible_not_enabled');
}
