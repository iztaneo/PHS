export interface AuthConfig {
  sessionTtlMinutes: number;
  sessionIdleMinutes: number;
  maxFailedAttempts: number;
  lockMinutes: number;
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid value in ${name}: ${raw}`);
  return value;
}

export function authConfig(): AuthConfig {
  return {
    sessionTtlMinutes: positiveInt('SESSION_TTL_MINUTES', 12 * 60),
    sessionIdleMinutes: positiveInt('SESSION_IDLE_MINUTES', 60),
    maxFailedAttempts: positiveInt('LOGIN_MAX_FAILED_ATTEMPTS', 5),
    lockMinutes: positiveInt('LOGIN_LOCK_MINUTES', 15),
  };
}

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
