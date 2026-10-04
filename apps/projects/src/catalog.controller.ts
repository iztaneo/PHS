import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject, NotFoundException,
  Param, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CatalogService, type CatalogResult, type ServiceType } from './catalog.service.js';
import { InternalAuthGuard, type AuthenticatedRequest } from './internal-auth.guard.js';

const createBody = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/),
  name: z.string().trim().min(1).max(120),
});
const updateBody = z.object({ active: z.boolean() });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code: 'invalid_request' });
  return result.data;
}

function unwrap(result: CatalogResult): ServiceType {
  if (result === 'forbidden') throw new ForbiddenException({ code: 'forbidden' });
  if (result === 'not_found') throw new NotFoundException({ code: 'not_found' });
  if (result === 'taken') throw new ConflictException({ code: 'code_taken' });
  return result;
}

@Controller('catalog/service-types')
@UseGuards(InternalAuthGuard)
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get()
  list(): Promise<ServiceType[]> {
    return this.catalog.list();
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<ServiceType> {
    const { userId, requestId } = request.internal;
    return unwrap(await this.catalog.create(userId, requestId, parse(createBody, body)));
  }

  @Patch(':code')
  async update(@Param('code') code: string, @Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<ServiceType> {
    const { userId, requestId } = request.internal;
    return unwrap(await this.catalog.setActive(userId, requestId, code, parse(updateBody, body).active));
  }
}
