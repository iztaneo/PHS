import { INTERNAL_AUTH_HEADER, type ProjectCapabilities } from '@phs/service-kit';

export type TargetKind = 'milestone' | 'risk' | 'change' | 'review';

export interface TargetAccess {
  capabilities: ProjectCapabilities;
  // The user may add evidence to this element.
  canAdd: boolean;
  // The element is already completed, closed or decided: new evidence is an addendum.
  closed: boolean;
}

interface Listed { id: string; status?: string; canUpdate?: boolean; decision?: unknown }

// Who may see or update what is decided by the Projects service (ADR-002); Platform asks with the
// identity the gateway signed.
export class ProjectsClient {
  constructor(private readonly baseUrl: string) {}

  private async fetch<T>(signedIdentity: string, path: string): Promise<T | null> {
    const response = await fetch(new URL(path, this.baseUrl), {
      headers: { [INTERNAL_AUTH_HEADER]: signedIdentity }, signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404 || response.status === 401) return null;
    if (!response.ok) throw new Error(`Projects service answered ${response.status}`);
    return (await response.json()) as T;
  }

  async capabilities(signedIdentity: string, projectId: string): Promise<ProjectCapabilities | null> {
    const project = await this.fetch<{ capabilities: ProjectCapabilities }>(signedIdentity, `/projects/${projectId}`);
    return project?.capabilities.view ? project.capabilities : null;
  }

  async target(signedIdentity: string, projectId: string, kind: Exclude<TargetKind, 'review'>, id: string): Promise<TargetAccess | null> {
    const capabilities = await this.capabilities(signedIdentity, projectId);
    if (!capabilities) return null;
    const path = { milestone: 'milestones', risk: 'risks', change: 'changes' }[kind];
    const item = (await this.fetch<Listed[]>(signedIdentity, `/projects/${projectId}/${path}`))?.find((x) => x.id === id);
    if (!item) return null;
    if (kind === 'change') {
      return { capabilities, canAdd: capabilities.proposeAndReview || capabilities.editOperation, closed: item.decision != null };
    }
    const closedStates = kind === 'milestone' ? ['completed', 'cancelled'] : ['mitigated', 'closed'];
    return { capabilities, canAdd: Boolean(item.canUpdate), closed: closedStates.includes(item.status ?? '') };
  }
}
