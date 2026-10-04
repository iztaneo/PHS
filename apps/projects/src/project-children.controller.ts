import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Headers, HttpCode,
  Inject, NotFoundException, Param, Patch, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import {
  IDEMPOTENCY_HEADER, changeStatusBody, createChangeBody, createRenewalBody, justifyStatusBody, renewalOutcomeBody, createMilestoneBody, decideChangeBody, createObservationBody, createRiskBody, financeQuery, followUpRiskBody,
  idempotencyKey, publishBaselineBody, putMemberBody, removeMemberQuery, transitionMilestoneBody, updateMilestoneBody,
} from '@phs/contracts';
import { z } from 'zod';
import { BaselinesService } from './baselines.service.js';
import { ChangesService } from './changes.service.js';
import { FinanceService } from './finance.service.js';
import { InternalAuthGuard, type AuthenticatedRequest } from './internal-auth.guard.js';
import { MilestonesService } from './milestones.service.js';
import { ProjectError, type Actor } from './projects.service.js';
import { RisksService } from './risks.service.js';
import { StatusService } from './status.service.js';
import { TeamService } from './team.service.js';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code: 'invalid_request' });
  return result.data;
}

// An id that is not a UUID cannot exist: same 404 as a project out of scope.
function uuid(value: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new NotFoundException({ code: 'not_found' });
  return parsed.data;
}

function key(value: string | undefined): string {
  const parsed = idempotencyKey.safeParse(value);
  if (!parsed.success) throw new BadRequestException({ code: 'idempotency_key_required' });
  return parsed.data;
}

function actor(request: AuthenticatedRequest): Actor {
  return { userId: request.internal.userId, requestId: request.internal.requestId };
}

export async function runProjectCommand<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (!(error instanceof ProjectError)) throw error;
    const body = { code: error.code, ...(error.currentRevision ? { currentRevision: error.currentRevision } : {}), ...error.details };
    switch (error.code) {
      case 'not_found': throw new NotFoundException(body);
      case 'forbidden': case 'practice_not_authorized': throw new ForbiddenException(body);
      case 'code_taken': case 'revision_conflict': case 'baseline_change_required': case 'idempotency_key_reused':
      case 'member_has_responsibilities': case 'invalid_transition': case 'baseline_exists': case 'already_superseded':
      case 'baseline_required': case 'already_decided': case 'baseline_changed':
      case 'status_justification_required': case 'justification_not_required':
        throw new ConflictException(body);
      default: throw new BadRequestException(body);
    }
  }
}

@Controller('projects/:id')
@UseGuards(InternalAuthGuard)
export class ProjectChildrenController {
  constructor(
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(MilestonesService) private readonly milestones: MilestonesService,
    @Inject(BaselinesService) private readonly baselines: BaselinesService,
    @Inject(FinanceService) private readonly finance: FinanceService,
    @Inject(RisksService) private readonly risks: RisksService,
    @Inject(ChangesService) private readonly changes: ChangesService,
    @Inject(StatusService) private readonly status: StatusService,
  ) {}

