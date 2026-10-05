export type PracticeRole = 'pm' | 'lead' | 'director';

export interface Membership {
  practiceId: string;
  practiceName: string;
  role: PracticeRole;
}

export interface SessionUser {
  id: string;
  displayName: string;
  email: string;
  mustChangePassword: boolean;
  isAdmin: boolean;
  memberships: Membership[];
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  isAdmin: boolean;
  memberships: Membership[];
}

export interface Practice {
  id: string;
  code: string;
  name: string;
  timezone: string;
}

export interface ServiceType {
  code: string;
  name: string;
  active: boolean;
}

export interface Responsibilities {
  projectsAsPm: number;
  projectsAsLead: number;
  projectsAsTechnicalOwner: number;
}

export interface Capabilities {
  view: boolean;
  editOperation: boolean;
  proposeAndReview: boolean;
  decide: boolean;
  seeFinancials: boolean;
}

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  status: string;
  justificationRequired: boolean;
  practiceId: string;
  practiceName: string;
  clientId: string;
  clientName: string;
  serviceTypeCode: string;
  serviceTypeName: string;
  pmName: string;
  startsOn: string;
  endsOn: string;
  capabilities: Capabilities;
}

export interface Person { id: string; displayName: string }

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
export interface PracticePerson extends Person { email: string; roles: PracticeRole[] }
export interface ProjectFilters { q: string; clientId: string; serviceTypeCode: string; status: string; page: number }

export interface ProjectInput {
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
}

export interface Member {
  userId: string; displayName: string; email: string; active: boolean; role: 'contributor' | 'viewer'; allocationPct: number | null;
}

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'rescheduled' | 'cancelled';
export interface Milestone {
  id: string; title: string; deliverable: string; owner: Person; dueOn: string; committedDueOn: string | null;
  critical: boolean; status: MilestoneStatus; progressPct: number | null; completedOn: string | null;
  completionNote: string | null; overdue: boolean; revision: number; canUpdate: boolean;
}

export interface Baseline {
  id: string; version: number; current: boolean; startsOn: string; endsOn: string; scope: string;
  budget: string | null; effortHours: string | null; financialsHidden: boolean; currency: string;
  milestones: { id: string; title: string; deliverable: string; due_on: string; owner_name: string; critical: boolean }[];
  team: { user_id: string; display_name: string; role: string; allocation_pct: number | null }[];
  reason: string; createdBy: Person; createdAt: string;
}

export interface Observation {
  id: string; effectiveOn: string; totalCost: string; totalEffortHours: string | null; source: string;
  recordedBy: Person; recordedAt: string; supersedesId: string | null; superseded: boolean;
}
export interface FinanceSummary {
  currency: string; asOf: string; budget: string | null; effortBudgetHours: string | null; current: Observation | null;
  actualProgress: string | null; expectedCost: string | null; deviation: string | null; gate: boolean;
  missing: ('budget' | 'cost' | 'progress')[]; ruleSetVersion: string; observations: Observation[];
}

export type RiskStatus = 'open' | 'mitigating' | 'mitigated' | 'materialized' | 'closed';
export interface Risk {
  id: string; title: string; description: string; riskType: 'project' | 'client'; category: string; probability: number;
  impact: number; severity: number; owner: Person; mitigationDueOn: string; strategy: string; status: RiskStatus;
  overdue: boolean; revision: number; canUpdate: boolean;
}
export interface RiskInput {
  title: string; description: string; riskType: 'project' | 'client'; category: string; probability: number; impact: number;
  ownerId: string; mitigationDueOn: string; strategy: string;
}
export interface RiskHistoryEntry { occurredAt: string; actor: Person | null; note: string; before: Record<string, unknown>; after: Record<string, unknown> }

export interface Task {
  id: string; projectId: string; projectName: string; eventId: string | null; title: string; description: string; owner: Person;
  dueOn: string; priority: 'high' | 'medium' | 'low'; status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  automatic: boolean; overdue: boolean; closedAt: string | null; closureNote: string | null; revision: number; canUpdate: boolean;
}
export interface HealthEvent {
  id: string; ruleKey: string; severity: 'info' | 'warning' | 'critical'; title: string; episode: number; openedAt: string;
  resolvedAt: string | null; resolutionNote: string | null;
  responseStatus: 'not_required' | 'missing' | 'pending' | 'returned' | 'validated';
  response: null | {
    id: string; revisionNo: number; cause: string; kind: 'remediation' | 'replan'; plan: string; changeId: string | null; submittedBy: Person;
    submittedAt: string; validation: null | { decision: 'validated' | 'returned'; validator: Person; decidedAt: string; comment: string };
  };
  task: Task | null; canRespond: boolean; canValidate: boolean;
}

