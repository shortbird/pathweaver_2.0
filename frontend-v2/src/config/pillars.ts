/**
 * Pillar config - Single source of truth for pillar colors, icons, and labels.
 * Used across dashboard, journal, feed, bounties, and any pillar reference.
 */

import { Ionicons } from '@expo/vector-icons';

export interface PillarConfig {
  key: string;
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFilled: keyof typeof Ionicons.glyphMap;
  bgClass: string;
  textClass: string;
}

export const pillars: Record<string, PillarConfig> = {
  stem: {
    key: 'stem',
    label: 'STEM',
    color: '#2469D1',
    icon: 'flask-outline',
    iconFilled: 'flask',
    bgClass: 'bg-pillar-stem/15',
    textClass: 'text-pillar-stem',
  },
  art: {
    key: 'art',
    label: 'Art',
    color: '#AF56E5',
    icon: 'color-palette-outline',
    iconFilled: 'color-palette',
    bgClass: 'bg-pillar-art/15',
    textClass: 'text-pillar-art',
  },
  communication: {
    key: 'communication',
    label: 'Communication',
    color: '#3DA24A',
    icon: 'chatbubbles-outline',
    iconFilled: 'chatbubbles',
    bgClass: 'bg-pillar-communication/15',
    textClass: 'text-pillar-communication',
  },
  civics: {
    key: 'civics',
    label: 'Civics',
    color: '#FF9028',
    icon: 'globe-outline',
    iconFilled: 'globe',
    bgClass: 'bg-pillar-civics/15',
    textClass: 'text-pillar-civics',
  },
  wellness: {
    key: 'wellness',
    label: 'Wellness',
    color: '#E65C5C',
    icon: 'fitness-outline',
    iconFilled: 'fitness',
    bgClass: 'bg-pillar-wellness/15',
    textClass: 'text-pillar-wellness',
  },
};

export const pillarKeys = Object.keys(pillars);

/** Short labels for tight spaces (mobile filters) */
export const pillarShortLabels: Record<string, string> = {
  stem: 'STEM',
  art: 'Art',
  communication: 'Comm',
  civics: 'Civics',
  wellness: 'Wellness',
};

/** Get pillar config with fallback */
export function getPillar(key: string): PillarConfig {
  return pillars[key?.toLowerCase()] || pillars.stem;
}

/** Format pillar label (STEM uppercase, others capitalized) */
export function formatPillar(key: string): string {
  if (key?.toLowerCase() === 'stem') return 'STEM';
  return key?.charAt(0).toUpperCase() + key?.slice(1);
}
