import { t } from 'elysia';

// Reusable strict query parameter schemas (disallow any additional/unexpected query parameters)
export const StrictNoQuery = t.Object({}, { additionalProperties: false });

export const StrictPaginationQuery = t.Object({
  page: t.Optional(t.String()),
  perPage: t.Optional(t.String())
}, { additionalProperties: false });

export const StrictRangeQuery = t.Object({
  range: t.Optional(t.String())
}, { additionalProperties: false });

export const StrictHistoryQuery = t.Object({
  range: t.Optional(t.String()),
  startDate: t.Optional(t.String()),
  endDate: t.Optional(t.String())
}, { additionalProperties: false });

// Shared path param schemas — t.Numeric() coerces and rejects non-numeric ids with a 422
//
// On the server routes `id` is always a *canonical* server id (migration 29),
// never an observation stream's: an alias simply does not resolve, and the
// public-facing display_ref is a read-only field rather than a route key.
export const IdParam = t.Object({ id: t.Numeric() });
export const ModeIdParam = t.Object({ modeId: t.Numeric() });