export type Cadence = 'weekly' | 'fortnightly' | 'monthly';
export type ReviewTopic = 'schedule' | 'milestones' | 'risks' | 'client' | 'finance' | 'scope' | 'team';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export interface ReviewFinance { totalCost: string; totalEffortHours: string | null }
export interface Holiday { day: string; name: string }
export type Climate = 'good' | 'tense' | 'critical';
export interface ReviewPolicyInput {
  cadence: Cadence; nextDueOn: string; forecastCycles: number; evidenceRequired: boolean; leadValidationRequired: boolean; autoTasks: boolean;
}
export interface Expectation {
  kind: 'milestone' | 'risk' | 'task' | 'renewal' | 'change' | 'alert'; id: string; title: string; dueOn: string | null;
  overdue: boolean; critical: boolean; blocking: boolean;
}
export interface DraftPayload {
  nothingChanged: boolean; topics: ReviewTopic[]; notes: Partial<Record<ReviewTopic, string>>; clientClimate: Climate | null;
  supportText: string; activeSeconds: number; declaredConfidence: ConfidenceLevel | null; finance: ReviewFinance | null;
}
export interface Review {
  id: string; revisionNo: number; author: Person; submittedAt: string; effectiveOn: string; late: boolean; nothingChanged: boolean;
  topics: ReviewTopic[]; notes: Partial<Record<ReviewTopic, string>>; clientClimate: Climate | null; supportText: string | null;
  durationSeconds: number | null; expectations: Expectation[]; declaredConfidence: ConfidenceLevel | null; finance: ReviewFinance | null;
  assessment: null | { score: string | null; band: 'healthy' | 'attention' | 'risk' | null };
  validation: null | { decision: 'validated' | 'returned'; validator: Person; decidedAt: string; comment: string };
}
export interface ReviewCycle {
  id: string; projectId: string; projectName: string; startsOn: string; dueOn: string;
  status: 'open' | 'overdue' | 'submitted' | 'returned' | 'validated' | 'closed'; started: boolean;
  policy: { cadence: Cadence; forecastCycles: number; evidenceRequired: boolean; leadValidationRequired: boolean };
  expectations: Expectation[]; draft: null | { revision: number; payload: DraftPayload; updatedAt: string }; reviews: Review[];
  lastClimate: Climate | null; projectRevision: number; canSubmit: boolean; canValidate: boolean;
}
export interface ReviewSchedule {
  projectId: string; policy: (ReviewPolicyInput & { revision: number }) | null; canConfigure: boolean; cycles: ReviewCycle[];
}

export interface StatusView {
  status: string; since: string | null; daysInStatus: number | null; allowed: string[]; justificationRequired: boolean;
  justificationAfterDays: number; open: Responsibilities4;
  history: { kind: 'transition' | 'justification'; fromStatus: string | null; toStatus: string; reason: string; recordedBy: Person; recordedAt: string }[];
}
export interface Renewal {
  id: string; dueOn: string; owner: Person; status: 'pending' | 'renewed' | 'cancelled'; notes: string; outcomeNote: string | null;
  closedAt: string | null; daysToDue: number; overdue: boolean; revision: number; canUpdate: boolean;
}

export interface Evidence {
  id: string; text: string | null; file: { name: string; mime: string; sizeBytes: number } | null; uploadedBy: Person;
  uploadedAt: string; addendum: boolean; withdrawn: { by: Person; at: string; reason: string } | null;
}
export type EvidenceKind = 'milestone' | 'risk' | 'change' | 'review';

