import { describe, expect, it } from 'vitest';
import { canCreateProject, practicesWithFullView, projectCapabilities, type ProjectFacts } from './access.js';

const P1 = 'practice-1';
const P2 = 'practice-2';
const none: ProjectFacts = { practiceId: P1, isPm: false, isTeamMember: false, isNamedResponsible: false, ownsElement: false };
const all = (value: boolean) => ({ view: value, editOperation: value, proposeAndReview: value, decide: value, seeFinancials: value });

describe('project capabilities (D05)', () => {
  it('gives nothing to a user without a link to the project', () => {
    expect(projectCapabilities([], none)).toEqual(all(false));
    expect(projectCapabilities([{ practiceId: P1, role: 'pm' }], none)).toEqual(all(false));
    expect(projectCapabilities([{ practiceId: P2, role: 'lead' }, { practiceId: P2, role: 'director' }], none)).toEqual(all(false));
  });

  it('lets the assigned PM operate, propose and see financials, but not decide', () => {
    expect(projectCapabilities([{ practiceId: P1, role: 'pm' }], { ...none, isPm: true }))
      .toEqual({ view: true, editOperation: true, proposeAndReview: true, decide: false, seeFinancials: true });
  });

  it('lets a practice lead edit and decide, but propose only when also the PM', () => {
    const lead = [{ practiceId: P1, role: 'lead' as const }];
    expect(projectCapabilities(lead, none))
      .toEqual({ view: true, editOperation: true, proposeAndReview: false, decide: true, seeFinancials: true });
    expect(projectCapabilities(lead, { ...none, isPm: true })).toEqual(all(true));
  });

  it('lets direction consult, including financials, and nothing else', () => {
    expect(projectCapabilities([{ practiceId: P1, role: 'director' }], none))
      .toEqual({ view: true, editOperation: false, proposeAndReview: false, decide: false, seeFinancials: true });
  });

  it('lets team members, named responsibles and element owners consult without financials', () => {
    const readOnly = { view: true, editOperation: false, proposeAndReview: false, decide: false, seeFinancials: false };
    expect(projectCapabilities([], { ...none, isTeamMember: true })).toEqual(readOnly);
    expect(projectCapabilities([], { ...none, isNamedResponsible: true })).toEqual(readOnly);
    expect(projectCapabilities([], { ...none, ownsElement: true })).toEqual(readOnly);
  });

  it('scopes project creation and full view by practice role', () => {
    const memberships = [{ practiceId: P1, role: 'pm' as const }, { practiceId: P2, role: 'director' as const }];
    expect(canCreateProject(memberships, P1)).toBe(true);
    expect(canCreateProject(memberships, P2)).toBe(false);
    expect(practicesWithFullView(memberships)).toEqual([P2]);
  });
});
