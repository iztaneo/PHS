import { createHmac, timingSafeEqual } from 'node:crypto';
import { requireEnv } from './env.js';

export const INTERNAL_AUTH_HEADER = 'x-phs-internal-auth';

// Identity the gateway vouches for. userId is null for calls made before a session exists (login).
export interface InternalIdentity {
  requestId: string;
  userId: string | null;
  sessionId: string | null;
}

interface TokenPayload extends InternalIdentity {
  exp: number;
}

function signature(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

export function internalAuthSecret(): string {
  const secret = requireEnv('INTERNAL_AUTH_SECRET');
  if (secret.length < 32) throw new Error('INTERNAL_AUTH_SECRET must have at least 32 characters');
  return secret;
}

export function signInternalToken(
  identity: InternalIdentity,
  secret: string,
  ttlSeconds = 60,
  now: number = Date.now(),
): string {
  const payload: TokenPayload = { ...identity, exp: Math.floor(now / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signature(body, secret).toString('base64url')}`;
}

export function verifyInternalToken(
  token: string | undefined,
  secret: string,
  now: number = Date.now(),
): InternalIdentity | null {
  if (!token) return null;
  const [body, sent, extra] = token.split('.');
  if (!body || !sent || extra !== undefined) return null;
  const expected = signature(body, secret);
  const received = Buffer.from(sent, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null;
    if (typeof payload.requestId !== 'string') return null;
    return { requestId: payload.requestId, userId: payload.userId ?? null, sessionId: payload.sessionId ?? null };
  } catch {
    return null;
  }
}