interface BeforeAfter { before: string | null; proposed: string | null }
export interface Change {
  id: string; title: string; description: string; changeType: string; proposedBy: Person; proposedAt: string;
  impact: {
    baselineVersion: number; endsOn?: BeforeAfter; budget?: BeforeAfter & { delta: string }; effortHours?: BeforeAfter & { delta: string };
    scope?: BeforeAfter; milestones: { id: string; title: string; before: string; proposed: string }[]; correctsId: string | null;
  };
  financialsHidden: boolean;
  decision: null | { decision: 'approved' | 'rejected'; decidedBy: Person; decidedAt: string; comment: string; baselineVersion: number | null };
  canDecide: boolean;
}
export interface ChangeInput {
  title: string; description: string; changeType: string;
  impact: { endsOn?: string; budgetDelta?: string; scope?: string; milestones: { id: string; dueOn: string }[] };
}

export interface Assessment {
  stored: boolean; publication: 'provisional' | 'official'; effectiveOn: string; calculatedAt: string; projectRevision: number;
  ruleSetVersion: string; score: string | null; band: 'healthy' | 'attention' | 'risk' | null; weightedScore: string | null;
  gateCap: string | null; confidence: { value: string; level: 'high' | 'medium' | 'low'; deductions: { code: string; count: number; points: string }[] };
  dimensions: { key: string; weight: number; score: string | null; deductions: { code: string; count: number; points: string }[] }[];
  gates: { key: string; cap: number; active: boolean }[];
  metrics: { committedProgress: string | null; actualProgress: string | null; projectDeviation: string | null; financialDeviation: string | null; effortDeviation: string | null };
  financialsHidden: boolean;
}

export interface Cut { cycleDueOn: string; effectiveOn: string; score: string | null; ruleSetVersion: string }
export interface Outlook {
  today: string;
  trend: {
    direction: 'up' | 'down' | 'flat' | null; delta: string | null; reason: 'insufficient_history' | 'rule_set_changed' | 'no_score' | null;
    current: Cut | null; previous: Cut | null;
  };
  forecast: {
    pressure: string; projectedScore: string | null; level: 'stable' | 'at_risk' | 'deteriorating';
    factors: { code: string; target: { kind: 'milestone' | 'risk' | 'task' | 'renewal'; id: string; title: string; dueOn: string } | null; points: string }[];
    horizon: { cadence: Cadence; cycles: number; until: string; assumed: boolean };
  };
}
export interface SchedulerStatus {
  intervalSeconds: number; lastRun: { startedAt: string; finishedAt: string | null; projects: number; failures: number } | null;
}

export interface AppNotification {
  id: string; type: string; state: 'actionable' | 'attended' | 'info'; severity: 'critical' | 'warning' | 'info'; title: string;
  project: { id: string; code: string; name: string }; owner: Person | null; dueOn: string | null; tab: string; sentAt: string; readAt: string | null;
}
export interface Inbox { unread: number; items: AppNotification[] }
export interface CenterProject {
  id: string; code: string; name: string; status: string; practiceId: string; practiceName: string; clientName: string; pmName: string; mine: boolean;
  assessed: boolean; score: string | null; band: 'healthy' | 'attention' | 'risk' | null; confidenceLevel: 'high' | 'medium' | 'low' | null;
  review: { status: 'open' | 'overdue' | 'submitted' | 'returned'; dueOn: string } | null;
  counts: { criticalAlerts: number; overdueActions: number; upcomingMilestones: number; upcomingRisks: number; pendingDecisions: number };
}
export interface FocusItem {
  kind: string; severity: 'critical' | 'warning' | 'info'; projectId: string; projectName: string; subject: string | null; count: number;
  dueOn: string | null; tab: string;
}
export interface HealthCenter { today: string; projects: CenterProject[]; focus: FocusItem[]; incomplete: boolean }

