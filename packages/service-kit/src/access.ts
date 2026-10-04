// Authorization rules confirmed in D05 (docs/producto/DECISIONES.md). Pure: no I/O.
export type PracticeRole = 'pm' | 'lead' | 'director';

export interface Membership {
  practiceId: string;
  role: PracticeRole;
}

// What links a user to one project, besides practice roles.
export interface ProjectFacts {
  practiceId: string;
  isPm: boolean;
  isTeamMember: boolean;
  // Lead, technical owner or sponsor named on the project: they consult only.
  isNamedResponsible: boolean;
  // Owner of a milestone, risk, renewal or task of the project.
  ownsElement: boolean;
}

export interface ProjectCapabilities {
  view: boolean;
  editOperation: boolean;
  proposeAndReview: boolean;
  decide: boolean;
  seeFinancials: boolean;
}

function hasRole(memberships: Membership[], practiceId: string, role: PracticeRole): boolean {
  return memberships.some((m) => m.practiceId === practiceId && m.role === role);
}

export function projectCapabilities(memberships: Membership[], facts: ProjectFacts): ProjectCapabilities {
  const lead = hasRole(memberships, facts.practiceId, 'lead');
  const director = hasRole(memberships, facts.practiceId, 'director');
  return {
    view: lead || director || facts.isPm || facts.isTeamMember || facts.isNamedResponsible || facts.ownsElement,
    editOperation: facts.isPm || lead,
    proposeAndReview: facts.isPm,
    // Self-approval is allowed during the pilot, so a lead who is also the PM may decide.
    decide: lead,
    seeFinancials: facts.isPm || lead || director,
  };
}

export function canCreateProject(memberships: Membership[], practiceId: string): boolean {
  return hasRole(memberships, practiceId, 'pm') || hasRole(memberships, practiceId, 'lead');
}

// Practices whose every project the user may consult.
export function practicesWithFullView(memberships: Membership[]): string[] {
  return [...new Set(memberships.filter((m) => m.role !== 'pm').map((m) => m.practiceId))];
}
