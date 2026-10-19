// ─────────────────────────────────────────────────────────────────────────────
// uploadStorage.ts
// Where owner uploads live on disk (F4): UPLOAD_DIR/<uuid>.<ext>.
//
// Paths are built ONLY from a database row's id + its sniffed mime, never from
// anything the client sent, so there is nothing to traverse. UPLOAD_DIR is
// created lazily on the first write.
// ─────────────────────────────────────────────────────────────────────────────

import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { IMAGE_EXTENSIONS, type ImageMime } from '../../api/lib/imageValidation.js';

const uploadDir = path.resolve(env.UPLOAD_DIR);

export function uploadPath(id: string, mime: ImageMime): string {
  return path.join(uploadDir, `${id}.${IMAGE_EXTENSIONS[mime]}`);
}

export async function writeUpload(id: string, mime: ImageMime, bytes: Uint8Array): Promise<void> {
  await mkdir(uploadDir, { recursive: true });
  await Bun.write(uploadPath(id, mime), bytes, { createPath: false });
}

/** Deletes the file; one that is already gone is fine. */
export async function removeUpload(id: string, mime: ImageMime): Promise<void> {
  try {
    await unlink(uploadPath(id, mime));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
