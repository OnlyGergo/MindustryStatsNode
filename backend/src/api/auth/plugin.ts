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
// `requireOrigin` checks in `transform`, which Elysia runs before every macro
// `resolve` regardless of key order, so a cross-origin mutation is refused
// before the session lookup (and its sliding-expiry write) ever runs. As a
// `beforeHandle` it ran *after* the resolvers.
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
      // Thrown, not returned: transform is typed as a void hook.
      transform({ request, status }) {
        if (isSameOrigin(request, env.SITE_ORIGIN)) return;
        throw status(403, { error: 'Bad origin' });
      },
    },
  });
