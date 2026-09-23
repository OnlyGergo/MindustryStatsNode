import { t } from 'elysia';
import { REVIEW_ASPECTS, type ReviewAspectKey } from '../../../../common/models/ratings.js';

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

export const ReviewsQuery = t.Object({
  page: t.Optional(t.String()),
  perPage: t.Optional(t.String()),
  sort: t.Optional(t.Union([t.Literal('newest'), t.Literal('highest'), t.Literal('lowest')])),
}, { additionalProperties: false });

// Derived from REVIEW_ASPECTS, so a new aspect is a migration + one line there, never a
// hand-edit here. Object.fromEntries alone would give t.Object a `{ [x: string]: TSchema }`
// properties type, which collapses Eden's inferred body type to Record<string, ...>; the cast
// keeps the literal `maps` | `moderation` | `lag` keys so Eden still infers each field precisely.
function aspectFieldSchema() {
  return t.Nullable(t.Integer({ minimum: 1, maximum: 5 }));
}
const aspectFields = Object.fromEntries(
  REVIEW_ASPECTS.map((a) => [a.key, aspectFieldSchema()]),
) as Record<ReviewAspectKey, ReturnType<typeof aspectFieldSchema>>;

// A review's optional per-aspect ratings on the PUT body -- each aspect itself optional
// (omitted = written as NULL, see upsertReview), an explicit `null` clears one.
export const AspectsBody = t.Optional(t.Partial(t.Object(aspectFields, { additionalProperties: false })));

// Shared path param schemas — t.Numeric() coerces and rejects non-numeric ids with a 422
export const IdParam = t.Object({ id: t.Numeric() });
export const ModeIdParam = t.Object({ modeId: t.Numeric() });
