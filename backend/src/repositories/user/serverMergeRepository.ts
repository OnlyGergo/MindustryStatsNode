// ─────────────────────────────────────────────────────────────────────────────
// serverMergeRepository.ts
// Write side of the admin merge page, on the user-content connection.
//
// app_user_rw has no write grant on server_canonical; the identity layer
// stays collector-owned. Merges and unmerges go through the
// two SECURITY DEFINER functions from 40_admin_server_merge.sql, which encode
// the operator statements from 30_server_identity.sql and nothing else.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryTypes } from 'sequelize';
import userSequelize from '../../config/userDatabase.js';

export type MergeResult =
  | { kind: 'ok'; rootId: number }
  | { kind: 'not_found' }
  | { kind: 'conflict'; message: string };

const NO_DATA_FOUND = 'P0002';
const UNIQUE_VIOLATION = '23505';

/** Maps the functions' deliberate RAISEs onto results; anything else rethrows. */
function classify(error: any): MergeResult {
  const code = error?.original?.code ?? error?.parent?.code;
  if (code === NO_DATA_FOUND) return { kind: 'not_found' };
  if (code === UNIQUE_VIOLATION) return { kind: 'conflict', message: error.original?.message ?? 'Conflict' };
  throw error;
}

/** Folds `sourceId`'s family into `targetId`'s. The older root survives either way. */
export async function mergeServers(sourceId: number, targetId: number): Promise<MergeResult> {
  try {
    const [row] = await userSequelize.query<{ root: number }>(
      `SELECT merge_server_families(:sourceId, :targetId) AS root`,
      { replacements: { sourceId, targetId }, type: QueryTypes.SELECT },
    );
    return { kind: 'ok', rootId: Number(row!.root) };
  } catch (error) {
    return classify(error);
  }
}

/** Detaches one member back into a family of its own. */
export async function unmergeServer(serverId: number): Promise<MergeResult> {
  try {
    await userSequelize.query(`SELECT unmerge_server(:serverId)`, {
      replacements: { serverId }, type: QueryTypes.SELECT,
    });
    return { kind: 'ok', rootId: serverId };
  } catch (error) {
    return classify(error);
  }
}

/** Hides a suggested pair from the merge page. Idempotent. */
export async function dismissMergeSuggestion(a: number, b: number, userId: string): Promise<void> {
  await userSequelize.query(
    `INSERT INTO server_merge_dismissals (server_a, server_b, dismissed_by)
     VALUES (LEAST(:a, :b), GREATEST(:a, :b), CAST(:userId AS bigint))
     ON CONFLICT (server_a, server_b) DO NOTHING`,
    { replacements: { a, b, userId }, type: QueryTypes.INSERT },
  );
}
