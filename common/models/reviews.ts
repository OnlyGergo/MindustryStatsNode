import type { AspectRatings, AspectSummaries } from './ratings.js';

export type ReviewSort = 'newest' | 'highest' | 'lowest';
export const REVIEW_BODY_MAX = 2000;
export const REPLY_BODY_MAX = 2000;

/** F5: the server's one public response to a review, from an owner (or an admin). Never anonymous. */
export interface ReviewReply {
  body: string;
  createdAt: number;     // epoch ms
  updatedAt: number;     // epoch ms
  author: { name: string; avatarUrl: string; profileUrl: string };
}

/** Public payload. An anonymous review carries author: null and NOTHING else identifying. */
export interface PublicReview {
  id: string;            // bigserial as string
  rating: number;        // 1..5
  body: string | null;
  createdAt: number;     // epoch ms
  updatedAt: number;     // epoch ms
  author: { name: string; avatarUrl: string; profileUrl: string } | null;
  reply: ReviewReply | null;
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
  aspects: AspectSummaries; // F9: per-aspect breakdown, same dedupe as the overall count
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
  aspects: AspectRatings;    // F9: null entries mean "not rated", not "rated worst"
}

// ── F7: reports + moderation ────────────────────────────────────────────────

/** Must match the CHECK on review_reports.reason (35_reports.sql). */
export const REPORT_REASONS = ['spam', 'abuse', 'offtopic', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam or advertising',
  abuse: 'Abusive or hateful',
  offtopic: 'Not about this server',
  other: 'Something else',
};
export type ReportStatus = 'open' | 'dismissed' | 'actioned';
export const REPORT_NOTE_MAX = 500;
export const REMOVED_REASON_MAX = 200;

/** Which slice of the moderation queue `GET /api/admin/reports` returns. */
export type ModerationView = 'open' | 'removed' | 'dismissed';

/** A person as only admin endpoints may show them: always identified, even on an anonymous review. */
export interface AdminUser {
  id: string;
  discordId: string;
  name: string;
  avatarUrl: string;
  profileUrl: string;
}

export interface AdminReport {
  id: string;
  reason: ReportReason;
  note: string | null;
  status: ReportStatus;
  createdAt: number;
  /** Deleting an account cascades its reports away, so a report always has its reporter. */
  reporter: AdminUser;
}

/** A review as the moderation queue sees it: the real author, and every report against it. */
export interface AdminReview {
  id: string;
  /** Public canonical id, for linking to the server page. */
  serverId: number;
  /** The address of the raw server the author was looking at. */
  serverAddress: string;
  rating: number;
  body: string | null;
  anonymous: boolean;
  createdAt: number;
  updatedAt: number;
  author: AdminUser;
  removedAt: number | null;
  removedReason: string | null;
  removedBy: AdminUser | null;
  /** The owner's reply (F5), including a removed one, so it can be restored. */
  reply: AdminReply | null;
  reports: AdminReport[];
}

export interface AdminReply {
  body: string;
  updatedAt: number;
  author: AdminUser;
  removedAt: number | null;
  removedReason: string | null;
}

export interface AdminReviewPage {
  total: number;
  page: number;
  perPage: number;
  reviews: AdminReview[];
}
