// ─────────────────────────────────────────────────────────────────────────────
// sessionRepository.ts
// Opaque bearer-token sessions for Discord login.
//
// The token that goes in the `sid` cookie is 32 random bytes, base64url
// encoded, and is only ever seen by the caller: the DB stores a sha256 hex
// digest of it (`token_hash`), so a leaked row cannot be replayed as a cookie.
// Expiry slides forward on use (30 days from `now()`), but the write to do
// that only happens when the session has been idle for 5+ minutes, so a user
// clicking around does not cost a write per request.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryTypes } from 'sequelize';
import userSequelize from '../../config/userDatabase.js';
import { generateToken, hashToken, isWellFormedToken } from './sessionToken.js';

export const SESSION_TTL_DAYS = 30;

/** Only writes the sliding-expiry columns when the session has been idle this long. */
const SLIDING_REFRESH_THRESHOLD_MINUTES = 5;

export interface SessionUser {
  id: string;
  discordId: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
  /** Set when this lookup slid the expiry forward; the caller re-issues the cookie with it. */
  refreshedExpiresAt: Date | null;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await userSequelize.query(
    `INSERT INTO user_sessions (token_hash, user_id, expires_at)
     VALUES (:tokenHash, :userId, :expiresAt)`,
    { replacements: { tokenHash, userId, expiresAt }, type: QueryTypes.INSERT },
  );

  return { token, expiresAt };
}

/**
 * Resolves a cookie token to its user, sliding the session's expiry forward.
 * Returns null for a token that is malformed, missing, or expired (an expired
 * row is lazily deleted on the way out).
 */
export async function resolveSession(token: string): Promise<SessionUser | null> {
  if (!isWellFormedToken(token)) return null;

  const tokenHash = hashToken(token);

  // One round trip: the CTE slides expiry forward only when the session has
  // been idle long enough (RETURNING the fresh expiry), and the outer SELECT
  // joins the user either way. It reads the pre-update snapshot, so
  // `expiresAt` is the old value; the refresh only ever happens on a live row.
  const rows = await userSequelize.query<Record<string, unknown>>(
    `WITH refreshed AS (
       UPDATE user_sessions
       SET expires_at = now() + interval '${SESSION_TTL_DAYS} days', last_seen_at = now()
       WHERE token_hash = :tokenHash
         AND expires_at > now()
         AND last_seen_at < now() - interval '${SLIDING_REFRESH_THRESHOLD_MINUTES} minutes'
       RETURNING token_hash, expires_at
     )
     SELECT u.id, u.discord_id AS "discordId", u.username, u.global_name AS "globalName",
            u.avatar_hash AS "avatarHash", s.expires_at AS "expiresAt", r.expires_at AS "refreshedExpiresAt"
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN refreshed r ON r.token_hash = s.token_hash
     WHERE s.token_hash = :tokenHash`,
    { replacements: { tokenHash }, type: QueryTypes.SELECT },
  );

  const row = rows[0] as
    | { id: number | string; discordId: string; username: string; globalName: string | null; avatarHash: string | null; expiresAt: string | Date; refreshedExpiresAt: string | Date | null }
    | undefined;
  if (!row) return null;

  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    // Expired but not yet swept: delete it lazily and report "no session".
    await deleteSession(token);
    return null;
  }

  return {
    id: String(row.id),
    discordId: row.discordId,
    username: row.username,
    globalName: row.globalName,
    avatarHash: row.avatarHash,
    refreshedExpiresAt: row.refreshedExpiresAt ? new Date(row.refreshedExpiresAt) : null,
  };
}

export async function deleteSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await userSequelize.query(`DELETE FROM user_sessions WHERE token_hash = :tokenHash`, {
    replacements: { tokenHash },
    type: QueryTypes.DELETE,
  });
}

export async function deleteAllForUser(userId: string): Promise<void> {
  await userSequelize.query(`DELETE FROM user_sessions WHERE user_id = :userId`, {
    replacements: { userId },
    type: QueryTypes.DELETE,
  });
}
