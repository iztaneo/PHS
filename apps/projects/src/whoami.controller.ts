import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { InternalAuthGuard, type AuthenticatedRequest } from './internal-auth.guard.js';

// Shows the identity this service received from the gateway; replaced by real endpoints in PHS-009.
@Controller('whoami')
@UseGuards(InternalAuthGuard)
export class WhoamiController {
  @Get()
  whoami(@Req() request: AuthenticatedRequest): { service: string; userId: string; requestId: string } {
    return { service: 'projects', userId: request.internal.userId, requestId: request.internal.requestId };
  }
}
