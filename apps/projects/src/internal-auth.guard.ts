import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { INTERNAL_AUTH_HEADER, internalAuthSecret, verifyInternalToken, type InternalIdentity } from '@phs/service-kit';
import type { Request } from 'express';

export type AuthenticatedRequest = Request & { internal: InternalIdentity & { userId: string } };

// Accepts only requests the gateway signed on behalf of an authenticated user.
@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly secret = internalAuthSecret();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const identity = verifyInternalToken(request.header(INTERNAL_AUTH_HEADER), this.secret);
    if (!identity || !identity.userId) throw new UnauthorizedException({ code: 'authentication_required' });
    request.internal = { ...identity, userId: identity.userId };
    return true;
  }
}
