import { describe, expect, it } from 'vitest';
import { signInternalToken, verifyInternalToken } from './internal-auth.js';

const secret = 'test-secret-with-at-least-32-characters';
const identity = { requestId: 'r-1', userId: 'u-1', sessionId: 's-1' };

describe('internal token', () => {
  it('round-trips a signed identity', () => {
    expect(verifyInternalToken(signInternalToken(identity, secret), secret)).toEqual(identity);
  });

  it('rejects missing, tampered, wrongly signed and expired tokens', () => {
    const token = signInternalToken(identity, secret, 60, 1_000_000);
    const [body, sig] = token.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...identity, userId: 'u-2', exp: 9_999_999_999 })).toString('base64url');
    expect(verifyInternalToken(undefined, secret)).toBeNull();
    expect(verifyInternalToken(`${forged}.${sig}`, secret, 1_000_000)).toBeNull();
    expect(verifyInternalToken(token, 'another-secret-with-at-least-32-chars', 1_000_000)).toBeNull();
    expect(verifyInternalToken(`${body}.${sig}.x`, secret, 1_000_000)).toBeNull();
    expect(verifyInternalToken(token, secret, 1_000_000 + 61_000)).toBeNull();
    expect(verifyInternalToken(token, secret, 1_000_000 + 59_000)).toEqual(identity);
  });
});
