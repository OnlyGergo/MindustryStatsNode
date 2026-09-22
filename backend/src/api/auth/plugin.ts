// ─────────────────────────────────────────────────────────────────────────────
// plugin.ts
// Session resolution for routes that opt in, via Elysia 1.4 macros.
//
// Deliberately NOT a global `.derive` (the plan's first draft): mounted at the
// top of `api` in app.ts, a global derive would run a session DB lookup on
// every request that carries the `sid` cookie, including static assets and
// anonymous SSR page loads. `.macro({ ..., resolve() {...} })` only runs its
// resolver for routes that put the macro's key in their hook options, so the
// cost is opt-in the same way `withCache`/`requireOrigin` are.
//
// Ordering note: `requireOrigin: true` runs its check via `beforeHandle`
// inside the same macro object as `optionalUser`/`requireUser`/`requireAdmin`.
// Elysia does not guarantee beforeHandle-vs-resolve ordering *across* macros
// registered independently, but resolvers and beforeHandle from properties of
// the *same* macro call apply in the order Elysia composes them for that
// route; in practice (and by intent here) the origin check should run before
// the session lookup so a cross-origin POST never touches the DB. If ordering
// ever turns out not to hold under a future Elysia version, the worst case is
// an extra session lookup before the 403, not a security hole -- the 403 is
// keyed only on the Origin header and does not depend on `user` being set.
// ─────────────────────────────────────────────────────────────────────────────

import { Elysia } from 'elysia';
import { env } from '../../config/env.js';
import { resolveSession, type SessionUser } from '../../repositories/user/sessionRepository.js';
import { isSameOrigin } from './originGuard.js';

export const SESSION_COOKIE = 'sid';

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.SITE_ORIGIN.startsWith('https://'),
    path: '/',
    expires,
  };
}

export interface AuthUser {
  id: string;
  discordId: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
  isAdmin: boolean;
}

export function isAdmin(discordId: string): boolean {
  return env.ADMIN_DISCORD_IDS.includes(discordId);
}

export function toAuthUser(row: SessionUser): AuthUser {
  return {
    id: row.id,
    discordId: row.discordId,
    username: row.username,
    globalName: row.globalName,
    avatarHash: row.avatarHash,
    isAdmin: isAdmin(row.discordId),
  };
}

type CookieJar = Record<string, { value?: unknown; set(config: Record<string, unknown>): unknown }>;

/**
 * Resolves the `sid` cookie to its user. When the lookup slid the DB expiry
 * forward, the cookie is re-issued with the same expiry, otherwise the browser
 * would still drop it 30 days after login however active the user is.
 */
async function resolveUser(cookie: CookieJar): Promise<AuthUser | null> {
  const sid = cookie[SESSION_COOKIE];
  const token = sid?.value;
  if (!sid || typeof token !== 'string' || !token) return null;

  const row = await resolveSession(token);
  if (!row) return null;

  if (row.refreshedExpiresAt) {
    sid.set({ value: token, ...sessionCookieOptions(row.refreshedExpiresAt) });
  }
  return toAuthUser(row);
}

export const authPlugin = new Elysia({ name: 'auth' })
  .macro({
    optionalUser: {
      async resolve({ cookie }) {
        return { user: await resolveUser(cookie as any) };
      },
    },
    requireUser: {
      async resolve({ cookie, status }) {
        const user = await resolveUser(cookie as any);
        if (!user) return status(401, { error: 'Not logged in' });
        return { user };
      },
    },
    requireAdmin: {
      async resolve({ cookie, status }) {
        const user = await resolveUser(cookie as any);
        if (!user) return status(401, { error: 'Not logged in' });
        if (!user.isAdmin) return status(403, { error: 'Forbidden' });
        return { user };
      },
    },
    requireOrigin: {
      beforeHandle({ request, status }) {
        if (isSameOrigin(request, env.SITE_ORIGIN)) return;
        return status(403, { error: 'Bad origin' });
      },
    },
  });
