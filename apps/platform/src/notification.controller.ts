import { Controller, Get, Headers, HttpCode, Inject, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { INTERNAL_AUTH_HEADER } from '@phs/service-kit';
import { z } from 'zod';
import { InternalAuthGuard, type AuthenticatedRequest } from './internal-auth.guard.js';
import { NotificationService, type Inbox } from './notification.service.js';

@Controller('notifications')
@UseGuards(InternalAuthGuard)
export class NotificationController {
  constructor(@Inject(NotificationService) private readonly notifications: NotificationService) {}

  @Get()
  inbox(@Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest): Promise<Inbox> {
    return this.notifications.inbox({ userId: request.internal.userId, identity });
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest): Promise<Inbox> {
    const actor = { userId: request.internal.userId, identity };
    await this.notifications.markRead(actor, 'all');
    return this.notifications.inbox(actor);
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@Param('id') id: string, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest): Promise<Inbox> {
    const actor = { userId: request.internal.userId, identity };
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success || !(await this.notifications.markRead(actor, parsed.data))) throw new NotFoundException({ code: 'not_found' });
    return this.notifications.inbox(actor);
  }
}
