import { INTERNAL_AUTH_HEADER } from '@phs/service-kit';
import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE, readCookie, requestId } from './http.js';
import type { IdentityClient } from './identity.client.js';

// Runs before every proxied route: validates the session with Identity and replaces whatever the
// browser sent with an identity signed by the gateway. The session cookie is not forwarded.
export function authenticate(identity: IdentityClient) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    delete request.headers[INTERNAL_AUTH_HEADER];
    try {
      const token = readCookie(request.headers.cookie, SESSION_COOKIE);
      const session = token ? await identity.introspect(token, requestId(request)) : null;
      if (!session) {
        response.status(401).json({ code: 'authentication_required' });
        return;
      }
      if (session.user.mustChangePassword) {
        response.status(403).json({ code: 'password_change_required' });
        return;
      }
      delete request.headers.cookie;
      request.headers[INTERNAL_AUTH_HEADER] = identity.signFor(session, requestId(request));
      next();
    } catch {
      response.status(502).json({ code: 'identity_unavailable' });
    }
  };
}
