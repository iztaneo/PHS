import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpException, Inject, Post, Req, Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { SESSION_COOKIE, cookieSecure, readCookie, requestId } from './http.js';
import { IdentityClient, type SessionInfo, type SessionUser } from './identity.client.js';

const loginBody = z.object({ email: z.string().min(1).max(320), password: z.string().min(1).max(1024) });
const passwordBody = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(1).max(1024),
});

interface PublicSession {
  user: SessionUser;
  expiresAt: string;
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException({ code: 'invalid_request' });
  return result.data;
}

function cookieOptions() {
  return { httpOnly: true, secure: cookieSecure(), sameSite: 'strict' as const, path: '/' };
}

// The only public face of the Identity service. The session token lives in an HttpOnly cookie
// and never appears in a response body.
@Controller('api/v1/session')
export class SessionController {
  constructor(@Inject(IdentityClient) private readonly identity: IdentityClient) {}

  @Post()
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicSession> {
    const input = parse(loginBody, body);
    const result = await this.identity.post<SessionInfo & { token: string }>('/sessions', requestId(request), {
      ...input,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']?.slice(0, 512),
    });
    if (result.status !== 201) {
      if (result.status === 401) throw new UnauthorizedException({ code: 'invalid_credentials' });
      throw new HttpException({ code: 'identity_unavailable' }, 502);
    }
    const session = result.body as SessionInfo & { token: string };
    response.cookie(SESSION_COOKIE, session.token, { ...cookieOptions(), expires: new Date(session.expiresAt) });
    return { user: session.user, expiresAt: session.expiresAt };
  }

  @Get()
  async current(@Req() request: Request): Promise<PublicSession> {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    const session = token ? await this.identity.introspect(token, requestId(request)) : null;
    if (!session) throw new UnauthorizedException({ code: 'authentication_required' });
    return { user: session.user, expiresAt: session.expiresAt };
  }

  @Delete()
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (token) await this.identity.post('/sessions/revoke', requestId(request), { token });
    response.clearCookie(SESSION_COOKIE, cookieOptions());
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(@Body() body: unknown, @Req() request: Request): Promise<void> {
    const input = parse(passwordBody, body);
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (!token) throw new UnauthorizedException({ code: 'authentication_required' });
    const result = await this.identity.post('/password', requestId(request), { token, ...input });
    if (result.status === 204) return;
    const code = (result.body as { code?: string }).code;
    if (result.status === 401) {
      throw new UnauthorizedException({
        code: code === 'invalid_current_password' ? code : 'authentication_required',
      });
    }
    if (result.status === 400) throw new BadRequestException({ code: code ?? 'invalid_request' });
    throw new HttpException({ code: 'identity_unavailable' }, 502);
  }
}
