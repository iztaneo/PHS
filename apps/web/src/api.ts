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
  startsOn: string;
  endsOn: string;
}

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
  ) {
    super(code);
  }
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
    const failure = data as { code?: string; currentRevision?: number } | undefined;
    throw new ApiError(response.status, failure?.code ?? 'unexpected_error', failure?.currentRevision);
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
  not_found: 'El proyecto no existe o no está a tu alcance.',
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
