import { useMatches } from "@tanstack/react-router";
import { SITE_NAME } from "../../util/pageTitle.ts";

/**
 * Top-bar chrome derived from the active route matches' `staticData`.
 * `title` comes from the deepest match that sets one; `back` from the deepest
 * match only. Pure derivation, so it renders identically during SSR.
 */
export const usePageChrome = (): { title: string; back: boolean } => {
  const matches = useMatches();

  let title: string | undefined;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const t = match.staticData?.title;
    if (t === undefined) continue;
    title = typeof t === "function" ? t(match.loaderData) : t;
    break;
  }

  const back = matches[matches.length - 1]?.staticData?.back ?? false;

  return { title: title || SITE_NAME, back };
};
