// ─────────────────────────────────────────────────────────────────────────────
// auth.ts
// Discord OAuth login/logout and the `/me` account endpoints (F1).
//
// The Discord client (arctic) is built once at module load, only when both
// DISCORD_CLIENT_ID/SECRET are set; when either is missing it stays `null`
// and `/discord` + `/discord/callback` answer 503 instead of throwing.
//
// State/PKCE handoff: `GET /discord` stores `{state, verifier, next}` as JSON
// in the `oauth` cookie, signed with Elysia's own cookie-signing primitives
// (`signCookie`/`unsignCookie` from 'elysia/utils', HMAC-SHA256 keyed on
// COOKIE_SECRET). This is done by hand rather than via Elysia's automatic
// `cookie: { sign: [...] }` schema validation because that path *throws*
// `InvalidCookieSignature` while parsing the request -- before any handler
// code runs -- which would bypass the "clear the cookie, then answer 400"
// behaviour this route needs for a tampered value. Signing it ourselves keeps
// that entirely inside normal control flow.
// ─────────────────────────────────────────────────────────────────────────────

import { Elysia, status, t } from 'elysia';
import { signCookie, unsignCookie } from 'elysia/utils';
import { Discord, generateCodeVerifier, generateState } from 'arctic';
import { createLogger } from '../../logger.js';
import { env } from '../../config/env.js';
import { authPlugin, SESSION_COOKIE, sessionCookieOptions } from '../auth/plugin.js';
import { safeNextPath } from '../auth/nextPath.js';
import { discordAvatarUrl } from '../auth/discordAvatar.js';
import { upsertFromDiscord, deleteUser } from '../../repositories/user/userRepository.js';
import { createSession, deleteSession } from '../../repositories/user/sessionRepository.js';
import { clearCaches } from '../middleware/cache.js';
import type { AuthMe } from '../../../../common/models/auth.js';

const logger = createLogger('Api');

const OAUTH_COOKIE = 'oauth';
const OAUTH_COOKIE_MAX_AGE_SECONDS = 300;

const DISCORD_REDIRECT_URI = `${env.SITE_ORIGIN}/api/auth/discord/callback`;

/** `null` disables /discord + /discord/callback (answers 503) rather than throwing at boot. */
const discordClient: Discord | null =
  env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET
    ? new Discord(env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI)
    : null;

if (!discordClient) {
  logger.warn('DISCORD_CLIENT_ID/SECRET not set; Discord login is disabled (503).');
}

interface OauthCookiePayload {
  state: string;
  verifier: string;
  next: string;
}

function oauthCookieAttributes(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Must be Lax, not Strict: Discord's redirect back to /discord/callback is a
    // cross-site top-level navigation, which Strict cookies do not survive.
    secure: env.SITE_ORIGIN.startsWith('https://'),
    path: '/api/auth',
    maxAge: maxAgeSeconds,
    expires: new Date(Date.now() + maxAgeSeconds * 1000),
  };
}

type CookieJarEntry = { value?: unknown; set(config: Record<string, unknown>): unknown };

async function setOauthCookie(oauthCookie: CookieJarEntry, payload: OauthCookiePayload): Promise<void> {
  const signed = await signCookie(JSON.stringify(payload), env.COOKIE_SECRET);
  oauthCookie.set({ value: signed, ...oauthCookieAttributes(OAUTH_COOKIE_MAX_AGE_SECONDS) });
}

/** Explicit attributes (esp. `path`) so the Set-Cookie actually matches and clears the one we issued. */
function clearOauthCookie(oauthCookie: CookieJarEntry): void {
  oauthCookie.set({ value: '', ...oauthCookieAttributes(0), expires: new Date(0) });
}

function clearSidCookie(sidCookie: CookieJarEntry): void {
  sidCookie.set({ value: '', ...sessionCookieOptions(new Date(0)), maxAge: 0 });
}

/** Reads + verifies the signed oauth cookie. Returns null for missing/malformed/tampered. */
async function readOauthCookie(oauthCookie: CookieJarEntry): Promise<OauthCookiePayload | null> {
  const raw = oauthCookie.value;
  if (typeof raw !== 'string' || !raw) return null;

  const unsigned = await unsignCookie(raw, env.COOKIE_SECRET);
  if (unsigned === false) return null;

  try {
    const parsed = JSON.parse(unsigned) as Partial<OauthCookiePayload>;
    if (
      typeof parsed.state !== 'string' ||
      typeof parsed.verifier !== 'string' ||
      typeof parsed.next !== 'string'
    ) {
      return null;
    }
    return { state: parsed.state, verifier: parsed.verifier, next: parsed.next };
  } catch {
    return null;
  }
}

/** Constant-time string compare; a length mismatch alone is treated as "not equal". */
function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

