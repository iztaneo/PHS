export interface SessionUser {
  id: string;
  displayName: string;
  email: string;
  mustChangePassword: boolean;
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
  whoami: () => call<{ userId: string; requestId: string }>('GET', '/api/v1/projects/whoami'),
};

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos, o la cuenta está bloqueada temporalmente.',
  invalid_current_password: 'La contraseña actual no es correcta.',
  weak_password: 'La nueva contraseña debe tener entre 12 y 128 caracteres y ser distinta de la actual.',
  authentication_required: 'Tu sesión terminó. Inicia sesión de nuevo.',
  network_error: 'No se pudo contactar al servidor. Revisa tu conexión e inténtalo de nuevo.',
  identity_unavailable: 'El servicio de identidad no está disponible. Inténtalo de nuevo en unos minutos.',
};

export function errorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'unexpected_error';
  return MESSAGES[code] ?? 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}
