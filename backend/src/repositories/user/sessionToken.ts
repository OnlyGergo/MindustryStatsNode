// Pure token helpers for sessionRepository, kept apart from it so they can be
// unit tested without env validation or a database connection.

/** base64url of 32 bytes is always 43 chars, no padding. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** 32 random bytes, base64url. Only ever handed to the browser, never stored. */
export function generateToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

/** sha256 hex digest of the raw cookie token; this is what the DB stores. */
export function hashToken(token: string): string {
  return new Bun.CryptoHasher('sha256').update(token).digest('hex');
}

/** Cheap shape check so garbage cookies never reach the DB. */
export function isWellFormedToken(token: string): boolean {
  return TOKEN_SHAPE.test(token);
}
