/**
 * Per-server / per-network customisation (F4): an accent colour and a
 * background image, set by owners and applied on the server page.
 */

/** Written straight into a style attribute, so this is a security boundary, not just validation. */
export const ACCENT_COLOR_RE = /^#[0-9a-f]{6}$/i;

/** Image ids are server-generated v4 uuids, lower-case. */
export const UPLOAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const uploadUrl = (id: string): string => '/uploads/' + id;

export type ImageStatus = 'pending' | 'approved' | 'rejected';

/** What visitors get: the server's settings merged over its network's, approved images only. */
export interface PublicCustomisation {
  accentColor: string | null;
  backgroundUrl: string | null;
}

export interface OwnerImage {
  id: string;
  status: ImageStatus;
  rejectReason: string | null;
  width: number;
  height: number;
  bytes: number;
  createdAt: number; // epoch ms
  url: string;
}

/** The RAW settings of exactly one target (not merged with its network), plus that target's images. */
export interface OwnerCustomisationState {
  accentColor: string | null;
  backgroundImageId: string | null;
  images: OwnerImage[];
}

/** An image in the admin queue, labelled with who uploaded it and where it will appear. */
export interface AdminImage {
  id: string;
  status: ImageStatus;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: number; // epoch ms
  reviewedAt: number | null;
  rejectReason: string | null;
  url: string;
  uploader: { id: string; name: string; avatarUrl: string; discordId: string } | null;
  reviewedBy: { id: string; name: string } | null;
  target:
    | { kind: 'network'; networkId: number; name: string | null }
    | {
        kind: 'server';
        /** Public canonical id, as used in /server/:id. */
        serverId: number;
        rawServerId: number;
        name: string | null;
        address: string | null;
      };
}
