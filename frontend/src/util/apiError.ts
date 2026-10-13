/**
 * Maps an Eden error to user-facing text. Our routes answer `{ error }` with a human string
 * worth showing as-is; Elysia's own validation 422s don't, so those get generic text.
 */
export const apiErrorMessage = (httpStatus: number, value: unknown, forbidden = "You can't do that."): string => {
  if (httpStatus === 401) return "You need to be logged in to do that.";
  if (httpStatus === 403) return forbidden;
  if (httpStatus === 429) return "Too many requests — please wait a moment and try again.";
  const message = (value as { error?: unknown } | null)?.error;
  if (typeof message === "string") return message;
  return "Something went wrong. Please try again.";
};
