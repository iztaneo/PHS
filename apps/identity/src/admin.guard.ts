import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PG_POOL, loadAccess } from '@phs/service-kit';
import type pg from 'pg';
import type { InternalRequest } from './internal-auth.guard.js';

// Runs after InternalAuthGuard. Reads the flag from the database on every request,
// so removing the administrator capability takes effect immediately.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<InternalRequest>();
    const userId = request.internal?.userId;
    const access = userId ? await loadAccess(this.pool, userId) : null;
    if (!access?.active || !access.isAdmin) throw new ForbiddenException({ code: 'forbidden' });
    return true;
  }
}
