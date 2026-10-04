import {
  BadRequestException, Body, Controller, HttpCode, Inject, Post, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthService, type NewSession, type SessionInfo } from './auth.service.js';
import { InternalAuthGuard, type InternalRequest } from './internal-auth.guard.js';

const loginBody = z.object({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
  ipAddress: z.string().max(64).optional(),
  userAgent: z.string().max(512).optional(),
});
const tokenBody = z.object({ token: z.string().min(1).max(256) });
const passwordBody = tokenBody.extend({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(1).max(1024),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException({ code: 'invalid_request' });
  return result.data;
}

@Controller()
@UseGuards(InternalAuthGuard)
export class SessionController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('sessions')
  async login(@Body() body: unknown, @Req() request: InternalRequest): Promise<NewSession> {
    const input = parse(loginBody, body);
    const session = await this.auth.login(input.email.trim(), input.password, {
      requestId: request.internal.requestId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    if (!session) throw new UnauthorizedException({ code: 'invalid_credentials' });
    return session;
  }

  @Post('sessions/introspect')
  @HttpCode(200)
  async introspect(@Body() body: unknown): Promise<SessionInfo> {
    const session = await this.auth.introspect(parse(tokenBody, body).token);
    if (!session) throw new UnauthorizedException({ code: 'invalid_session' });
    return session;
  }

  @Post('sessions/revoke')
  @HttpCode(204)
  async revoke(@Body() body: unknown, @Req() request: InternalRequest): Promise<void> {
    await this.auth.revoke(parse(tokenBody, body).token, request.internal.requestId);
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(@Body() body: unknown, @Req() request: InternalRequest): Promise<void> {
    const input = parse(passwordBody, body);
    const result = await this.auth.changePassword(
      input.token, input.currentPassword, input.newPassword, request.internal.requestId,
    );
    if (result === 'invalid_session') throw new UnauthorizedException({ code: 'invalid_session' });
    if (result === 'invalid_current') throw new UnauthorizedException({ code: 'invalid_current_password' });
    if (result === 'weak_password') throw new BadRequestException({ code: 'weak_password' });
  }
}
