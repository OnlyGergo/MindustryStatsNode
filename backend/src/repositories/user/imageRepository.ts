// ─────────────────────────────────────────────────────────────────────────────
// imageRepository.ts
// Writes to `uploaded_images` (F4), on the user-content connection. Reads
// (serving, owner state, admin queue) are in customisationReadRepository.ts.
//
// Rejecting is also the takedown path for an image that was already approved:
// it un-sets the image from every customisation in the same transaction, and
// deletes the file once that has committed. The row stays as the moderation
// record.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryTypes } from 'sequelize';
import userSequelize from '../../config/userDatabase.js';
import { removeUpload } from './uploadStorage.js';
import type { ImageMime } from '../../api/lib/imageValidation.js';
import type { ManageTarget } from '../ownershipRepository.js';

export const MAX_PENDING_PER_UPLOADER = 10;

export interface InsertImageInput {
  id: string;
  uploaderId: string;
  target: ManageTarget;
  kind: 'background';
  mime: ImageMime;
  bytes: number;
  width: number;
  height: number;
}

export interface InsertedImage {
  id: string;
  status: 'pending';
  width: number;
  height: number;
  bytes: number;
  createdAt: Date;
}

/** Throws on an FK violation (target deleted mid-upload); the route unlinks the file. */
export async function insertImage(input: InsertImageInput): Promise<InsertedImage> {
  const { target } = input;
  const [row] = await userSequelize.query<InsertedImage & { createdAt: string | Date }>(
    `INSERT INTO uploaded_images (id, uploader_id, server_group_id, server_id, kind, mime, bytes, width, height)
     VALUES (CAST(:id AS uuid), CAST(:uploaderId AS bigint), :groupId, :serverId, :kind, :mime, :bytes, :width, :height)
     RETURNING id, status, width, height, bytes, created_at AS "createdAt"`,
    {
      replacements: {
        id: input.id,
        uploaderId: input.uploaderId,
        groupId: 'networkId' in target ? target.networkId : null,
        serverId: 'serverId' in target ? target.serverId : null,
        kind: input.kind,
        mime: input.mime,
        bytes: input.bytes,
        width: input.width,
        height: input.height,
      },
      type: QueryTypes.SELECT,
    },
  );
  return { ...row!, createdAt: new Date(row!.createdAt) };
}

export async function countPendingByUploader(userId: string): Promise<number> {
  const [row] = await userSequelize.query<{ n: string | number }>(
    `SELECT count(*) AS n FROM uploaded_images
     WHERE uploader_id = CAST(:userId AS bigint) AND status = 'pending'`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  );
  return Number(row?.n ?? 0);
}

export type ModerateImageResult =
  | { kind: 'not_found' }
  | { kind: 'wrong_state'; status: string }
  | { kind: 'ok' };

/** pending -> approved. */
export async function approveImage(id: string, adminId: string): Promise<ModerateImageResult> {
  return userSequelize.transaction(async (transaction) => {
    const [image] = await userSequelize.query<{ status: string }>(
      `SELECT status FROM uploaded_images WHERE id = CAST(:id AS uuid) FOR UPDATE`,
      { replacements: { id }, type: QueryTypes.SELECT, transaction },
    );
    if (!image) return { kind: 'not_found' };
    if (image.status !== 'pending') return { kind: 'wrong_state', status: image.status };

    await userSequelize.query(
      `UPDATE uploaded_images
       SET status = 'approved', reviewed_by = CAST(:adminId AS bigint), reviewed_at = now(), reject_reason = NULL
       WHERE id = CAST(:id AS uuid)`,
      { replacements: { id, adminId }, type: QueryTypes.UPDATE, transaction },
    );
    return { kind: 'ok' };
  });
}

/** pending -> rejected, or approved -> rejected (a takedown). */
export async function rejectImage(id: string, adminId: string, reason: string | null): Promise<ModerateImageResult> {
  let mime: ImageMime | null = null;

  const result = await userSequelize.transaction(async (transaction): Promise<ModerateImageResult> => {
    const [image] = await userSequelize.query<{ status: string; mime: ImageMime }>(
      `SELECT status, mime FROM uploaded_images WHERE id = CAST(:id AS uuid) FOR UPDATE`,
      { replacements: { id }, type: QueryTypes.SELECT, transaction },
    );
    if (!image) return { kind: 'not_found' };
    if (image.status !== 'pending' && image.status !== 'approved') {
      return { kind: 'wrong_state', status: image.status };
    }

    await userSequelize.query(
      `UPDATE uploaded_images
       SET status = 'rejected', reviewed_by = CAST(:adminId AS bigint), reviewed_at = now(), reject_reason = :reason
       WHERE id = CAST(:id AS uuid)`,
      { replacements: { id, adminId, reason }, type: QueryTypes.UPDATE, transaction },
    );
    // Takedown: no customisation may keep pointing at it. A customisation write
    // that is mid-flight holds FOR SHARE on this row, so it either commits first
    // (and is cleared here) or sees the new status.
    await userSequelize.query(
      `UPDATE customisations SET background_image_id = NULL WHERE background_image_id = CAST(:id AS uuid)`,
      { replacements: { id }, type: QueryTypes.UPDATE, transaction },
    );
    mime = image.mime;
    return { kind: 'ok' };
  });

  // After commit, so a rollback never leaves a live row without its file.
  if (result.kind === 'ok' && mime) await removeUpload(id, mime);
  return result;
}
