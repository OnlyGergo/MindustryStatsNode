// ─────────────────────────────────────────────────────────────────────────────
// ownershipRepository.ts
// Reads of `owners` (F3), on the read connection. Writes are admin-only and
// live in repositories/user/ownerRepository.ts.
//
// An owner row stores the raw servers.id an admin assigned, so every check
// here resolves it through server_canonical at query time: owning any member
// of a family manages the whole family, and a network owner manages every
// family whose ROOT carries that server_group_id (family-level properties
// always come from the root, see canonicalIdentity.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { QueryTypes } from 'sequelize';
import sequelize from '../config/database.js';
import { canonicalOfSql, serverFamilySql } from './canonicalIdentity.js';
import { escapeLike } from './likePattern.js';
import { discordAvatarUrl } from '../api/auth/discordAvatar.js';
import { removeColorsFromMindustry } from '../../../common/Mindustry.js';
import type { AdminUser, OwnerEntry } from '../../../common/models/admin.js';

/** Admins pass every owner check, so they can manage every server. */
export async function canManageServer(
  user: { id: string; isAdmin: boolean },
  rawServerId: number,
): Promise<boolean> {
  if (user.isAdmin) return true;

  const [row] = await sequelize.query<{ allowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM owners o
       WHERE o.user_id = CAST(:userId AS bigint)
         AND (
           o.server_id IN (${serverFamilySql(':serverId')})
           OR o.server_group_id = (SELECT root.server_group_id FROM servers root
                                   WHERE root.id = ${canonicalOfSql(':serverId')})
         )
     ) AS allowed`,
    { replacements: { userId: user.id, serverId: rawServerId }, type: QueryTypes.SELECT },
  );
  return row?.allowed ?? false;
}

/** What `/api/auth/me` reports under `owns`. Server ids are public canonical ids. */
export async function getOwnedTargets(userId: string): Promise<{ networks: number[]; servers: number[] }> {
  const rows = await sequelize.query<{ kind: 'network' | 'server'; id: number }>(
    `SELECT DISTINCT 'network' AS kind, o.server_group_id AS id
     FROM owners o
     WHERE o.user_id = CAST(:userId AS bigint) AND o.server_group_id IS NOT NULL
     UNION
     SELECT DISTINCT 'server' AS kind, sc.canonical_id AS id
     FROM owners o
     JOIN server_canonical sc ON sc.server_id = o.server_id
     WHERE o.user_id = CAST(:userId AS bigint)
     ORDER BY kind, id`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  );

  return {
    networks: rows.filter((r) => r.kind === 'network').map((r) => Number(r.id)),
    servers: rows.filter((r) => r.kind === 'server').map((r) => Number(r.id)),
  };
}

interface OwnerRow {
  id: string | number;
  createdAt: string | Date;
  userId: string | number;
  discordId: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
  createdById: string | number | null;
  createdByName: string | null;
  serverGroupId: number | null;
  groupName: string | null;
  serverId: number | null;
  canonicalId: number | null;
  host: string | null;
  port: number | null;
  serverName: string | null;
}

/** Every owner assignment, newest first, labelled for the admin panel. */
export async function listOwners(): Promise<OwnerEntry[]> {
  const rows = await sequelize.query<OwnerRow>(
    `SELECT
       o.id, o.created_at AS "createdAt",
       u.id AS "userId", u.discord_id AS "discordId", u.username,
       u.global_name AS "globalName", u.avatar_hash AS "avatarHash",
       cb.id AS "createdById", COALESCE(cb.global_name, cb.username) AS "createdByName",
       o.server_group_id AS "serverGroupId", sg.name AS "groupName",
       o.server_id AS "serverId", sc.canonical_id AS "canonicalId",
       lm.host, lm.port, motd.server_name AS "serverName"
     FROM owners o
     JOIN users u              ON u.id = o.user_id
     LEFT JOIN users cb        ON cb.id = o.created_by
     LEFT JOIN server_groups sg ON sg.id = o.server_group_id
     LEFT JOIN server_canonical sc ON sc.server_id = o.server_id
     -- The family's live address, same ordering as LIVE_MEMBER_SQL but for one family.
     LEFT JOIN LATERAL (
       SELECT s.host, s.port
       FROM server_canonical f
       JOIN servers s ON s.id = f.server_id
       WHERE f.canonical_id = sc.canonical_id
       ORDER BY (s.retired_at IS NULL) DESC, s.last_seen DESC NULLS LAST, s.id DESC
       LIMIT 1
     ) lm ON true
     -- The family's newest MOTD name, for a human-readable label.
     LEFT JOIN LATERAL (
       SELECT r.server_name
       FROM server_motds_history h
       JOIN server_canonical f      ON f.server_id = h.server_id
       JOIN server_motds_registry r ON r.id = h.motd_id
       WHERE f.canonical_id = sc.canonical_id
       ORDER BY h.valid_from DESC
       LIMIT 1
     ) motd ON true
     ORDER BY o.created_at DESC, o.id DESC`,
    { type: QueryTypes.SELECT },
  );

  return rows.map((row): OwnerEntry => ({
    id: String(row.id),
    createdAt: new Date(row.createdAt).getTime(),
    user: {
      id: String(row.userId),
      discordId: row.discordId,
      name: row.globalName ?? row.username,
      avatarUrl: discordAvatarUrl(row.discordId, row.avatarHash),
    },
    createdBy: row.createdById != null
      ? { id: String(row.createdById), name: row.createdByName ?? 'Unknown' }
      : null,
    target: row.serverGroupId != null
      ? { kind: 'network', networkId: row.serverGroupId, name: row.groupName }
      : {
          kind: 'server',
          serverId: row.canonicalId ?? row.serverId!,
          rawServerId: row.serverId!,
          name: row.serverName ? removeColorsFromMindustry(row.serverName)?.trim() || null : null,
          address: row.host ? `${row.host}:${row.port}` : null,
        },
  }));
}

const USER_SEARCH_LIMIT = 20;

/** Users who have logged in, matched by username, display name, or exact Discord id. */
export async function searchUsers(q: string): Promise<AdminUser[]> {
  const rows = await sequelize.query<{
    id: string | number;
    discordId: string;
    username: string;
    globalName: string | null;
    avatarHash: string | null;
    createdAt: string | Date;
  }>(
    `SELECT id, discord_id AS "discordId", username, global_name AS "globalName",
            avatar_hash AS "avatarHash", created_at AS "createdAt"
     FROM users
     WHERE discord_id = :q
        OR username ILIKE :pattern
        OR global_name ILIKE :pattern
     -- Exact Discord id first, then prefix matches, then the rest.
     ORDER BY (discord_id = :q) DESC,
              (username ILIKE :prefix OR global_name ILIKE :prefix) DESC,
              username
     LIMIT ${USER_SEARCH_LIMIT}`,
    {
      replacements: { q, pattern: `%${escapeLike(q)}%`, prefix: `${escapeLike(q)}%` },
      type: QueryTypes.SELECT,
    },
  );

  return rows.map((row) => ({
    id: String(row.id),
    discordId: row.discordId,
    username: row.username,
    globalName: row.globalName,
    avatarUrl: discordAvatarUrl(row.discordId, row.avatarHash),
    createdAt: new Date(row.createdAt).getTime(),
  }));
}
