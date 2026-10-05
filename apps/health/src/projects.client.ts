import { INTERNAL_AUTH_HEADER, type ProjectCapabilities } from '@phs/service-kit';

// What the Projects service lists for a user: only projects in their scope.
export interface ListedProject {
  id: string; code: string; name: string; status: string; practiceId: string; practiceName: string; clientId: string; clientName: string;
  serviceTypeCode: string; serviceTypeName: string; pmName: string;
  capabilities: ProjectCapabilities;
}

export interface ProjectAccess {
  id: string;
  capabilities: ProjectCapabilities;
}

// Who may see a project is decided by the Projects service (ADR-002). Health forwards the identity
// the gateway signed and asks; it never re-implements the scope rules.
export class ProjectsClient {
  constructor(private readonly baseUrl: string) {}

  async access(signedIdentity: string, projectId: string): Promise<ProjectAccess | null> {
    const response = await fetch(new URL(`/projects/${projectId}`, this.baseUrl), {
      headers: { [INTERNAL_AUTH_HEADER]: signedIdentity },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404 || response.status === 401) return null;
    if (!response.ok) throw new Error(`Projects service answered ${response.status}`);
    const project = (await response.json()) as ProjectAccess;
    return project.capabilities.view ? { id: project.id, capabilities: project.capabilities } : null;
  }

  // Every project the user may consult, up to `max`. `truncated` tells the caller the list is not complete.
  async list(signedIdentity: string, max = 300): Promise<{ projects: ListedProject[]; truncated: boolean }> {
    const projects: ListedProject[] = [];
    for (let page = 1; ; page += 1) {
      const response = await fetch(new URL(`/projects?pageSize=100&page=${page}`, this.baseUrl), {
        headers: { [INTERNAL_AUTH_HEADER]: signedIdentity }, signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Projects service answered ${response.status}`);
      const body = (await response.json()) as { items: ListedProject[]; total: number };
      projects.push(...body.items);
      if (projects.length >= body.total || body.items.length === 0) return { projects, truncated: false };
      if (projects.length >= max) return { projects, truncated: true };
    }
  }

  // Economy belongs to Projects: a review that reports cost and effort asks it to record them, as
  // the user and with a key that makes a retry return the same observation (ADR-002).
  async recordFinance(
    signedIdentity: string, projectId: string,
    input: { effectiveOn: string; totalCost: string; totalEffortHours: string | null }, idempotencyKey: string,
  ): Promise<'recorded' | 'forbidden' | 'rejected'> {
    const response = await fetch(new URL(`/projects/${projectId}/finance`, this.baseUrl), {
      method: 'POST',
      headers: { [INTERNAL_AUTH_HEADER]: signedIdentity, 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify({ ...input, source: 'Health Review', supersedesId: null }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) return 'recorded';
    if (response.status === 403 || response.status === 404 || response.status === 401) return 'forbidden';
    if (response.status === 400 || response.status === 409) return 'rejected';
    throw new Error(`Projects service answered ${response.status}`);
  }
}
