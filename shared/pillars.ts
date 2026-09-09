/**
 * The five pillars — the cross-app definition.
 *
 * The DATA lives in data/pillars.json, not here, because two of the consumers
 * are `tailwind.config.js` files (CommonJS, cannot `require` a `.ts` module)
 * and a third is a Flask backend. A TypeScript source would have forced each of
 * them to keep its own copy of the palette — the exact duplication this file
 * exists to end. generated/pillars.ts is emitted from that JSON alongside
 * backend/generated/pillars.py; this module is the typed front door for app
 * code and holds the helpers, which are not generated.
 *
 * What belongs here: things true of a pillar everywhere — its key, its name,
 * its colour, what it means. What does NOT: icon names (Ionicons on mobile,
 * Heroicons on web), Tailwind class strings, and CSS custom properties. Those
 * are properties of a platform, not of the pillar, and each app keeps its own.
 */

import { PILLARS_DATA, type PillarRecord } from './generated/pillars';

export type Pillar = PillarRecord;

export const PILLARS: readonly Pillar[] = PILLARS_DATA;

/** Canonical display order. Everything that lists pillars should use it. */
export const PILLAR_KEYS: readonly string[] = PILLARS.map((p) => p.key);

const BY_KEY: Record<string, Pillar> = Object.fromEntries(
  PILLARS.map((p) => [p.key, p]),
);

/** Lookup with a defined fallback, so a bad key renders rather than crashes. */
export function getPillar(key: string | null | undefined): Pillar {
  return BY_KEY[String(key ?? '').toLowerCase()] ?? PILLARS[0];
}

export function isValidPillar(key: string | null | undefined): boolean {
  return String(key ?? '').toLowerCase() in BY_KEY;
}

/**
 * Display name for a key. Note this is NOT `key[0].toUpperCase() + rest`:
 * that renders "Stem", and the pillar is "STEM". Both apps had their own
 * version of that special case.
 */
export function formatPillar(key: string | null | undefined): string {
  const k = String(key ?? '').toLowerCase();
  return BY_KEY[k]?.label ?? (k ? k[0].toUpperCase() + k.slice(1) : '');
}
