/** `%`, `_` and `\` are LIKE metacharacters; escape them so a search matches literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
