import { Controller, Get, Headers, Inject, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { INTERNAL_AUTH_HEADER } from '@phs/service-kit';
import { z } from 'zod';
import { AssessmentsService, type AssessmentView, type OutlookView } from './assessments.service.js';
import { InternalAuthGuard, type AuthenticatedRequest } from './internal-auth.guard.js';

@Controller('assessments')
@UseGuards(InternalAuthGuard)
export class AssessmentsController {
  constructor(@Inject(AssessmentsService) private readonly assessments: AssessmentsService) {}

  // Same 404 for "does not exist" and "not yours".
  @Get(':projectId')
  async current(
    @Param('projectId') projectId: string, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest,
  ): Promise<AssessmentView> {
    const parsed = z.uuid().safeParse(projectId);
    const view = parsed.success ? await this.assessments.current(request.internal.userId, identity, parsed.data) : null;
    if (!view) throw new NotFoundException({ code: 'not_found' });
    return view;
  }

  @Get(':projectId/outlook')
  async outlook(@Param('projectId') projectId: string, @Headers(INTERNAL_AUTH_HEADER) identity: string): Promise<OutlookView> {
    const parsed = z.uuid().safeParse(projectId);
    const view = parsed.success ? await this.assessments.outlook(identity, parsed.data) : null;
    if (!view) throw new NotFoundException({ code: 'not_found' });
    return view;
  }
}
