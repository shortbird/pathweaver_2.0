/**
 * Pillar config for the mobile app: the shared definition plus what only this
 * app has.
 *
 * It stopped being the single source of truth on 2026-09-03 (QF-01). Keys,
 * labels, short labels and colours now come from `@shared/pillars`, which v1
 * reads too -- a pillar's name and colour are the same fact on both surfaces,
 * and keeping two copies is how the web app and this one ended up disagreeing
 * about which of civics and wellness is orange (see shared/pillars.json).
 *
 * What stays here is genuinely local: Ionicons names, and the NativeWind class
 * strings. Neither means anything to the web app.
 */

import { Ionicons } from '@expo/vector-icons';

import { PILLARS as SHARED_PILLARS, getPillar as getSharedPillar } from '@shared/pillars';

export interface PillarConfig {
  key: string;
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFilled: keyof typeof Ionicons.glyphMap;
  bgClass: string;
  textClass: string;
}

/** Icons and NativeWind classes: the per-pillar half that is mobile-only. */
const NATIVE: Record<string, Pick<PillarConfig, 'icon' | 'iconFilled' | 'bgClass' | 'textClass'>> = {
  stem: {
    icon: 'flask-outline',
    iconFilled: 'flask',
    bgClass: 'bg-pillar-stem/15',
    textClass: 'text-pillar-stem',
  },
  art: {
    icon: 'color-palette-outline',
    iconFilled: 'color-palette',
    bgClass: 'bg-pillar-art/15',
    textClass: 'text-pillar-art',
  },
  communication: {
    icon: 'chatbubbles-outline',
    iconFilled: 'chatbubbles',
    bgClass: 'bg-pillar-communication/15',
    textClass: 'text-pillar-communication',
  },
  civics: {
    icon: 'globe-outline',
    iconFilled: 'globe',
    bgClass: 'bg-pillar-civics/15',
    textClass: 'text-pillar-civics',
  },
  wellness: {
    icon: 'fitness-outline',
    iconFilled: 'fitness',
    bgClass: 'bg-pillar-wellness/15',
    textClass: 'text-pillar-wellness',
  },
};

export const pillars: Record<string, PillarConfig> = Object.fromEntries(
  SHARED_PILLARS.map((p) => [p.key, { key: p.key, label: p.label, color: p.color, ...NATIVE[p.key] }]),
);

export const pillarKeys = Object.keys(pillars);

/** Short labels for tight spaces (mobile filters, radar axes) */
export const pillarShortLabels: Record<string, string> = Object.fromEntries(
  SHARED_PILLARS.map((p) => [p.key, p.shortLabel]),
);

/** Get pillar config with fallback. Falls back the way @shared/pillars does. */
export function getPillar(key: string): PillarConfig {
  return pillars[key?.toLowerCase()] || pillars[getSharedPillar(key).key];
}

/** Format pillar label (STEM uppercase, others capitalized) */
export { formatPillar } from '@shared/pillars';