  @Get('members')
  members(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.team.list(request.internal.userId, uuid(id)));
  }

  @Put('members/:userId')
  putMember(@Param('id') id: string, @Param('userId') userId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.team.put(actor(request), uuid(id), uuid(userId), parse(putMemberBody, body)));
  }

  @Delete('members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string, @Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const keep = parse(removeMemberQuery, query).keepResponsibilities === 'true';
    return runProjectCommand(this.team.remove(actor(request), uuid(id), uuid(userId), keep));
  }

  @Get('milestones')
  listMilestones(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.milestones.list(request.internal.userId, uuid(id)));
  }

  @Post('milestones')
  @HttpCode(201)
  createMilestone(
    @Param('id') id: string, @Body() body: unknown, @Headers(IDEMPOTENCY_HEADER) idempotency: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return runProjectCommand(this.milestones.create(actor(request), uuid(id), parse(createMilestoneBody, body), key(idempotency)));
  }

  @Patch('milestones/:milestoneId')
  updateMilestone(@Param('id') id: string, @Param('milestoneId') milestoneId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.milestones.update(actor(request), uuid(id), uuid(milestoneId), parse(updateMilestoneBody, body)));
  }

  @Post('milestones/:milestoneId/transition')
  @HttpCode(200)
  transitionMilestone(@Param('id') id: string, @Param('milestoneId') milestoneId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.milestones.transition(actor(request), uuid(id), uuid(milestoneId), parse(transitionMilestoneBody, body)));
  }

  @Get('baselines')
  listBaselines(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.baselines.list(request.internal.userId, uuid(id)));
  }

  @Post('baselines')
  @HttpCode(201)
  publishBaseline(
    @Param('id') id: string, @Body() body: unknown, @Headers(IDEMPOTENCY_HEADER) idempotency: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return runProjectCommand(this.baselines.publishInitial(actor(request), uuid(id), parse(publishBaselineBody, body), key(idempotency)));
  }

  @Get('finance')
  financeSummary(@Param('id') id: string, @Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.finance.summary(request.internal.userId, uuid(id), parse(financeQuery, query).asOf));
  }

  @Post('finance')
  @HttpCode(201)
  recordObservation(
    @Param('id') id: string, @Body() body: unknown, @Headers(IDEMPOTENCY_HEADER) idempotency: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return runProjectCommand(this.finance.record(actor(request), uuid(id), parse(createObservationBody, body), key(idempotency)));
  }

  @Get('risks')
  listRisks(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.risks.list(request.internal.userId, uuid(id)));
  }

  @Post('risks')
  @HttpCode(201)
  createRisk(
    @Param('id') id: string, @Body() body: unknown, @Headers(IDEMPOTENCY_HEADER) idempotency: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return runProjectCommand(this.risks.create(actor(request), uuid(id), parse(createRiskBody, body), key(idempotency)));
  }

  @Patch('risks/:riskId')
  followUpRisk(@Param('id') id: string, @Param('riskId') riskId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.risks.followUp(actor(request), uuid(id), uuid(riskId), parse(followUpRiskBody, body)));
  }

  @Get('risks/:riskId/history')
  riskHistory(@Param('id') id: string, @Param('riskId') riskId: string, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.risks.history(request.internal.userId, uuid(id), uuid(riskId)));
  }

  @Get('changes')
  listChanges(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.changes.list(request.internal.userId, uuid(id)));
  }

  @Post('changes')
  @HttpCode(201)
  proposeChange(
    @Param('id') id: string, @Body() body: unknown, @Headers(IDEMPOTENCY_HEADER) idempotency: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return runProjectCommand(this.changes.propose(actor(request), uuid(id), parse(createChangeBody, body), key(idempotency)));
  }

  @Post('changes/:changeId/decision')
  @HttpCode(201)
  decideChange(
    @Param('id') id: string, @Param('changeId') changeId: string, @Body() body: unknown,
    @Headers(IDEMPOTENCY_HEADER) idempotency: string | undefined, @Req() request: AuthenticatedRequest,
  ) {
    return runProjectCommand(this.changes.decide(actor(request), uuid(id), uuid(changeId), parse(decideChangeBody, body), key(idempotency)));
  }

  @Get('status')
  getStatus(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.status.get(request.internal.userId, uuid(id)));
  }

  @Post('status')
  @HttpCode(200)
  changeStatus(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.status.change(actor(request), uuid(id), parse(changeStatusBody, body)));
  }

  @Post('status/justification')
  @HttpCode(200)
  justifyStatus(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.status.justify(actor(request), uuid(id), parse(justifyStatusBody, body).reason));
  }

  @Get('renewals')
  listRenewals(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.status.listRenewals(request.internal.userId, uuid(id)));
  }

  @Post('renewals')
  @HttpCode(201)
  createRenewal(
    @Param('id') id: string, @Body() body: unknown, @Headers(IDEMPOTENCY_HEADER) idempotency: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return runProjectCommand(this.status.createRenewal(actor(request), uuid(id), parse(createRenewalBody, body), key(idempotency)));
  }

  @Post('renewals/:renewalId/outcome')
  @HttpCode(200)
  decideRenewal(@Param('id') id: string, @Param('renewalId') renewalId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return runProjectCommand(this.status.decideRenewal(actor(request), uuid(id), uuid(renewalId), parse(renewalOutcomeBody, body)));
  }
}
