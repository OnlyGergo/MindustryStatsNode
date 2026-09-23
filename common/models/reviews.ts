export type ReviewSort = 'newest' | 'highest' | 'lowest';
export const REVIEW_BODY_MAX = 2000;

/** Public payload. An anonymous review carries author: null and NOTHING else identifying. */
export interface PublicReview {
  id: string;            // bigserial as string
  rating: number;        // 1..5
  body: string | null;
  createdAt: number;     // epoch ms
  updatedAt: number;     // epoch ms
  author: { name: string; avatarUrl: string; profileUrl: string } | null;
}

export interface ReviewPage {
  total: number;
  page: number;
  perPage: number;
  reviews: PublicReview[];
}

export interface ReviewSummary {
  count: number;
  average: number | null;   // raw mean, null when count = 0
  histogram: [number, number, number, number, number]; // index 0 = 1 star
}

/** The caller's own review (GET /mine, PUT response). */
export interface MyReview {
  id: string;
  rating: number;
  body: string | null;
  anonymous: boolean;
  createdAt: number;
  updatedAt: number;
  removed: boolean;          // true = hidden by a moderator; editing is refused
}
