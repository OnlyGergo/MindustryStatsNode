/**
 * Admin-only payloads (F3+). Unlike the public review contracts these may name
 * users, since only `requireAdmin` routes ever return them.
 */

/** A user who has logged in at least once, as `GET /api/admin/users?q=` returns them. */
export interface AdminUser {
  id: string;            // bigserial as string
  discordId: string;
  username: string;
  globalName: string | null;
  avatarUrl: string;
  createdAt: number;     // epoch ms
}

/** What an owner row grants management of. Ids are public ids: network id, or canonical server id. */
export type OwnerTarget =
  | { kind: 'network'; networkId: number; name: string | null }
  | {
      kind: 'server';
      /** Public canonical id, as used in /server/:id. */
      serverId: number;
      /** The raw servers.id actually stored; differs from serverId only after a merge. */
      rawServerId: number;
      name: string | null;
      address: string | null;
    };

export interface OwnerEntry {
  id: string;            // bigserial as string
  createdAt: number;     // epoch ms
  user: { id: string; discordId: string; name: string; avatarUrl: string };
  /** The admin who assigned it; null once that account is deleted. */
  createdBy: { id: string; name: string } | null;
  target: OwnerTarget;
}

// ── Server merges (/admin/merges) ──────────────────────────────────────────

/** One server family as the merge page shows it. `id` is the canonical (root) id. */
export interface MergeFamily {
  id: number;
  name: string | null;
  /** Latest MOTD description (raw, colour tags included). */
  description: string | null;
  host: string;
  port: number;
  firstSeen: number | null;  // epoch ms
  lastSeen: number | null;   // epoch ms
  memberCount: number;
}

/**
 * Why a pair was suggested. The page filters on these client side.
 * - `same_day`: the newer family first appeared within a day either side of
 *   the older one's last sighting, i.e. a handover rather than a reuse months later.
 * - `disjoint`: the two were never seen at the same time, however long the gap.
 */
export type MergeReason = 'same_name' | 'same_motd' | 'same_host' | 'same_day' | 'disjoint';

/** A suggested pair. `target` is the older family, which will keep its root. */
export interface MergeSuggestion {
  source: MergeFamily;
  target: MergeFamily;
  reasons: MergeReason[];
  score: number;
}

export interface MergedMember {
  id: number;
  host: string;
  port: number;
  createdAt: number | null;  // epoch ms
  lastSeen: number | null;   // epoch ms
  retiredAt: number | null;  // epoch ms
  isRoot: boolean;
}

/** A family that currently has more than one member, i.e. an existing merge. */
export interface MergedFamily {
  id: number;
  name: string | null;
  description: string | null;
  members: MergedMember[];
}
