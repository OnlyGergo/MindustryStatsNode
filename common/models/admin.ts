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
  host: string;
  port: number;
  firstSeen: number | null;  // epoch ms
  lastSeen: number | null;   // epoch ms
  memberCount: number;
}

export type MergeReason = 'same_name' | 'same_host';

/** A suggested pair. `target` is the older family, which will keep its root. */
export interface MergeSuggestion {
  source: MergeFamily;
  target: MergeFamily;
  reasons: MergeReason[];
  /** True when the two families were never seen at the same time — the classic address change. */
  disjoint: boolean;
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
  members: MergedMember[];
}
