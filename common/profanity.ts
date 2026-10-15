// ─────────────────────────────────────────────────────────────────────────────
// profanity.ts
// Word-list profanity check (F7), shared so the review form can warn before it
// submits; the backend's 422 stays the authority.
//
// Matching is whole words and whole multi-word phrases over a folded copy of
// the text, never substrings, so "Scunthorpe", "class" or "assassin" are fine.
// Folding: Unicode compatibility-decompose and strip diacritics ("fück"),
// lowercase, then leetspeak 0→o 1→i 3→e @→a $→s. A list entry is folded the
// same way, so the "1" in "2g1c" still lines up with the input's.
//
// A word may carry one trailing "s" ("fucks" matches "fuck"). An entry with no
// letters or digits at all (the emoji) is matched as a raw substring instead.
// ─────────────────────────────────────────────────────────────────────────────

import { LDNOOBW_EN } from './profanity/en.js';

/**
 * Entries that are ordinary words in a game-server review. "suck(s)" is plain
 * negative feedback, which is allowed on purpose (reports handle real abuse);
 * the rest are game modes or everyday verbs.
 */
const ALLOWED = new Set(['suck', 'sucks', 'domination', 'hardcore', 'escort', 'snatch', 'xx']);

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '@': 'a', '$': 's' };

function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[01@$3]/g, (c) => LEET[c]!);
}

function tokens(folded: string): string[] {
  return folded.match(/[a-z0-9]+/g) ?? [];
}

const words = new Set<string>();
const phrases: string[][] = [];
const symbols: string[] = [];

for (const entry of LDNOOBW_EN) {
  if (ALLOWED.has(entry)) continue;
  const parts = tokens(fold(entry));
  if (parts.length === 0) symbols.push(entry.normalize('NFKC'));
  else if (parts.length === 1) words.add(parts[0]!);
  else phrases.push(parts);
}

function isWord(token: string): boolean {
  return words.has(token) || (token.length > 1 && token.endsWith('s') && words.has(token.slice(0, -1)));
}

function phraseAt(input: string[], i: number, phrase: string[]): boolean {
  if (i + phrase.length > input.length) return false;
  for (let j = 0; j < phrase.length; j++) {
    const token = input[i + j]!;
    const want = phrase[j]!;
    // Same single trailing-"s" allowance as a lone word, on the phrase's last word only.
    if (token !== want && !(j === phrase.length - 1 && token === `${want}s`)) return false;
  }
  return true;
}

export function containsProfanity(text: string): boolean {
  if (!text) return false;

  const raw = text.normalize('NFKC');
  if (symbols.some((s) => raw.includes(s))) return true;

  const input = tokens(fold(text));
  for (let i = 0; i < input.length; i++) {
    if (isWord(input[i]!)) return true;
    for (const phrase of phrases) {
      if (phraseAt(input, i, phrase)) return true;
    }
  }
  return false;
}
