/**
 * The signed-in user as `GET /api/auth/me` returns it (or `null` when logged out).
 * Never cached, never rendered during SSR: the frontend fetches it on the client.
 */
export interface AuthMe {
  /** Internal `users.id`, serialised as a string because it is a bigserial. */
  id: string;
  discordId: string;
  username: string;
  globalName: string | null;
  /** Discord CDN URL, falling back to one of Discord's default avatars. */
  avatarUrl: string;
  isAdmin: boolean;
  /** Filled in by F3 (ownership); empty until then. Ids are public canonical ids. */
  owns: {
    networks: number[];
    servers: number[];
  };
}

/** Derived, never stored. */
export const discordProfileUrl = (discordId: string): string =>
  `https://discord.com/users/${discordId}`;
