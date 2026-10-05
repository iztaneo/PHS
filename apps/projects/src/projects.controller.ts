import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, NotFoundException, Param, Patch, Post,
  Query, Req, UseGuards,
} from '@nestjs/common';
import { IDEMPOTENCY_HEADER, createProjectBody, idempotencyKey, listProjectsQuery, updateProjectBody } from '@phs/contracts';
import { z } from 'zod';
import { InternalAuthGuard, type AuthenticatedRequest } from './internal-auth.guard.js';
import { runProjectCommand } from './project-children.controller.js';
import { ProjectsService, type Actor, type ProjectDetail, type ProjectPage } from './projects.service.js';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code: 'invalid_request' });
  return result.data;
}

function actor(request: AuthenticatedRequest): Actor {
  return { userId: request.internal.userId, requestId: request.internal.requestId };
}

const run = runProjectCommand;

@Controller()
@UseGuards(InternalAuthGuard)
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get('projects')
  list(@Query() query: unknown, @Req() request: AuthenticatedRequest): Promise<ProjectPage> {
    return this.projects.list(request.internal.userId, parse(listProjectsQuery, query));
  }

  @Post('projects')
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ProjectDetail> {
    const parsedKey = idempotencyKey.safeParse(key);
    if (!parsedKey.success) throw new BadRequestException({ code: 'idempotency_key_required' });
    return (await run(this.projects.create(actor(request), parse(createProjectBody, body), parsedKey.data))).project;
  }

  // Same 404 for "does not exist" and "not yours", so the response does not reveal other projects.
  @Get('projects/:id')
  async get(@Param('id') id: string, @Req() request: AuthenticatedRequest): Promise<ProjectDetail> {
    const parsed = z.uuid().safeParse(id);
    const project = parsed.success ? await this.projects.get(request.internal.userId, parsed.data) : null;
    if (!project) throw new NotFoundException({ code: 'not_found' });
    return project;
  }

  @Patch('projects/:id')
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<ProjectDetail> {
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) throw new NotFoundException({ code: 'not_found' });
    return run(this.projects.update(actor(request), parsed.data, parse(updateProjectBody, body)));
  }

  @Get('reports/inactive-projects')
  inactive(@Req() request: AuthenticatedRequest) {
    return this.projects.inactive(request.internal.userId);
  }

  @Get('clients')
  clients(@Req() request: AuthenticatedRequest) {
    return this.projects.clients(request.internal.userId);
  }

  @Get('people')
  people(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const { practiceId } = parse(z.object({ practiceId: z.uuid() }), query);
    return run(this.projects.people(request.internal.userId, practiceId));
  }
}
