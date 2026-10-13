// ─────────────────────────────────────────────────────────────────────────────
// customisationReadRepository.ts
// Reads of `customisations` and `uploaded_images` (F4), on the read connection.
// Writes are in repositories/user/customisationRepository.ts and imageRepository.ts.
//
// A server's row stores the raw servers.id the owner was looking at, so every
// server lookup goes through the family (serverFamilySql) and takes the NEWEST
// row, the same rule as reviews: a merge can leave a row on each alias, and the
// write path collapses them back to one on the next save.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryTypes } from 'sequelize';
import sequelize from '../config/database.js';
import { canonicalOfSql, serverFamilySql } from './canonicalIdentity.js';
import { mergeCustomisation } from './customisationMerge.js';
import { discordAvatarUrl } from '../api/auth/discordAvatar.js';
import { removeColorsFromMindustry } from '../../../common/Mindustry.js';
import {
  uploadUrl,
  type AdminImage,
  type ImageStatus,
  type OwnerCustomisationState,
  type OwnerImage,
  type PublicCustomisation,
} from '../../../common/models/customisation.js';
import type { ManageTarget } from './ownershipRepository.js';
import type { ImageMime } from '../api/lib/imageValidation.js';

const OWNER_IMAGE_LIMIT = 50;
const ADMIN_IMAGE_LIMIT = 100;

const publicOf = (accentColor: string | null, approvedImageId: string | null): PublicCustomisation => ({
  accentColor: accentColor ?? null,
  backgroundUrl: approvedImageId ? uploadUrl(approvedImageId) : null,
});

/**
 * The merged customisation a visitor sees on a server page, or null when the
 * server does not exist. Accepts any family member's id.
 */
export async function getServerCustomisation(serverId: number): Promise<PublicCustomisation | null> {
  const [row] = await sequelize.query<{
    svAccent: string | null; svImage: string | null; nwAccent: string | null; nwImage: string | null;
  }>(
    `SELECT sv.accent_color AS "svAccent", svi.id AS "svImage",
            nw.accent_color AS "nwAccent", nwi.id AS "nwImage"
     FROM (SELECT ${canonicalOfSql(':serverId')} AS canonical_id) f
     -- The family's newest row, same ordering as reviews.
     LEFT JOIN LATERAL (
       SELECT c.accent_color, c.background_image_id
       FROM customisations c
       WHERE c.server_id IN (${serverFamilySql(':serverId')})
       ORDER BY c.updated_at DESC, c.id DESC
       LIMIT 1
     ) sv ON true
     -- Only approved images count; a pending/rejected one falls through to the network's.
     LEFT JOIN uploaded_images svi ON svi.id = sv.background_image_id AND svi.status = 'approved'
     -- Family-level properties come from the root.
     LEFT JOIN servers root ON root.id = f.canonical_id
     LEFT JOIN customisations nw ON nw.server_group_id = root.server_group_id
     LEFT JOIN uploaded_images nwi ON nwi.id = nw.background_image_id AND nwi.status = 'approved'
     WHERE f.canonical_id IS NOT NULL`,
    { replacements: { serverId }, type: QueryTypes.SELECT },
  );
  if (!row) return null;

  return mergeCustomisation(publicOf(row.svAccent, row.svImage), publicOf(row.nwAccent, row.nwImage));
}

/** The network's own defaults (not merged with anything), or null when the network does not exist. */
export async function getNetworkCustomisation(groupId: number): Promise<PublicCustomisation | null> {
  const [row] = await sequelize.query<{ accent: string | null; image: string | null }>(
    `SELECT nw.accent_color AS accent, nwi.id AS image
     FROM server_groups g
     LEFT JOIN customisations nw ON nw.server_group_id = g.id
     LEFT JOIN uploaded_images nwi ON nwi.id = nw.background_image_id AND nwi.status = 'approved'
     WHERE g.id = :groupId`,
    { replacements: { groupId }, type: QueryTypes.SELECT },
  );
  return row ? publicOf(row.accent, row.image) : null;
}

/** Whether the network / server (any family member's id) exists at all. */
export async function targetExists(target: ManageTarget): Promise<boolean> {
  const rows = await sequelize.query(
    'networkId' in target
      ? `SELECT 1 FROM server_groups WHERE id = :id`
      : `SELECT 1 FROM server_canonical WHERE server_id = :id`,
    { replacements: { id: 'networkId' in target ? target.networkId : target.serverId }, type: QueryTypes.SELECT },
  );
  return rows.length > 0;
}

