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

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  status: string;
  practiceName: string;
  clientName: string;
  capabilities: { view: boolean; editOperation: boolean; proposeAndReview: boolean; decide: boolean; seeFinancials: boolean };
}

export interface ServiceStatus {
  service: string;
  status: 'ok' | 'degraded' | 'unreachable';
  database?: 'ok' | 'down';
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
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
    throw new ApiError(response.status, (data as { code?: string } | undefined)?.code ?? 'unexpected_error');
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
  projects: () => call<ProjectSummary[]>('GET', '/api/v1/projects'),
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
