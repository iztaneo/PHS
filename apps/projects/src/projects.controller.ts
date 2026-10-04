import { Controller, Get, Inject, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { InternalAuthGuard, type AuthenticatedRequest } from './internal-auth.guard.js';
import { ProjectsService, type ProjectSummary } from './projects.service.js';

@Controller('projects')
@UseGuards(InternalAuthGuard)
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest): Promise<ProjectSummary[]> {
    return this.projects.list(request.internal.userId);
  }

  // Same 404 for "does not exist" and "not yours", so the response does not reveal other projects.
  @Get(':id')
  async get(@Param('id') id: string, @Req() request: AuthenticatedRequest): Promise<ProjectSummary> {
    const parsed = z.uuid().safeParse(id);
    const project = parsed.success ? await this.projects.get(request.internal.userId, parsed.data) : null;
    if (!project) throw new NotFoundException({ code: 'not_found' });
    return project;
  }
}
