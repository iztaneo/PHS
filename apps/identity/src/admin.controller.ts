import {
  BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, Patch, Post,
  Put, Req, UseGuards,
} from '@nestjs/common';
import { createPracticeBody, createUserBody, membershipBody, updateUserBody } from '@phs/contracts';
import { z } from 'zod';
import { AdminGuard } from './admin.guard.js';
import { AdminError, AdminService, type Actor } from './admin.service.js';
import { InternalAuthGuard, type InternalRequest } from './internal-auth.guard.js';

const practiceBody = createPracticeBody;
const idParam = z.uuid();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code: 'invalid_request' });
  return result.data;
}

function actor(request: InternalRequest): Actor {
  return { userId: request.internal.userId!, requestId: request.internal.requestId };
}

async function run<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (!(error instanceof AdminError)) throw error;
    if (error.code === 'not_found') throw new NotFoundException({ code: error.code });
    if (error.code === 'invalid_timezone') throw new BadRequestException({ code: error.code });
    throw new ConflictException({ code: error.code });
  }
}

@Controller('admin')
@UseGuards(InternalAuthGuard, AdminGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get('users')
  listUsers() {
    return this.admin.listUsers();
  }

  @Post('users')
  createUser(@Body() body: unknown, @Req() request: InternalRequest) {
    return run(this.admin.createUser(actor(request), parse(createUserBody, body)));
  }

  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() body: unknown, @Req() request: InternalRequest) {
    return run(this.admin.updateUser(actor(request), parse(idParam, id), parse(updateUserBody, body)));
  }

  @Post('users/:id/reset-password')
  resetPassword(@Param('id') id: string, @Req() request: InternalRequest) {
    return run(this.admin.resetPassword(actor(request), parse(idParam, id)));
  }

  @Get('practices')
  listPractices() {
    return this.admin.listPractices();
  }

  @Post('practices')
  createPractice(@Body() body: unknown, @Req() request: InternalRequest) {
    return run(this.admin.createPractice(actor(request), parse(practiceBody, body)));
  }

  @Put('memberships')
  setMembership(@Body() body: unknown, @Req() request: InternalRequest) {
    const input = parse(membershipBody, body);
    return run(this.admin.setMembership(actor(request), input.userId, input.practiceId, input.role, input.granted));
  }
}
