// ─────────────────────────────────────────────────────────────────────────────
// ownerRepository.ts
// Admin-only writes to `owners` (F3), on the user-content connection. Reads
// (canManageServer, the admin list) are in repositories/ownershipRepository.ts.
//
// A server target is stored as the raw servers.id the admin entered -- for an
// id taken from a /server/:id URL that is the family's current canonical id,
// which is still a plain servers row, so a later merge just makes it one
// member among several and canManageServer keeps resolving it.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryTypes } from 'sequelize';
import userSequelize from '../../config/userDatabase.js';

export type OwnerTargetInput = { networkId: number } | { serverId: number };

export type AddOwnerResult =
  | { kind: 'created'; id: string }
  | { kind: 'exists' }
  | { kind: 'user_not_found' }
  | { kind: 'target_not_found' };

async function exists(sql: string, replacements: Record<string, unknown>): Promise<boolean> {
  const rows = await userSequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  return rows.length > 0;
}

export async function addOwner(userId: string, target: OwnerTargetInput, createdBy: string): Promise<AddOwnerResult> {
  // Checked up front rather than by catching FK violations, so each case gets
  // its own answer. A concurrent delete in between still fails the INSERT's FK
  // and surfaces as a 500, which is fine for an admin-only path.
  if (!(await exists(`SELECT 1 FROM users WHERE id = CAST(:userId AS bigint)`, { userId }))) {
    return { kind: 'user_not_found' };
  }

  const isNetwork = 'networkId' in target;
  const targetExists = isNetwork
    ? await exists(`SELECT 1 FROM server_groups WHERE id = :id`, { id: target.networkId })
    : await exists(`SELECT 1 FROM servers WHERE id = :id`, { id: target.serverId });
  if (!targetExists) return { kind: 'target_not_found' };

  // The ON CONFLICT target has to repeat the partial index's predicate for
  // Postgres to infer it.
  const rows = await userSequelize.query<{ id: string | number }>(
    isNetwork
      ? `INSERT INTO owners (user_id, server_group_id, created_by)
         VALUES (CAST(:userId AS bigint), :targetId, CAST(:createdBy AS bigint))
         ON CONFLICT (user_id, server_group_id) WHERE server_group_id IS NOT NULL DO NOTHING
         RETURNING id`
      : `INSERT INTO owners (user_id, server_id, created_by)
         VALUES (CAST(:userId AS bigint), :targetId, CAST(:createdBy AS bigint))
         ON CONFLICT (user_id, server_id) WHERE server_id IS NOT NULL DO NOTHING
         RETURNING id`,
    {
      replacements: { userId, createdBy, targetId: isNetwork ? target.networkId : target.serverId },
      type: QueryTypes.SELECT,
    },
  );

  const row = rows[0];
  return row ? { kind: 'created', id: String(row.id) } : { kind: 'exists' };
}

/** Returns false when no such assignment existed. */
export async function removeOwner(id: string): Promise<boolean> {
  const rows = await userSequelize.query(
    `DELETE FROM owners WHERE id = CAST(:id AS bigint) RETURNING id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
}
