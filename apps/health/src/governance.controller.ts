import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Headers, HttpCode, Inject,
  NotFoundException, Param, Post, Req, UseGuards,
} from '@nestjs/common';
import {
  IDEMPOTENCY_HEADER, createResponseBody, createTaskBody, idempotencyKey, transitionTaskBody, validateResponseBody,
} from '@phs/contracts';
import { INTERNAL_AUTH_HEADER } from '@phs/service-kit';
import { z } from 'zod';
import { GovernanceError, GovernanceService, type Actor } from './governance.service.js';
import { InternalAuthGuard, type AuthenticatedRequest } from './internal-auth.guard.js';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code: 'invalid_request' });
  return result.data;
}
function uuid(value: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new NotFoundException({ code: 'not_found' });
  return parsed.data;
}
async function run<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (!(error instanceof GovernanceError)) throw error;
    const body = { code: error.code, ...(error.currentRevision ? { currentRevision: error.currentRevision } : {}) };
    switch (error.code) {
      case 'not_found': throw new NotFoundException(body);
      case 'forbidden': throw new ForbiddenException(body);
      case 'change_required': case 'responsible_not_enabled': case 'note_required': throw new BadRequestException(body);
      default: throw new ConflictException(body);
    }
  }
}

@Controller()
@UseGuards(InternalAuthGuard)
export class GovernanceController {
  constructor(@Inject(GovernanceService) private readonly governance: GovernanceService) {}

  private actor(request: AuthenticatedRequest, identity: string): Actor {
    return { userId: request.internal.userId, requestId: request.internal.requestId, identity };
  }

  @Get('projects/:projectId/events')
  events(@Param('projectId') projectId: string, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest) {
    return run(this.governance.events(this.actor(request, identity), uuid(projectId)));
  }

  @Post('events/:eventId/responses')
  @HttpCode(201)
  respond(@Param('eventId') eventId: string, @Body() body: unknown, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest) {
    return run(this.governance.respond(this.actor(request, identity), uuid(eventId), parse(createResponseBody, body)));
  }

  @Post('responses/:responseId/validation')
  @HttpCode(201)
  validate(@Param('responseId') responseId: string, @Body() body: unknown, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest) {
    return run(this.governance.validate(this.actor(request, identity), uuid(responseId), parse(validateResponseBody, body)));
  }

  @Get('projects/:projectId/tasks')
  tasks(@Param('projectId') projectId: string, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest) {
    return run(this.governance.tasks(this.actor(request, identity), uuid(projectId)));
  }

  @Post('projects/:projectId/tasks')
  @HttpCode(201)
  createTask(
    @Param('projectId') projectId: string, @Body() body: unknown, @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest,
  ) {
    const parsedKey = idempotencyKey.safeParse(key);
    if (!parsedKey.success) throw new BadRequestException({ code: 'idempotency_key_required' });
    return run(this.governance.createTask(this.actor(request, identity), uuid(projectId), parse(createTaskBody, body), parsedKey.data));
  }

  @Get('tasks/mine')
  mine(@Req() request: AuthenticatedRequest) {
    return this.governance.mine(request.internal.userId);
  }

  @Post('tasks/:taskId/transition')
  @HttpCode(200)
  transition(@Param('taskId') taskId: string, @Body() body: unknown, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest) {
    return run(this.governance.transitionTask(this.actor(request, identity), uuid(taskId), parse(transitionTaskBody, body)));
  }
}
