/**
 * The five pillars — the cross-app definition.
 *
 * The DATA lives in pillars.json next door, not here, because two of the
 * consumers are `tailwind.config.js` files. Those are CommonJS and cannot
 * `require` a `.ts` module, so a TypeScript source would have forced them to
 * keep their own copy of the palette — which is the exact duplication this
 * file exists to end. This module is the typed front door for app code.
 *
 * What belongs here: things true of a pillar everywhere — its key, its name,
 * its colour, what it means. What does NOT: icon names (Ionicons on mobile,
 * Heroicons on web), Tailwind class strings, and CSS custom properties. Those
 * are properties of a platform, not of the pillar, and each app keeps its own.
 */

import data from './pillars.json';

export interface Pillar {
  key: string;
  /** Full name, for anywhere with room for it. */
  label: string;
  /** For cramped spaces — radar axes, mobile filter chips. Often identical. */
  shortLabel: string;
  /** Hex. The single source; see the note in pillars.json about v1. */
  color: string;
  description: string;
}

export const PILLARS: readonly Pillar[] = data.pillars;

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
