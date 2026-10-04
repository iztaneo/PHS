import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { checkOrigin, readCookie } from '../src/http.js';

function run(method: string, origin: string | undefined) {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  checkOrigin(['http://127.0.0.1:5173'])(
    { method, headers: { origin } } as Request, response as unknown as Response, next);
  return { next, response };
}

describe('gateway http helpers', () => {
  it('reads one cookie among several', () => {
    expect(readCookie('a=1; phs_session=abc%2Fdef; b=2', 'phs_session')).toBe('abc/def');
    expect(readCookie('a=1', 'phs_session')).toBeUndefined();
    expect(readCookie(undefined, 'phs_session')).toBeUndefined();
  });

  it('blocks unsafe requests from other origins only', () => {
    expect(run('POST', 'http://127.0.0.1:5173').next).toHaveBeenCalled();
    expect(run('GET', 'https://evil.example').next).toHaveBeenCalled();
    expect(run('POST', undefined).next).toHaveBeenCalled();
    const blocked = run('POST', 'https://evil.example');
    expect(blocked.next).not.toHaveBeenCalled();
    expect(blocked.response.status).toHaveBeenCalledWith(403);
  });
});
