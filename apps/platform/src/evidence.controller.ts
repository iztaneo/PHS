import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Headers, HttpCode, Inject,
  NotFoundException, Param, PayloadTooLargeException, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { evidenceTargetQuery, withdrawEvidenceBody } from '@phs/contracts';
import { INTERNAL_AUTH_HEADER } from '@phs/service-kit';
import type { Response } from 'express';
import { z } from 'zod';
import { EvidenceError, EvidenceService, type Actor, type EvidenceView, type Target } from './evidence.service.js';
import { MAX_FILE_BYTES, isImage } from './file-type.js';
import { InternalAuthGuard, type AuthenticatedRequest } from './internal-auth.guard.js';

function target(value: unknown): Target {
  const parsed = evidenceTargetQuery.safeParse(value);
  if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
  return { projectId: parsed.data.projectId, kind: parsed.data.kind, id: parsed.data.targetId };
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
    if (!(error instanceof EvidenceError)) throw error;
    const body = { code: error.code };
    switch (error.code) {
      case 'not_found': throw new NotFoundException(body);
      case 'forbidden': throw new ForbiddenException(body);
      case 'already_withdrawn': throw new ConflictException(body);
      case 'file_too_large': throw new PayloadTooLargeException(body);
      default: throw new BadRequestException(body);
    }
  }
}

@Controller('evidence')
@UseGuards(InternalAuthGuard)
export class EvidenceController {
  constructor(@Inject(EvidenceService) private readonly evidence: EvidenceService) {}

  private actor(request: AuthenticatedRequest, identity: string): Actor {
    return { userId: request.internal.userId, requestId: request.internal.requestId, identity };
  }

  @Get()
  list(@Query() query: unknown, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest): Promise<EvidenceView[]> {
    return run(this.evidence.list(this.actor(request, identity), target(query)));
  }

  // multipart/form-data: projectId, kind, targetId, optional text and optional file.
  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  add(
    @Body() body: Record<string, unknown>, @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest,
  ): Promise<EvidenceView> {
    const text = typeof body.text === 'string' ? body.text.slice(0, 4000) : null;
    return run(this.evidence.add(this.actor(request, identity), target(body), text,
      file ? { name: file.originalname, content: file.buffer } : null));
  }

  // Images may be shown in the page; everything else is always a download, and the browser is told
  // not to guess the type.
  @Get(':id/file')
  async file(
    @Param('id') id: string, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const file = await run(this.evidence.file(this.actor(request, identity), uuid(id)));
    response.setHeader('Content-Type', file.mime);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Disposition',
      `${isImage(file.mime) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    response.end(file.content);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  withdraw(
    @Param('id') id: string, @Body() body: unknown, @Headers(INTERNAL_AUTH_HEADER) identity: string, @Req() request: AuthenticatedRequest,
  ): Promise<EvidenceView> {
    const parsed = withdrawEvidenceBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'invalid_request' });
    return run(this.evidence.withdraw(this.actor(request, identity), uuid(id), parsed.data.reason));
  }
}
