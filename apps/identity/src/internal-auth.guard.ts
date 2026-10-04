import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { INTERNAL_AUTH_HEADER, internalAuthSecret, verifyInternalToken, type InternalIdentity } from '@phs/service-kit';
import type { Request } from 'express';

export type InternalRequest = Request & { internal: InternalIdentity };

// Only the gateway holds the secret, so only it can call this service.
@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly secret = internalAuthSecret();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<InternalRequest>();
    const identity = verifyInternalToken(request.header(INTERNAL_AUTH_HEADER), this.secret);
    if (!identity) throw new UnauthorizedException({ code: 'internal_auth_required' });
    request.internal = identity;
    return true;
  }
}