export interface HistoryEntry { id: string; occurredAt: string; category: string; action: string; title: string; detail: string | null; actor: string | null }
export interface HistoryPage { items: HistoryEntry[]; nextCursor: string | null }
export interface TimelineItem { kind: string; title: string; date: string; critical: boolean; tab: string }
export interface Timeline {
  today: string; horizon: { until: string; cycles: number; cadence: Cadence; assumed: boolean };
  past: TimelineItem[]; overdue: TimelineItem[]; upcoming: TimelineItem[];
}
export interface InactiveProject {
  id: string; code: string; name: string; status: 'paused' | 'closed'; practiceId: string; practiceName: string; clientName: string; pmName: string;
  since: string | null; days: number | null; reason: string | null; changedBy: string | null; justificationRequired: boolean;
  lastJustification: { text: string; at: string; by: string } | null;
  stopped: { openMilestones: number; openRisks: number; openActions: number; pendingRenewals: number; reviewCycle: boolean };
}
export interface RuleSet {
  version: string; gateThresholds: { projectDeviation: string; financialDeviation: string }; dimensionWeights: Record<string, number>;
  gateCaps: Record<string, number>; bands: { healthy: number; attention: number }; trend: { improving: number; deteriorating: number };
  forecast: {
    milestone: number; criticalMilestone: number; riskPerSeverityPoint: string; task: number; renewal: number; perPointOfDecline: string;
    activeDeviationGate: number; levels: { atRisk: number; deteriorating: number };
  };
}

export interface PortfolioRow {
  id: string; code: string; name: string; status: string; counted: boolean; practiceName: string; clientId: string; clientName: string;
  serviceTypeCode: string; serviceTypeName: string; pmName: string; leadId: string; leadName: string; assessed: boolean; score: string | null;
  band: 'healthy' | 'attention' | 'risk' | null; confidenceLevel: 'high' | 'medium' | 'low' | null; freshness: 'fresh' | 'stale' | 'never';
  trend: 'up' | 'down' | 'flat' | null; lastReviewOn: string | null; currency: string; budget: string | null; financialDeviation: string | null;
  exposure: string | null; financialsVisible: boolean;
}
export interface PortfolioFilters { clientId: string; serviceTypeCode: string; leadId: string; status: string; band: string }
export interface Portfolio {
  today: string;
  options: { clients: { id: string; name: string }[]; serviceTypes: { code: string; name: string }[]; leads: { id: string; name: string }[] };
  indicators: {
    projects: number; excluded: number; assessed: number; withoutAssessment: number; average: string | null;
    distribution: { healthy: number; attention: number; risk: number }; confidence: { high: number; medium: number; low: number };
    freshness: { fresh: number; stale: number; never: number }; exposure: { currency: string; amount: string; projects: number }[]; exposureHidden: number;
  };
  projects: PortfolioRow[]; incomplete: boolean;
}

export interface Responsibilities4 { milestones: number; risks: number; renewals: number; tasks: number }

export type ProjectChanges = Partial<Omit<ProjectInput, 'practiceId' | 'code' | 'clientName'>>;

export interface ServiceStatus {
  service: string;
  status: 'ok' | 'degraded' | 'unreachable';
  database?: 'ok' | 'down';
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly currentRevision?: number,
    readonly responsibilities?: Responsibilities4,
  ) {
    super(code);
  }
}

// Sends a form with an optional file. The browser sets the multipart boundary itself.
async function upload<T>(path: string, form: FormData): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method: 'POST', credentials: 'same-origin', body: form });
  } catch {
    throw new ApiError(0, 'network_error');
  }
  const data = await response.json().catch(() => undefined) as { code?: string } | undefined;
  if (!response.ok) throw new ApiError(response.status, data?.code ?? (response.status === 413 ? 'file_too_large' : 'unexpected_error'));
  return data as T;
}

async function call<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : {
        'content-type': 'application/json',
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network_error');
  }
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    const failure = data as { code?: string; currentRevision?: number; responsibilities?: Responsibilities4 } | undefined;
    throw new ApiError(response.status, failure?.code ?? 'unexpected_error', failure?.currentRevision, failure?.responsibilities);
  }
  return data as T;
}

