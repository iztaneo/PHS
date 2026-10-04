import { Injectable } from '@nestjs/common';
import { INTERNAL_AUTH_HEADER, internalAuthSecret, signInternalToken } from '@phs/service-kit';
import { identityUrl } from './routes.js';

export interface SessionUser {
  id: string;
  displayName: string;
  email: string;
  mustChangePassword: boolean;
  isAdmin: boolean;
  memberships: { practiceId: string; practiceName: string; role: 'pm' | 'lead' | 'director' }[];
}

export interface SessionInfo {
  sessionId: string;
  expiresAt: string;
  user: SessionUser;
}

export interface IdentityResponse<T> {
  status: number;
  body: T | { code?: string };
}

@Injectable()
export class IdentityClient {
  private readonly baseUrl = identityUrl();
  private readonly secret = internalAuthSecret();

  async post<T>(path: string, requestId: string, body: unknown): Promise<IdentityResponse<T>> {
    const token = signInternalToken({ requestId, userId: null, sessionId: null }, this.secret);
    const response = await fetch(new URL(path, this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', [INTERNAL_AUTH_HEADER]: token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as T) : {} };
  }

  async introspect(sessionToken: string, requestId: string): Promise<SessionInfo | null> {
    const result = await this.post<SessionInfo>('/sessions/introspect', requestId, { token: sessionToken });
    return result.status === 200 ? (result.body as SessionInfo) : null;
  }

  signFor(session: SessionInfo, requestId: string): string {
    return signInternalToken({ requestId, userId: session.user.id, sessionId: session.sessionId }, this.secret);
  }
}
