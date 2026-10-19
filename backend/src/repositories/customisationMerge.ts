// ─────────────────────────────────────────────────────────────────────────────
// customisationMerge.ts
// Pure merge of a server's customisation over its network's (F4). A NULL field
// on the server falls through to the network's, field by field. Kept free of
// any DB import so it is unit-testable on its own.
// ─────────────────────────────────────────────────────────────────────────────

import type { PublicCustomisation } from '../../../common/models/customisation.js';

/** Already resolved to public form: an unapproved image is passed in as a null url. */
export type CustomisationFields = PublicCustomisation;

export function mergeCustomisation(
  server: CustomisationFields | null,
  network: CustomisationFields | null,
): PublicCustomisation {
  return {
    accentColor: server?.accentColor ?? network?.accentColor ?? null,
    backgroundUrl: server?.backgroundUrl ?? network?.backgroundUrl ?? null,
  };
}