export const api = {
  session: () => call<{ user: SessionUser }>('GET', '/api/v1/session'),
  login: (email: string, password: string) => call<{ user: SessionUser }>('POST', '/api/v1/session', { email, password }),
  logout: () => call<void>('DELETE', '/api/v1/session'),
  changePassword: (currentPassword: string, newPassword: string) =>
    call<void>('POST', '/api/v1/session/password', { currentPassword, newPassword }),
  status: () => call<{ services: ServiceStatus[] }>('GET', '/api/v1/status'),
  projects: (filters: ProjectFilters) => {
    const query = new URLSearchParams({ page: String(filters.page), pageSize: '10' });
    if (filters.q) query.set('q', filters.q);
    if (filters.clientId) query.set('clientId', filters.clientId);
    if (filters.serviceTypeCode) query.set('serviceTypeCode', filters.serviceTypeCode);
    if (filters.status) query.set('status', filters.status);
    return call<ProjectPage>('GET', `/api/v1/projects?${query}`);
  },
  project: (id: string) => call<ProjectDetail>('GET', `/api/v1/projects/${id}`),
  // The key identifies this attempt: a retry after a network failure cannot create a second project.
  createProject: (input: ProjectInput, idempotencyKey: string) =>
    call<ProjectDetail>('POST', '/api/v1/projects', input, idempotencyKey),
  updateProject: (id: string, expectedRevision: number, changes: ProjectChanges) =>
    call<ProjectDetail>('PATCH', `/api/v1/projects/${id}`, { expectedRevision, ...changes }),
  members: (id: string) => call<Member[]>('GET', `/api/v1/projects/${id}/members`),
  putMember: (id: string, userId: string, role: Member['role'], allocationPct: number | null) =>
    call<Member[]>('PUT', `/api/v1/projects/${id}/members/${userId}`, { role, allocationPct }),
  removeMember: (id: string, userId: string, keepResponsibilities: boolean) =>
    call<Member[]>('DELETE', `/api/v1/projects/${id}/members/${userId}?keepResponsibilities=${keepResponsibilities}`),
  milestones: (id: string) => call<Milestone[]>('GET', `/api/v1/projects/${id}/milestones`),
  createMilestone: (id: string, input: { title: string; deliverable: string; ownerId: string; dueOn: string; critical: boolean }, key: string) =>
    call<Milestone>('POST', `/api/v1/projects/${id}/milestones`, input, key),
  updateMilestone: (id: string, milestoneId: string, expectedRevision: number, changes: { dueOn?: string; reason?: string }) =>
    call<Milestone>('PATCH', `/api/v1/projects/${id}/milestones/${milestoneId}`, { expectedRevision, ...changes }),
  transitionMilestone: (id: string, milestoneId: string, expectedRevision: number, to: string, note?: string) =>
    call<Milestone>('POST', `/api/v1/projects/${id}/milestones/${milestoneId}/transition`, { expectedRevision, to, ...(note ? { note } : {}) }),
  baselines: (id: string) => call<Baseline[]>('GET', `/api/v1/projects/${id}/baselines`),
  publishBaseline: (id: string, input: { expectedRevision: number; scope: string; budget: string | null; effortHours: string | null }, key: string) =>
    call<Baseline>('POST', `/api/v1/projects/${id}/baselines`, input, key),
  reviewSchedule: (id: string) => call<ReviewSchedule>('GET', `/api/v1/governance/projects/${id}/review-schedule`),
  saveReviewPolicy: (id: string, input: ReviewPolicyInput, expectedRevision: number) =>
    call<ReviewSchedule>('PUT', `/api/v1/governance/projects/${id}/review-policy`, { ...input, expectedRevision }),
  saveReviewDraft: (cycleId: string, payload: DraftPayload, expectedRevision: number) =>
    call<ReviewCycle>('PUT', `/api/v1/governance/cycles/${cycleId}/draft`, { payload, expectedRevision }),
  submitReview: (cycleId: string, payload: DraftPayload, expectedProjectRevision: number, key: string) =>
    call<ReviewCycle>('POST', `/api/v1/governance/cycles/${cycleId}/reviews`, { ...payload, expectedProjectRevision }, key),
  validateReview: (reviewId: string, decision: 'validated' | 'returned', comment: string) =>
    call<ReviewCycle>('POST', `/api/v1/governance/reviews/${reviewId}/validation`, { decision, comment }),
  holidays: (year: number) => call<Holiday[]>('GET', `/api/v1/governance/holidays?year=${year}`),
  addHoliday: (day: string, name: string) => call<Holiday[]>('POST', '/api/v1/governance/holidays', { day, name }),
  removeHoliday: (day: string) => call<Holiday[]>('DELETE', `/api/v1/governance/holidays/${day}`),
  pendingReviews: () => call<ReviewCycle[]>('GET', '/api/v1/governance/reviews/pending'),
  events: (id: string) => call<HealthEvent[]>('GET', `/api/v1/governance/projects/${id}/events`),
  respondEvent: (eventId: string, input: { cause: string; kind: 'remediation' | 'replan'; plan: string; changeId: string | null }) =>
    call<HealthEvent>('POST', `/api/v1/governance/events/${eventId}/responses`, input),
  validateResponse: (responseId: string, decision: 'validated' | 'returned', comment: string) =>
    call<HealthEvent>('POST', `/api/v1/governance/responses/${responseId}/validation`, { decision, comment }),
  tasks: (id: string) => call<Task[]>('GET', `/api/v1/governance/projects/${id}/tasks`),
  myTasks: () => call<Task[]>('GET', '/api/v1/governance/tasks/mine'),
  createTask: (id: string, input: { title: string; description: string; ownerId: string; dueOn: string; priority: string }, key: string) =>
    call<Task>('POST', `/api/v1/governance/projects/${id}/tasks`, input, key),
  transitionTask: (taskId: string, expectedRevision: number, to: string, note?: string) =>
    call<Task>('POST', `/api/v1/governance/tasks/${taskId}/transition`, { expectedRevision, to, ...(note ? { note } : {}) }),
  projectStatus: (id: string) => call<StatusView>('GET', `/api/v1/projects/${id}/status`),
  changeStatus: (id: string, expectedRevision: number, to: string, reason: string) =>
    call<ProjectDetail>('POST', `/api/v1/projects/${id}/status`, { expectedRevision, to, reason }),
  justifyStatus: (id: string, reason: string) => call<StatusView>('POST', `/api/v1/projects/${id}/status/justification`, { reason }),
  renewals: (id: string) => call<Renewal[]>('GET', `/api/v1/projects/${id}/renewals`),
  createRenewal: (id: string, input: { dueOn: string; ownerId: string; notes: string }, key: string) =>
    call<Renewal>('POST', `/api/v1/projects/${id}/renewals`, input, key),
  decideRenewal: (id: string, renewalId: string, expectedRevision: number, outcome: 'renewed' | 'cancelled', comment: string) =>
    call<Renewal>('POST', `/api/v1/projects/${id}/renewals/${renewalId}/outcome`, { expectedRevision, outcome, comment }),
  evidence: (projectId: string, kind: EvidenceKind, targetId: string) =>
    call<Evidence[]>('GET', `/api/v1/evidence?projectId=${projectId}&kind=${kind}&targetId=${targetId}`),
  addEvidence: (projectId: string, kind: EvidenceKind, targetId: string, text: string, file: File | null) => {
    const form = new FormData();
    form.set('projectId', projectId); form.set('kind', kind); form.set('targetId', targetId);
    if (text.trim()) form.set('text', text.trim());
    if (file) form.set('file', file);
    return upload<Evidence>('/api/v1/evidence', form);
  },
  withdrawEvidence: (id: string, reason: string) => call<Evidence>('POST', `/api/v1/evidence/${id}/withdraw`, { reason }),
  evidenceFileUrl: (id: string) => `/api/v1/evidence/${id}/file`,
  changes: (id: string) => call<Change[]>('GET', `/api/v1/projects/${id}/changes`),
  proposeChange: (id: string, input: ChangeInput, key: string) => call<Change>('POST', `/api/v1/projects/${id}/changes`, input, key),
  decideChange: (id: string, changeId: string, decision: 'approved' | 'rejected', comment: string, key: string) =>
    call<Change>('POST', `/api/v1/projects/${id}/changes/${changeId}/decision`, { decision, comment }, key),
  assessment: (id: string) => call<Assessment>('GET', `/api/v1/assessments/${id}`),
  outlook: (id: string) => call<Outlook>('GET', `/api/v1/assessments/${id}/outlook`),
  history: (projectId: string, filters: { category?: string; from?: string; to?: string; cursor?: string }) => {
    const params = new URLSearchParams({ projectId });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return call<HistoryPage>('GET', `/api/v1/history?${params}`);
  },
  timeline: (projectId: string) => call<Timeline>('GET', `/api/v1/history/timeline?projectId=${projectId}`),
  inactiveProjects: () => call<InactiveProject[]>('GET', '/api/v1/reports/inactive-projects'),
  rules: () => call<RuleSet>('GET', '/api/v1/assessments/rules'),
  portfolio: (filters: Partial<PortfolioFilters>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return call<Portfolio>('GET', `/api/v1/governance/portfolio?${params}`);
  },
  center: () => call<HealthCenter>('GET', '/api/v1/governance/center'),
  notifications: () => call<Inbox>('GET', '/api/v1/notifications'),
  readNotification: (id: string) => call<Inbox>('POST', `/api/v1/notifications/${id}/read`),
  readAllNotifications: () => call<Inbox>('POST', '/api/v1/notifications/read-all'),
  scheduler: () => call<SchedulerStatus>('GET', '/api/v1/governance/scheduler'),
  finance: (id: string) => call<FinanceSummary>('GET', `/api/v1/projects/${id}/finance`),
  recordObservation: (id: string, input: { effectiveOn: string; totalCost: string; totalEffortHours: string | null; source: string; supersedesId: string | null }, key: string) =>
    call<Observation>('POST', `/api/v1/projects/${id}/finance`, input, key),
  risks: (id: string) => call<Risk[]>('GET', `/api/v1/projects/${id}/risks`),
  createRisk: (id: string, input: RiskInput, key: string) => call<Risk>('POST', `/api/v1/projects/${id}/risks`, input, key),
  followUpRisk: (id: string, riskId: string, expectedRevision: number, comment: string, changes: { status?: RiskStatus; probability?: number; impact?: number; mitigationDueOn?: string }) =>
    call<Risk>('PATCH', `/api/v1/projects/${id}/risks/${riskId}`, { expectedRevision, comment, ...changes }),
  riskHistory: (id: string, riskId: string) => call<RiskHistoryEntry[]>('GET', `/api/v1/projects/${id}/risks/${riskId}/history`),
  clients: () => call<{ id: string; name: string }[]>('GET', '/api/v1/clients'),
  people: (practiceId: string) => call<PracticePerson[]>('GET', `/api/v1/people?practiceId=${practiceId}`),
  serviceTypes: () => call<ServiceType[]>('GET', '/api/v1/catalog/service-types'),
  admin: {
    users: () => call<AdminUser[]>('GET', '/api/v1/admin/users'),
    createUser: (email: string, displayName: string, isAdmin: boolean) =>
      call<{ user: AdminUser; temporaryPassword: string }>('POST', '/api/v1/admin/users', { email, displayName, isAdmin }),
    updateUser: (id: string, changes: { active?: boolean; isAdmin?: boolean }) =>
      call<{ user: AdminUser; responsibilities?: Responsibilities }>('PATCH', `/api/v1/admin/users/${id}`, changes),
    resetPassword: (id: string) =>
      call<{ temporaryPassword: string }>('POST', `/api/v1/admin/users/${id}/reset-password`),
    practices: () => call<Practice[]>('GET', '/api/v1/admin/practices'),
    createPractice: (code: string, name: string) => call<Practice>('POST', '/api/v1/admin/practices', { code, name }),
    setMembership: (userId: string, practiceId: string, role: PracticeRole, granted: boolean) =>
      call<AdminUser>('PUT', '/api/v1/admin/memberships', { userId, practiceId, role, granted }),
    serviceTypes: () => call<ServiceType[]>('GET', '/api/v1/catalog/service-types'),
    createServiceType: (code: string, name: string) =>
      call<ServiceType>('POST', '/api/v1/catalog/service-types', { code, name }),
    setServiceTypeActive: (code: string, active: boolean) =>
      call<ServiceType>('PATCH', `/api/v1/catalog/service-types/${code}`, { active }),
  },
};

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos, o la cuenta está bloqueada temporalmente.',
  invalid_current_password: 'La contraseña actual no es correcta.',
  weak_password: 'La nueva contraseña debe tener entre 12 y 128 caracteres y ser distinta de la actual.',
  authentication_required: 'Tu sesión terminó. Inicia sesión de nuevo.',
  forbidden: 'No tienes permiso para realizar esta operación.',
  practice_not_authorized: 'No puedes crear proyectos en esa práctica.',
  invalid_dates: 'La fecha de fin no puede ser anterior a la de inicio.',
  service_type_inactive: 'El tipo de servicio no está activo.',
  pm_not_eligible: 'El PM debe ser un usuario activo con rol de PM en la práctica. Solo un líder puede asignar a otro PM.',
  lead_not_eligible: 'El líder debe ser un usuario activo con rol de líder en la práctica.',
  responsible_not_enabled: 'Uno de los responsables no existe o está deshabilitado.',
  baseline_change_required: 'Las fechas forman parte de la línea base vigente; se modifican mediante un cambio aprobado.',
  revision_conflict: 'Otra persona modificó este proyecto mientras lo editabas. Tus cambios siguen en el formulario.',
  idempotency_key_reused: 'Esta solicitud ya se había enviado con otros datos. Vuelve a abrir el formulario.',
  not_found: 'El proyecto o el elemento no existe o no está a tu alcance.',
  member_has_responsibilities: 'El integrante tiene responsabilidades abiertas en el proyecto.',
  invalid_transition: 'Ese cambio de estado no está permitido.',
  note_required: 'Escribe un comentario para completar, cancelar o reabrir el hito.',
  reason_required: 'Escribe el motivo de la reprogramación: la fecha está comprometida en la línea base.',
  invalid_completion_date: 'La fecha de cumplimiento no puede ser futura.',
  invalid_effective_date: 'La fecha efectiva no puede ser futura.',
  already_superseded: 'Esa observación ya fue corregida. Corrige la más reciente.',
  due_date_in_past: 'La próxima fecha de revisión no puede ser anterior a hoy.',
  project_not_active: 'El proyecto está pausado o cerrado; no admite revisiones mientras siga así.',
  review_already_submitted: 'Este ciclo ya tiene una revisión enviada.',
  cycle_not_started: 'Este ciclo aún no comienza; se podrá revisar a partir de su fecha de inicio.',
  support_required: 'Escribe el soporte de la revisión: qué respalda lo que reportas.',
  finance_rejected: 'No se pudieron registrar el costo y el esfuerzo. Revisa las cifras.',
  holiday_taken: 'Ese día ya está registrado como festivo.',
  climate_required: 'Indica el clima del cliente.',
  nothing_changed_blocked: 'No puedes enviar "nada cambió" mientras haya alertas críticas sin causa y plan.',
  stale_review: 'El PM envió una versión más reciente; revisa esa.',
  validation_not_required: 'Este ciclo no exige validación del líder.',
  change_required: 'Para replanificar, elige la propuesta de cambio que mueve la fecha.',
  response_not_expected: 'Esta alerta no requiere causa y plan, o ya está resuelta.',
  response_already_submitted: 'Ya hay una respuesta en espera de validación o validada.',
  status_justification_required: 'El proyecto lleva un mes o más pausado o cerrado. Describe el motivo de la situación antes de continuar.',
  justification_not_required: 'No hay una justificación pendiente.',
  empty_evidence: 'Escribe un texto o elige un archivo.',
  file_type_not_allowed: 'Tipo de archivo no aceptado. Se admiten PNG, JPEG, WebP, PDF, Word, Excel y PowerPoint actuales, sin macros.',
  file_too_large: 'El archivo supera el límite de 10 MB.',
  already_withdrawn: 'Esta evidencia ya había sido retirada.',
  baseline_required: 'El proyecto necesita una línea base antes de proponer cambios.',
  invalid_impact: 'El impacto no es aplicable: indica al menos un cambio, solo hitos abiertos de la línea base, fechas posteriores al inicio e importes que no queden negativos.',
  already_decided: 'Este cambio ya tiene una decisión.',
  baseline_changed: 'La línea base cambió desde que se propuso este cambio. Recházalo y pide una propuesta nueva sobre la versión vigente.',
  baseline_exists: 'El proyecto ya tiene línea base. Los compromisos se cambian mediante un cambio aprobado.',
  email_taken: 'Ya existe un usuario con ese correo.',
  code_taken: 'Ya existe un registro con ese código o nombre.',
  last_admin: 'No se puede dejar el sistema sin un administrador activo.',
  invalid_request: 'Revisa los datos capturados.',
  password_change_required: 'Debes cambiar tu contraseña antes de continuar.',
  network_error: 'No se pudo contactar al servidor. Revisa tu conexión e inténtalo de nuevo.',
  identity_unavailable: 'El servicio de identidad no está disponible. Inténtalo de nuevo en unos minutos.',
};

export function errorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'unexpected_error';
  return MESSAGES[code] ?? 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}
