import {
  loadAccess, practicesWithFullView, projectCapabilities, type ProjectCapabilities,
} from '@phs/service-kit';
import type pg from 'pg';

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  status: string;
  practiceId: string;
  practiceName: string;
  clientName: string;
  capabilities: ProjectCapabilities;
}

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  status: string;
  practice_id: string;
  practice_name: string;
  client_name: string;
  is_pm: boolean;
  is_team_member: boolean;
  is_named: boolean;
  owns_element: boolean;
}

// $1 = user, $2 = practices where the user is lead or director. The WHERE clause is the
// "view" rule of D05; capabilities are then computed by the same pure function used in tests.
const VISIBLE_PROJECTS = `
  WITH scoped AS (
    SELECT p.id, p.code, p.name, p.status, p.practice_id, pr.name AS practice_name, c.name AS client_name,
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
  )
  SELECT * FROM scoped
   WHERE (is_pm OR is_team_member OR is_named OR owns_element OR practice_id = ANY($2::uuid[]))`;

export class ProjectsService {
  constructor(private readonly pool: pg.Pool) {}

  private async visible(userId: string, projectId?: string): Promise<ProjectSummary[]> {
    const access = await loadAccess(this.pool, userId);
    if (!access?.active) return [];
    const params: unknown[] = [userId, practicesWithFullView(access.memberships)];
    let sql = VISIBLE_PROJECTS;
    if (projectId) {
      params.push(projectId);
      sql += ' AND id = $3';
    }
    const found = await this.pool.query<ProjectRow>(`${sql} ORDER BY name`, params);
    return found.rows
      .map((row) => ({
        id: row.id, code: row.code, name: row.name, status: row.status,
        practiceId: row.practice_id, practiceName: row.practice_name, clientName: row.client_name,
        capabilities: projectCapabilities(access.memberships, {
          practiceId: row.practice_id, isPm: row.is_pm, isTeamMember: row.is_team_member,
          isNamedResponsible: row.is_named, ownsElement: row.owns_element,
        }),
      }))
      .filter((project) => project.capabilities.view);
  }

  list(userId: string): Promise<ProjectSummary[]> {
    return this.visible(userId);
  }

  // Null both when the project does not exist and when the user may not see it.
  async get(userId: string, projectId: string): Promise<ProjectSummary | null> {
    return (await this.visible(userId, projectId))[0] ?? null;
  }
}
