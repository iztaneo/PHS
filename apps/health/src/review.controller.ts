import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Headers, HttpCode, Inject,
  Delete, NotFoundException, Param, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import {
  IDEMPOTENCY_HEADER, addHolidayBody, holidayQuery, idempotencyKey, saveDraftBody, savePolicyBody, submitReviewBody, validateReviewBody,
} from '@phs/contracts';
import { INTERNAL_AUTH_HEADER } from '@phs/service-kit';
import { z } from 'zod';
import type { Actor } from './governance.service.js';
import { HolidayService, type HolidayResult } from './holiday.service.js';
import { InternalAuthGuard, type AuthenticatedRequest } from './internal-auth.guard.js';
import { ReviewError, ReviewService } from './review.service.js';
import { SchedulerService } from './scheduler.service.js';

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
    if (!(error instanceof ReviewError)) throw error;
    const body = { code: error.code, ...(error.currentRevision !== undefined ? { currentRevision: error.currentRevision } : {}) };
    switch (error.code) {
      case 'not_found': throw new NotFoundException(body);
      case 'forbidden': throw new ForbiddenException(body);
      case 'due_date_in_past': case 'support_required': case 'finance_rejected': case 'climate_required': case 'invalid_request':
        throw new BadRequestException(body);
      default: throw new ConflictException(body);
    }
  }
}

@Controller()
@UseGuards(InternalAuthGuard)
export class ReviewController {
  constructor(
    @Inject(ReviewService) private readonly reviews: ReviewService,
    @Inject(HolidayService) private readonly holidays: HolidayService,
    @Inject(SchedulerService) private readonly scheduler: SchedulerService,
  ) {}

  private actor(request: AuthenticatedRequest, identity: string): Actor {
    return { userId: request.internal.userId, requestId: request.internal.requestId, identity };
  }

  @Get('projects/:projectId/review-schedule')
  schedule(@Param('projectId') projectId: string, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest) {
    return run(this.reviews.schedule(this.actor(request, identity), uuid(projectId)));
  }

  @Put('projects/:projectId/review-policy')
  savePolicy(@Param('projectId') projectId: string, @Body() body: unknown, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest) {
    return run(this.reviews.savePolicy(this.actor(request, identity), uuid(projectId), parse(savePolicyBody, body)));
  }

  @Get('reviews/pending')
  pending(@Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest) {
    return run(this.reviews.pending(this.actor(request, identity)));
  }

  @Get('cycles/:cycleId')
  cycle(@Param('cycleId') cycleId: string, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest) {
    return run(this.reviews.cycle(this.actor(request, identity), uuid(cycleId)));
  }

  @Put('cycles/:cycleId/draft')
  saveDraft(@Param('cycleId') cycleId: string, @Body() body: unknown, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest) {
    return run(this.reviews.saveDraft(this.actor(request, identity), uuid(cycleId), parse(saveDraftBody, body)));
  }

  @Post('cycles/:cycleId/reviews')
  @HttpCode(201)
  submit(
    @Param('cycleId') cycleId: string, @Body() body: unknown, @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest,
  ) {
    const parsedKey = idempotencyKey.safeParse(key);
    if (!parsedKey.success) throw new BadRequestException({ code: 'idempotency_key_required' });
    return run(this.reviews.submit(this.actor(request, identity), uuid(cycleId), parse(submitReviewBody, body), parsedKey.data));
  }

  @Post('reviews/:reviewId/validation')
  @HttpCode(201)
  validate(@Param('reviewId') reviewId: string, @Body() body: unknown, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest) {
    return run(this.reviews.validate(this.actor(request, identity), uuid(reviewId), parse(validateReviewBody, body)));
  }

  @Get('scheduler')
  schedulerStatus() {
    return this.scheduler.status();
  }

  @Get('holidays')
  listHolidays(@Query() query: unknown) {
    return this.holidays.list(parse(holidayQuery, query).year);
  }

  @Post('holidays')
  @HttpCode(201)
  async addHoliday(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return holidayResult(await this.holidays.add(request.internal.userId, request.internal.requestId, parse(addHolidayBody, body)));
  }

  @Delete('holidays/:day')
  async removeHoliday(@Param('day') day: string, @Req() request: AuthenticatedRequest) {
    const parsed = z.iso.date().safeParse(day);
    if (!parsed.success) throw new NotFoundException({ code: 'not_found' });
    return holidayResult(await this.holidays.remove(request.internal.userId, request.internal.requestId, parsed.data));
  }
}

function holidayResult(result: HolidayResult) {
  if (result === 'forbidden') throw new ForbiddenException({ code: 'forbidden' });
  if (result === 'not_found') throw new NotFoundException({ code: 'not_found' });
  if (result === 'taken') throw new ConflictException({ code: 'holiday_taken' });
  return result;
}
