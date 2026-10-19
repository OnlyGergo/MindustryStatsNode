// ─────────────────────────────────────────────────────────────────────────────
// userRepository.ts
// Discord-backed user accounts, on the user-content connection.
//
// Ids are bigint (bigserial) on the wire and in Postgres, but always passed
// and returned here as strings -- JS numbers lose precision above 2^53, and
// the shared AuthMe contract (common/models/auth.ts) already serialises `id`
// as a string.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryTypes } from 'sequelize';
import userSequelize from '../../config/userDatabase.js';

export interface UserRow {
  id: string;
  discordId: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DiscordProfile {
  discordId: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
}

const USER_COLUMNS = `id, discord_id AS "discordId", username, global_name AS "globalName",
       avatar_hash AS "avatarHash", created_at AS "createdAt", updated_at AS "updatedAt"`;

function toUserRow(row: Record<string, unknown>): UserRow {
  return { ...(row as Omit<UserRow, 'id'>), id: String(row.id) };
}

/** Inserts a new user for this Discord account, or refreshes its profile fields. */
export async function upsertFromDiscord(profile: DiscordProfile): Promise<UserRow> {
  const rows = await userSequelize.query<Record<string, unknown>>(
    `INSERT INTO users (discord_id, username, global_name, avatar_hash)
     VALUES (:discordId, :username, :globalName, :avatarHash)
     ON CONFLICT (discord_id) DO UPDATE
       SET username = EXCLUDED.username,
           global_name = EXCLUDED.global_name,
           avatar_hash = EXCLUDED.avatar_hash,
           updated_at = now()
     RETURNING ${USER_COLUMNS}`,
    { replacements: { ...profile }, type: QueryTypes.SELECT },
  );

  return toUserRow(rows[0] as Record<string, unknown>);
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const rows = await userSequelize.query<Record<string, unknown>>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? toUserRow(row) : null;
}

/** Sessions cascade via the FK; this covers GDPR-style account erasure. */
export async function deleteUser(id: string): Promise<void> {
  await userSequelize.query(`DELETE FROM users WHERE id = :id`, {
    replacements: { id },
    type: QueryTypes.DELETE,
  });
}
