// ─────────────────────────────────────────────────────────────────────────────
// hubRepository.ts
// Write side of the admin hub page, on the user-content connection.
//
// app_user_rw can't write aggregate_excluded_families; marking goes through
// the SECURITY DEFINER set_aggregate_exclude from 45_family_aggregate_exclude.sql,
// which resolves any member id to the family root.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryTypes } from 'sequelize';
import userSequelize from '../../config/userDatabase.js';

export type SetHubResult = { kind: 'ok'; rootId: number } | { kind: 'not_found' };

const NO_DATA_FOUND = 'P0002';

/** Marks (or unmarks) the family `serverId` belongs to as a hub. Any member id works. */
export async function setServerHub(serverId: number, isHub: boolean): Promise<SetHubResult> {
  try {
    const [row] = await userSequelize.query<{ root: number }>(
      `SELECT set_aggregate_exclude(:serverId, :isHub) AS root`,
      { replacements: { serverId, isHub }, type: QueryTypes.SELECT },
    );
    return { kind: 'ok', rootId: Number(row!.root) };
  } catch (error: any) {
    const code = error?.original?.code ?? error?.parent?.code;
    if (code === NO_DATA_FOUND) return { kind: 'not_found' };
    throw error;
  }
}

/** Hides a family from the hub suggestions ("not a hub"). Idempotent; stored against its current root. */
export async function dismissHubSuggestion(serverId: number, userId: string): Promise<void> {
  await userSequelize.query(
    `INSERT INTO server_hub_dismissals (server_id, dismissed_by)
     SELECT sc.canonical_id, CAST(:userId AS bigint)
     FROM server_canonical sc WHERE sc.server_id = :serverId
     ON CONFLICT (server_id) DO NOTHING`,
    { replacements: { serverId, userId }, type: QueryTypes.INSERT },
  );
}