interface DiscordProfile {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

const DISCORD_ID_RE = /^\d{1,32}$/;

function isDiscordProfile(value: unknown): value is DiscordProfile {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    DISCORD_ID_RE.test(v.id) &&
    typeof v.username === 'string' &&
    (typeof v.global_name === 'string' || v.global_name === null) &&
    (typeof v.avatar === 'string' || v.avatar === null)
  );
}

/** DB columns are varchar(64); Discord's own limits are looser than that. */
const clampVarchar64 = (value: string): string => value.slice(0, 64);

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .use(authPlugin)

  .get(
    '/discord',
    async ({ query, cookie, redirect }) => {
      if (!discordClient) return status(503, { error: 'Login is not configured' });

      const state = generateState();
      const verifier = generateCodeVerifier();
      const next = safeNextPath(query.next, env.SITE_ORIGIN);

      await setOauthCookie(cookie[OAUTH_COOKIE] as CookieJarEntry, { state, verifier, next });

      const url = discordClient.createAuthorizationURL(state, verifier, ['identify']);
      return redirect(url.toString(), 302);
    },
    {
      query: t.Object({ next: t.Optional(t.String()) }),
    },
  )

  .get(
    '/discord/callback',
    async ({ query, cookie, redirect }) => {
      const oauthCookie = cookie[OAUTH_COOKIE] as CookieJarEntry;

      if (!discordClient) return status(503, { error: 'Login is not configured' });

      // Discord itself refused/cancelled the request (e.g. ?error=access_denied).
      if (query.error) {
        clearOauthCookie(oauthCookie);
        return redirect('/', 302);
      }

      const payload = await readOauthCookie(oauthCookie);
      if (!payload) {
        clearOauthCookie(oauthCookie);
        return status(400, { error: 'Invalid OAuth state' });
      }

      if (
        !query.code ||
        !query.state ||
        !constantTimeEqual(query.state, payload.state)
      ) {
        clearOauthCookie(oauthCookie);
        return status(400, { error: 'Invalid OAuth state' });
      }

      let accessToken: string;
      try {
        const tokens = await discordClient.validateAuthorizationCode(query.code, payload.verifier);
        accessToken = tokens.accessToken();
      } catch (err) {
        logger.warn('Discord token exchange failed:', err instanceof Error ? err.message : err);
        clearOauthCookie(oauthCookie);
        return status(502, { error: 'Discord login failed' });
      }

      let profile: DiscordProfile;
      try {
        const res = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error(`Discord /users/@me responded ${res.status}`);
        const json: unknown = await res.json();
        if (!isDiscordProfile(json)) throw new Error('Unexpected Discord profile shape');
        profile = json;
      } catch (err) {
        logger.warn('Discord profile fetch failed:', err instanceof Error ? err.message : err);
        clearOauthCookie(oauthCookie);
        return status(502, { error: 'Discord login failed' });
      }

      const user = await upsertFromDiscord({
        discordId: profile.id,
        username: clampVarchar64(profile.username),
        globalName: profile.global_name ? clampVarchar64(profile.global_name) : null,
        avatarHash: profile.avatar,
      });

      // Logging in over an existing session replaces it rather than leaving it live.
      const sidCookie = cookie[SESSION_COOKIE] as CookieJarEntry;
      if (typeof sidCookie.value === 'string' && sidCookie.value) await deleteSession(sidCookie.value);

      const { token, expiresAt } = await createSession(user.id);
      sidCookie.set({ value: token, ...sessionCookieOptions(expiresAt) });
      clearOauthCookie(oauthCookie);

      return redirect(payload.next || '/', 302);
    },
    {
      // Discord may send extra params (error_description, etc); no strict schema here.
      query: t.Object({
        code: t.Optional(t.String()),
        state: t.Optional(t.String()),
        error: t.Optional(t.String()),
      }),
    },
  )

  .post(
    '/logout',
    async ({ cookie, set }) => {
      // requireUser already proved the cookie holds a live session.
      const sidCookie = cookie[SESSION_COOKIE] as CookieJarEntry;
      await deleteSession(sidCookie.value as string);
      clearSidCookie(sidCookie);
      set.status = 204;
    },
    { requireUser: true, requireOrigin: true },
  )

  .get(
    '/me',
    async ({ user, set }): Promise<AuthMe | null> => {
      set.headers['cache-control'] = 'no-store';
      if (!user) return null;

      return {
        id: user.id,
        discordId: user.discordId,
        username: user.username,
        globalName: user.globalName,
        avatarUrl: discordAvatarUrl(user.discordId, user.avatarHash),
        isAdmin: user.isAdmin,
        owns: { networks: [], servers: [] },
      };
    },
    { optionalUser: true },
  )

  .delete(
    '/me',
    async ({ user, cookie, set }) => {
      await deleteUser(user.id);
      // The FK cascade just removed this user's reviews; the cached list/
      // summary responses would otherwise keep serving them until TTL.
      clearCaches('reviews');
      clearSidCookie(cookie[SESSION_COOKIE] as CookieJarEntry);
      set.status = 204;
      return;
    },
    { requireUser: true, requireOrigin: true },
  );
