// ─────────────────────────────────────────────────────────────────────────────
// discordWebhooks.ts
// Discord webhook notifications for new reviews and review reports.
//
// Env: DISCORD_REVIEWS_WEBHOOK_URL, DISCORD_REPORTS_WEBHOOK_URL (both optional;
// an unset URL just skips that notification).
//
// Fire-and-forget: call as `void notifyX(...)`. Nothing here throws -- a Discord
// outage must never fail the write that triggered it.
// ─────────────────────────────────────────────────────────────────────────────

import { env } from '../../config/env.js';
import { createLogger } from '../../logger.js';
import { discordAvatarUrl } from '../auth/discordAvatar.js';

const logger = createLogger('DiscordWebhooks');

/** The subset of AuthUser the embeds need. */
export interface DiscordUser {
  discordId: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
}

export interface ReviewForWebhook {
  id: string;
  rating: number;
  body: string | null;
  anonymous: boolean;
  createdAt: number; // epoch ms, as MyReview
}

export interface ReportForWebhook {
  id: string;
  reason: string;
  note: string | null;
  createdAt: number;
}

const COLOR_REVIEW = 0xf97316;
const COLOR_REPORT = 0xef4444;
const REQUEST_TIMEOUT_MS = 5000;

const LIMIT_TITLE = 256;
const LIMIT_DESCRIPTION = 4096;
const LIMIT_FIELD_VALUE = 1024;
const LIMIT_AUTHOR_NAME = 256;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function stars(rating: number, max = 5): string {
  const r = Math.max(0, Math.min(max, Math.round(rating)));
  return '★'.repeat(r) + '☆'.repeat(max - r);
}

const displayName = (user: DiscordUser) => user.globalName?.trim() || user.username;
const discordProfileUrl = (user: DiscordUser) => `https://discord.com/users/${user.discordId}`;

/** Public page for a server, optionally deep-linked to the reviews. */
export function serverUrl(serverId: number): string {
  return `${env.SITE_ORIGIN}/server/${serverId}`;
}

interface DiscordPayload {
  allowed_mentions: { parse: [] };
  embeds: unknown[];
}

async function postWebhook(url: string | undefined, payload: DiscordPayload, label: string): Promise<void> {
  if (!url) return;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.ok) return;

      // Rate limited: wait once, then retry.
      if (res.status === 429 && attempt === 0) {
        const data = (await res.json().catch(() => ({}))) as { retry_after?: number };
        await new Promise((r) => setTimeout(r, Math.min((data.retry_after ?? 1) * 1000, 5000)));
        continue;
      }

      logger.error(`${label}: HTTP ${res.status} ${await res.text().catch(() => '')}`);
      return;
    } catch (err) {
      logger.error(`${label}: request failed`, err);
      return;
    }
  }
}

export interface ReviewPostedInput {
  review: ReviewForWebhook;
  author: DiscordUser;
  serverId: number;
  serverName?: string;
  averageRating?: number | null;
  ratingCount?: number;
}

export async function notifyReviewPosted(input: ReviewPostedInput): Promise<void> {
  try {
    const { review, author, serverId, serverName, averageRating, ratingCount } = input;
    const anonymous = review.anonymous;

    const fields: { name: string; value: string; inline?: boolean }[] = [
      { name: 'Rating', value: `${stars(review.rating)} (${review.rating}/5)`, inline: true },
    ];

    if (averageRating != null) {
      const count = ratingCount !== undefined ? ` (${ratingCount} reviews)` : '';
      fields.push({
        name: 'Overall rating',
        value: `${stars(averageRating)} ${averageRating.toFixed(1)}/5${count}`,
        inline: true,
      });
    }

    const embed = {
      title: truncate(serverName ? `New review for ${serverName}` : `New review for server #${serverId}`, LIMIT_TITLE),
      url: serverUrl(serverId),
      color: COLOR_REVIEW,
      author: {
        name: truncate(anonymous ? 'Anonymous' : displayName(author), LIMIT_AUTHOR_NAME),
        ...(anonymous ? {} : { icon_url: discordAvatarUrl(author.discordId, author.avatarHash, 128), url: discordProfileUrl(author) }),
      },
      description: truncate(review.body?.trim() || '*No comment provided.*', LIMIT_DESCRIPTION),
      fields: fields.map((f) => ({ ...f, value: truncate(f.value, LIMIT_FIELD_VALUE) })),
      timestamp: new Date(review.createdAt).toISOString(),
      footer: { text: `Review #${review.id}` },
    };

    await postWebhook(env.DISCORD_REVIEWS_WEBHOOK_URL, { allowed_mentions: { parse: [] }, embeds: [embed] }, 'review posted');
  } catch (err) {
    logger.error('review posted: failed to build notification', err);
  }
}

export interface ReviewReportedInput {
  report: ReportForWebhook;
  review: ReviewForWebhook;
  /** The person who wrote the reported review. */
  author: DiscordUser;
  /** The person who filed the report. */
  reporter: DiscordUser;
  serverId: number;
  serverName?: string;
}


export async function notifyReviewReported(input: ReviewReportedInput): Promise<void> {
  try {
    const { report, review, author, reporter, serverId, serverName } = input;

    // Moderators need the real identity, so anonymity is NOT applied here.
    const embed = {
      title: truncate(`Review reported: ${report.reason}`, LIMIT_TITLE),
      url: serverUrl(serverId),
      color: COLOR_REPORT,
      author: {
        name: truncate(`${displayName(author)} (@${author.username})`, LIMIT_AUTHOR_NAME),
        icon_url: discordAvatarUrl(author.discordId, author.avatarHash, 128),
        url: discordProfileUrl(author),
      },
      thumbnail: { url: discordAvatarUrl(author.discordId, author.avatarHash, 256) },
      description: truncate(review.body?.trim() || '*No comment provided.*', LIMIT_DESCRIPTION),
      fields: [
        { name: 'Rating', value: `${stars(review.rating)} (${review.rating}/5)`, inline: true },
        { name: 'Reason', value: truncate(report.reason, LIMIT_FIELD_VALUE), inline: true },
        { name: 'Server', value: truncate(serverName ? `[${serverName}](${serverUrl(serverId)})` : serverUrl(serverId), LIMIT_FIELD_VALUE), inline: true },
        {
          name: 'Author account',
          value: `[${author.username}](${discordProfileUrl(author)})${review.anonymous ? ' (posted anonymously)' : ''}`,
          inline: true,
        },
        { name: 'Reported by', value: `[${reporter.username}](${discordProfileUrl(reporter)})`, inline: true },
        ...(report.note?.trim()
          ? [{ name: 'Reporter note', value: truncate(report.note.trim(), LIMIT_FIELD_VALUE) }]
          : []),
      ],
      timestamp: new Date(report.createdAt).toISOString(),
      footer: { text: `Report #${report.id} · Review #${review.id}` },
    };

    await postWebhook(env.DISCORD_REPORTS_WEBHOOK_URL, { allowed_mentions: { parse: [] }, embeds: [embed] }, 'review reported');
  } catch (err) {
    logger.error('review reported: failed to build notification', err);
  }
}
