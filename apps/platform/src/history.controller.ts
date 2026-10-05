import { BadRequestException, Controller, Get, Headers, Inject, NotFoundException, Query, Req, UseGuards } from '@nestjs/common';
import { historyQuery, timelineQuery } from '@phs/contracts';
import { INTERNAL_AUTH_HEADER } from '@phs/service-kit';
import type { z } from 'zod';
import { HistoryService, type HistoryPage, type TimelineView } from './history.service.js';
import { InternalAuthGuard, type AuthenticatedRequest } from './internal-auth.guard.js';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code: 'invalid_request' });
  return result.data;
}

@Controller('history')
@UseGuards(InternalAuthGuard)
export class HistoryController {
  constructor(@Inject(HistoryService) private readonly service: HistoryService) {}

  // Same 404 for "does not exist" and "not yours".
  @Get()
  async history(@Query() query: unknown, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest): Promise<HistoryPage> {
    const { projectId, ...rest } = parse(historyQuery, query);
    const page = await this.service.history({ userId: request.internal.userId, identity }, projectId, rest);
    if (!page) throw new NotFoundException({ code: 'not_found' });
    return page;
  }

  @Get('timeline')
  async timeline(@Query() query: unknown, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest): Promise<TimelineView> {
    const view = await this.service.timeline({ userId: request.internal.userId, identity }, parse(timelineQuery, query).projectId);
    if (!view) throw new NotFoundException({ code: 'not_found' });
    return view;
  }
}
