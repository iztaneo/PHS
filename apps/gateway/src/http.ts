import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export const SESSION_COOKIE = 'phs_session';
export const REQUEST_ID_HEADER = 'x-request-id';

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

export function cookieSecure(): boolean {
  // Secure unless explicitly disabled for local http development.
  return process.env.COOKIE_SECURE !== 'false';
}

export function allowedOrigins(): string[] {
  return (process.env.WEB_ORIGIN ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
}

export function requestId(request: Request): string {
  return request.headers[REQUEST_ID_HEADER] as string;
}

// The gateway assigns the request id; a value sent by the client is discarded.
export function assignRequestId(request: Request, response: Response, next: NextFunction): void {
  const id = randomUUID();
  request.headers[REQUEST_ID_HEADER] = id;
  response.setHeader(REQUEST_ID_HEADER, id);
  next();
}

// CSRF defence in addition to SameSite cookies: a browser always sends Origin on unsafe cross-site requests.
export function checkOrigin(origins: string[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.headers.origin;
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (unsafe && origin !== undefined && !origins.includes(origin)) {
      response.status(403).json({ code: 'origin_not_allowed' });
      return;
    }
    next();
  };
}
