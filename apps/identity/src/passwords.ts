import { hash, verify } from '@node-rs/argon2';

// Library defaults are Argon2id with m=19456, t=2, p=1; the result is a PHC string.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

// Spends the same work when the account does not exist, so timing does not reveal it.
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('phs-dummy-password-not-a-credential');
  await verifyPassword(await dummyHash, password);
}
