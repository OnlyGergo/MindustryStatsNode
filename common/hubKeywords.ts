/**
 * Words that suggest a server is a hub/lobby rather than a game server.
 * Matched case-insensitively as whole words, after Mindustry colour tags are
 * stripped, against the server name, MOTD description and current map name.
 */
export const HUB_KEYWORDS = ['hub', 'lobby'] as const;

/** Mindustry colour/markup tags like `[accent]` or `[#ff0000]`. */
export const COLOUR_TAG_RE = /\[[^\]]*\]/g;

/**
 * POSIX regex (Postgres `~*`) matching any keyword as a whole word. `\y` is
 * Postgres' word boundary; keywords are plain letters, so no escaping needed.
 */
export const hubKeywordPattern = (keywords: readonly string[] = HUB_KEYWORDS): string =>
    `\\y(${keywords.join('|')})\\y`;

/** JS twin of the SQL match, for highlighting and tests. */
export function matchesHubKeyword(text: string | null | undefined, keywords: readonly string[] = HUB_KEYWORDS): boolean {
    if (!text) return false;
    const stripped = text.replace(COLOUR_TAG_RE, '');
    return new RegExp(`\\b(${keywords.join('|')})\\b`, 'i').test(stripped);
}
