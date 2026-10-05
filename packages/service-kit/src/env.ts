import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Loads the repository's .env (if present) by walking up from the working directory.
export function loadEnv(startDir: string = process.cwd()): void {
  let dir = startDir;
  for (;;) {
    const file = join(dir, '.env');
    if (existsSync(file)) {
      process.loadEnvFile(file);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function portFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port in ${name}: ${raw}`);
  }
  return port;
}

// Where a service listens. By default only on this machine: the services trust the gateway and
// must not be reachable from anywhere else. In containers each service has its own network
// namespace, so LISTEN_HOST=0.0.0.0 is needed and the isolation comes from not publishing the port.
export function hostFromEnv(): string {
  return process.env.LISTEN_HOST?.trim() || '127.0.0.1';
}