/** Just enough to decide whether, and how, to serve a file. */
export async function getImageForServing(id: string): Promise<{ mime: ImageMime; status: ImageStatus } | null> {
  const [row] = await sequelize.query<{ mime: ImageMime; status: ImageStatus }>(
    `SELECT mime, status FROM uploaded_images WHERE id = CAST(:id AS uuid)`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return row ?? null;
}

/** The raw settings of exactly one target, plus the images uploaded for it, newest first. */
export async function getOwnerState(target: ManageTarget): Promise<OwnerCustomisationState> {
  const isNetwork = 'networkId' in target;
  const replacements = isNetwork ? { targetId: target.networkId } : { targetId: target.serverId };

  const [setting] = await sequelize.query<{ accentColor: string | null; backgroundImageId: string | null }>(
    isNetwork
      ? `SELECT accent_color AS "accentColor", background_image_id AS "backgroundImageId"
         FROM customisations WHERE server_group_id = :targetId`
      : `SELECT accent_color AS "accentColor", background_image_id AS "backgroundImageId"
         FROM customisations
         WHERE server_id IN (${serverFamilySql(':targetId')})
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`,
    { replacements, type: QueryTypes.SELECT },
  );

  const images = await sequelize.query<{
    id: string; status: ImageStatus; rejectReason: string | null;
    width: number; height: number; bytes: number; createdAt: string | Date;
  }>(
    `SELECT id, status, reject_reason AS "rejectReason", width, height, bytes, created_at AS "createdAt"
     FROM uploaded_images
     WHERE ${isNetwork ? 'server_group_id = :targetId' : `server_id IN (${serverFamilySql(':targetId')})`}
     ORDER BY created_at DESC, id DESC
     LIMIT ${OWNER_IMAGE_LIMIT}`,
    { replacements, type: QueryTypes.SELECT },
  );

  return {
    accentColor: setting?.accentColor ?? null,
    backgroundImageId: setting?.backgroundImageId ?? null,
    images: images.map((i): OwnerImage => ({
      id: i.id,
      status: i.status,
      rejectReason: i.rejectReason,
      width: i.width,
      height: i.height,
      bytes: i.bytes,
      createdAt: new Date(i.createdAt).getTime(),
      url: uploadUrl(i.id),
    })),
  };
}

interface AdminImageRow {
  id: string;
  status: ImageStatus;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string | Date;
  reviewedAt: string | Date | null;
  rejectReason: string | null;
  uploaderId: string | number | null;
  uploaderDiscordId: string | null;
  uploaderUsername: string | null;
  uploaderGlobalName: string | null;
  uploaderAvatarHash: string | null;
  reviewerId: string | number | null;
  reviewerName: string | null;
  serverGroupId: number | null;
  groupName: string | null;
  serverId: number | null;
  canonicalId: number | null;
  host: string | null;
  port: number | null;
  serverName: string | null;
}

/** Images with the given status, newest first, labelled for the admin queue. */
export async function listImagesForAdmin(status: ImageStatus): Promise<AdminImage[]> {
  // Target labelling mirrors listOwners in ownershipRepository.ts.
  const rows = await sequelize.query<AdminImageRow>(
    `SELECT
       i.id, i.status, i.mime, i.width, i.height, i.bytes,
       i.created_at AS "createdAt", i.reviewed_at AS "reviewedAt", i.reject_reason AS "rejectReason",
       u.id AS "uploaderId", u.discord_id AS "uploaderDiscordId", u.username AS "uploaderUsername",
       u.global_name AS "uploaderGlobalName", u.avatar_hash AS "uploaderAvatarHash",
       rv.id AS "reviewerId", COALESCE(rv.global_name, rv.username) AS "reviewerName",
       i.server_group_id AS "serverGroupId", sg.name AS "groupName",
       i.server_id AS "serverId", sc.canonical_id AS "canonicalId",
       lm.host, lm.port, motd.server_name AS "serverName"
     FROM uploaded_images i
     LEFT JOIN users u  ON u.id = i.uploader_id
     LEFT JOIN users rv ON rv.id = i.reviewed_by
     LEFT JOIN server_groups sg ON sg.id = i.server_group_id
     LEFT JOIN server_canonical sc ON sc.server_id = i.server_id
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
     WHERE i.status = :status
     ORDER BY i.created_at DESC, i.id DESC
     LIMIT ${ADMIN_IMAGE_LIMIT}`,
    { replacements: { status }, type: QueryTypes.SELECT },
  );

  return rows.map((row): AdminImage => ({
    id: row.id,
    status: row.status,
    mime: row.mime,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    createdAt: new Date(row.createdAt).getTime(),
    reviewedAt: row.reviewedAt ? new Date(row.reviewedAt).getTime() : null,
    rejectReason: row.rejectReason,
    url: uploadUrl(row.id),
    uploader: row.uploaderId != null
      ? {
          id: String(row.uploaderId),
          name: row.uploaderGlobalName ?? row.uploaderUsername ?? 'Unknown',
          avatarUrl: discordAvatarUrl(row.uploaderDiscordId!, row.uploaderAvatarHash),
          discordId: row.uploaderDiscordId!,
        }
      : null,
    reviewedBy: row.reviewerId != null
      ? { id: String(row.reviewerId), name: row.reviewerName ?? 'Unknown' }
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
