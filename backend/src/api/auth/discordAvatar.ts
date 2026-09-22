// ─────────────────────────────────────────────────────────────────────────────
// discordAvatar.ts
// Pure helper: Discord CDN avatar URL, with the default-avatar fallback.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `avatarHash` is `users.avatar_hash` (null when the account has never set an
 * avatar, or Discord returned none). Animated avatars are given an `a_` hash
 * prefix by Discord, which is the documented way to tell a gif from a png.
 */
export function discordAvatarUrl(discordId: string, avatarHash: string | null): string {
  if (avatarHash) {
    const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${ext}?size=64`;
  }

  const defaultIndex = Number((BigInt(discordId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
}
