// ─────────────────────────────────────────────────────────────────────────────
// customisationRepository.ts
// Write path for `customisations` (F4), on the user-content connection.
//
// PUT semantics are a FULL REPLACE: a null field is cleared. If both fields end
// up null the target's row(s) are deleted instead, so a network's defaults show
// through again.
//
// A server target is stored against the raw servers.id the owner was looking
// at. A merge can leave a row on each alias of one family, so saving takes the
// family's newest row, repoints it to the current id, and deletes the rest --
// same shape as reviewRepository.upsertReview.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryTypes, type Transaction } from 'sequelize';
import userSequelize from '../../config/userDatabase.js';
import { serverFamilySql } from '../canonicalIdentity.js';
import type { ManageTarget } from '../ownershipRepository.js';

/**
 * First key of the two-int advisory lock taken per server family. The two-int
 * form is a separate keyspace from reviewRepository's single-bigint per-user
 * lock, so the two can never block each other by key coincidence.
 */
const CUSTOMISATION_LOCK_NAMESPACE = 4001;

export interface CustomisationInput {
  accentColor: string | null;
  backgroundImageId: string | null;
}

export type SetCustomisationResult =
  | { kind: 'not_found' }
  | { kind: 'image_not_allowed' }
  | { kind: 'ok' };

export async function setCustomisation(
  target: ManageTarget,
  input: CustomisationInput,
  updatedBy: string,
): Promise<SetCustomisationResult> {
  return userSequelize.transaction(async (transaction) =>
    'networkId' in target
      ? setNetwork(target.networkId, input, updatedBy, transaction)
      : setServer(target.serverId, input, updatedBy, transaction),
  );
}

/**
 * The image must exist, be approved, be a background, and have been uploaded
 * for this very target. FOR SHARE so a concurrent rejection (which updates the
 * image row) waits for us and then clears the reference we just wrote.
 */
async function imageAllowed(
  imageId: string,
  target: ManageTarget,
  transaction: Transaction,
): Promise<boolean> {
  const isNetwork = 'networkId' in target;
  const rows = await userSequelize.query(
    `SELECT 1 FROM uploaded_images
     WHERE id = CAST(:imageId AS uuid) AND status = 'approved' AND kind = 'background'
       AND ${isNetwork ? 'server_group_id = :targetId' : `server_id IN (${serverFamilySql(':targetId')})`}
     FOR SHARE`,
    {
      replacements: { imageId, targetId: isNetwork ? target.networkId : (target as { serverId: number }).serverId },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  return rows.length > 0;
}

async function setNetwork(
  groupId: number,
  input: CustomisationInput,
  updatedBy: string,
  transaction: Transaction,
): Promise<SetCustomisationResult> {
  const group = await userSequelize.query(`SELECT 1 FROM server_groups WHERE id = :groupId`, {
    replacements: { groupId }, type: QueryTypes.SELECT, transaction,
  });
  if (group.length === 0) return { kind: 'not_found' };

  if (input.backgroundImageId && !(await imageAllowed(input.backgroundImageId, { networkId: groupId }, transaction))) {
    return { kind: 'image_not_allowed' };
  }

  if (input.accentColor === null && input.backgroundImageId === null) {
    await userSequelize.query(`DELETE FROM customisations WHERE server_group_id = :groupId`, {
      replacements: { groupId }, type: QueryTypes.DELETE, transaction,
    });
    return { kind: 'ok' };
  }

  // The ON CONFLICT target repeats the partial index's predicate for Postgres to infer it.
  await userSequelize.query(
    `INSERT INTO customisations (server_group_id, accent_color, background_image_id, updated_by)
     VALUES (:groupId, :accentColor, CAST(:imageId AS uuid), CAST(:updatedBy AS bigint))
     ON CONFLICT (server_group_id) WHERE server_group_id IS NOT NULL
     DO UPDATE SET accent_color = EXCLUDED.accent_color,
                   background_image_id = EXCLUDED.background_image_id,
                   updated_by = EXCLUDED.updated_by,
                   updated_at = now()`,
    {
      replacements: { groupId, accentColor: input.accentColor, imageId: input.backgroundImageId, updatedBy },
      type: QueryTypes.INSERT,
      transaction,
    },
  );
  return { kind: 'ok' };
}

async function setServer(
  serverId: number,
  input: CustomisationInput,
  updatedBy: string,
  transaction: Transaction,
): Promise<SetCustomisationResult> {
  const [canonical] = await userSequelize.query<{ canonical_id: number }>(
    `SELECT canonical_id FROM server_canonical WHERE server_id = :serverId`,
    { replacements: { serverId }, type: QueryTypes.SELECT, transaction },
  );
  if (!canonical) return { kind: 'not_found' };

  // Serialises concurrent saves for one family: FOR UPDATE can't lock a row
  // that doesn't exist yet, so two first-time saves could both insert.
  await userSequelize.query(`SELECT pg_advisory_xact_lock(:ns, :canonicalId)`, {
    replacements: { ns: CUSTOMISATION_LOCK_NAMESPACE, canonicalId: canonical.canonical_id },
    type: QueryTypes.SELECT,
    transaction,
  });

  if (input.backgroundImageId && !(await imageAllowed(input.backgroundImageId, { serverId }, transaction))) {
    return { kind: 'image_not_allowed' };
  }

  const existing = await userSequelize.query<{ id: string | number }>(
    `SELECT id FROM customisations
     WHERE server_id IN (${serverFamilySql(':serverId')})
     ORDER BY updated_at DESC, id DESC
     FOR UPDATE`,
    { replacements: { serverId }, type: QueryTypes.SELECT, transaction },
  );

  if (input.accentColor === null && input.backgroundImageId === null) {
    if (existing.length > 0) {
      await userSequelize.query(`DELETE FROM customisations WHERE id IN (:ids)`, {
        replacements: { ids: existing.map((r) => r.id) }, type: QueryTypes.DELETE, transaction,
      });
    }
    return { kind: 'ok' };
  }

  const [newest, ...rest] = existing;
  if (newest) {
    // Superseded rows go first: one of them may already hold the raw id we repoint to,
    // and customisations_server_id_uq would refuse the UPDATE.
    if (rest.length > 0) {
      await userSequelize.query(`DELETE FROM customisations WHERE id IN (:ids)`, {
        replacements: { ids: rest.map((r) => r.id) }, type: QueryTypes.DELETE, transaction,
      });
    }
    await userSequelize.query(
      `UPDATE customisations
       SET server_id = :serverId, accent_color = :accentColor, background_image_id = CAST(:imageId AS uuid),
           updated_by = CAST(:updatedBy AS bigint), updated_at = now()
       WHERE id = :id`,
      {
        replacements: { id: newest.id, serverId, accentColor: input.accentColor, imageId: input.backgroundImageId, updatedBy },
        type: QueryTypes.UPDATE,
        transaction,
      },
    );
  } else {
    await userSequelize.query(
      `INSERT INTO customisations (server_id, accent_color, background_image_id, updated_by)
       VALUES (:serverId, :accentColor, CAST(:imageId AS uuid), CAST(:updatedBy AS bigint))`,
      {
        replacements: { serverId, accentColor: input.accentColor, imageId: input.backgroundImageId, updatedBy },
        type: QueryTypes.INSERT,
        transaction,
      },
    );
  }
  return { kind: 'ok' };
}
