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
