/**
 * Buddy Constants - Palettes, scales, food catalog, and tuning values.
 *
 * All buddy behavior is driven by these constants. Change them to
 * rebalance the system without touching component code.
 */

// ── Stage color palettes ──
export interface StagePalette {
  body: string;
  belly: string;
  cheek: string;
  name: string;
  glow: string;
}

export const STAGE_PALETTES: StagePalette[] = [
  { body: '#B4B2A9', belly: '#D3D1C7', cheek: '#C8C6BD', name: 'Egg',       glow: '#B4B2A9' },
  { body: '#5DCAA5', belly: '#9FE1CB', cheek: '#FF9EBA', name: 'Hatchling', glow: '#5DCAA5' },
  { body: '#85B7EB', belly: '#B5D4F4', cheek: '#FF9EBA', name: 'Sprout',    glow: '#85B7EB' },
  { body: '#AFA9EC', belly: '#CECBF6', cheek: '#FF9EBA', name: 'Buddy',     glow: '#AFA9EC' },
  { body: '#ED93B1', belly: '#F4C0D1', cheek: '#FFBD5A', name: 'Pal',       glow: '#ED93B1' },
  { body: '#EF9F27', belly: '#FAC775', cheek: '#FF6B8A', name: 'Champion',  glow: '#EF9F27' },
  { body: '#E24B4A', belly: '#F09595', cheek: '#FFBD5A', name: 'Legend',    glow: '#E24B4A' },
];

// ── Size multiplier per stage ──
export const STAGE_SCALES: number[] = [0.5, 0.55, 0.65, 0.8, 0.92, 1.0, 1.1];

// ── Food reaction types ──
export type FoodReactionType = 'crunch' | 'sweet' | 'spicy' | 'soupy' | 'chewy' | 'novel';

export interface FoodItem {
  id: string;
  name: string;
  emoji: string;
  type: FoodReactionType;
  xpCost: number;
  stageUnlock: number;
  rotation: 'permanent' | 'rotating';
}

export const FOOD_CATALOG: FoodItem[] = [
  // Permanent staples
  { id: 'apple',       name: 'Apple',       emoji: '\u{1F34E}', type: 'crunch', xpCost: 5,  stageUnlock: 1, rotation: 'permanent' },
  { id: 'bread',       name: 'Bread',       emoji: '\u{1F35E}', type: 'chewy',  xpCost: 5,  stageUnlock: 1, rotation: 'permanent' },
  { id: 'milk',        name: 'Milk',        emoji: '\u{1F95B}', type: 'soupy',  xpCost: 5,  stageUnlock: 1, rotation: 'permanent' },

  // Rotating items
  { id: 'onigiri',     name: 'Onigiri',     emoji: '\u{1F359}', type: 'chewy',  xpCost: 10, stageUnlock: 2, rotation: 'rotating' },
  { id: 'ramen',       name: 'Ramen',       emoji: '\u{1F35C}', type: 'soupy',  xpCost: 15, stageUnlock: 2, rotation: 'rotating' },
  { id: 'mochi',       name: 'Mochi',       emoji: '\u{1F361}', type: 'sweet',  xpCost: 10, stageUnlock: 2, rotation: 'rotating' },
  { id: 'tamales',     name: 'Tamales',     emoji: '\u{1FAD4}', type: 'spicy',  xpCost: 12, stageUnlock: 2, rotation: 'rotating' },
  { id: 'taco',        name: 'Taco',        emoji: '\u{1F32E}', type: 'spicy',  xpCost: 12, stageUnlock: 3, rotation: 'rotating' },
  { id: 'pad_thai',    name: 'Pad Thai',    emoji: '\u{1F35D}', type: 'chewy',  xpCost: 12, stageUnlock: 3, rotation: 'rotating' },
  { id: 'pierogi',     name: 'Pierogi',     emoji: '\u{1F95F}', type: 'chewy',  xpCost: 10, stageUnlock: 3, rotation: 'rotating' },
  { id: 'pho',         name: 'Pho',         emoji: '\u{1F372}', type: 'soupy',  xpCost: 15, stageUnlock: 4, rotation: 'rotating' },
  { id: 'jollof',      name: 'Jollof Rice', emoji: '\u{1F35B}', type: 'spicy',  xpCost: 12, stageUnlock: 4, rotation: 'rotating' },
  { id: 'sushi',       name: 'Sushi',       emoji: '\u{1F363}', type: 'novel',  xpCost: 20, stageUnlock: 5, rotation: 'rotating' },

  // Legendary
  { id: 'golden_apple', name: 'Golden Apple', emoji: '\u{1F34F}', type: 'novel', xpCost: 30, stageUnlock: 6, rotation: 'permanent' },
];

// ── Decay rates (per 24 hours of inactivity) ──
export const VITALITY_DECAY_RATE = 0.92;
export const BOND_DECAY_RATE = 0.98;

// ── Interaction increments ──
export const BOND_INCREMENT_FEED = 0.03;
export const BOND_INCREMENT_TAP = 0.005;
export const BOND_INCREMENT_EQUIP = 0.02;
export const BOND_INCREMENT_OPEN = 0.01;

// ── Vitality boost per XP spent ──
export const VITALITY_PER_XP = 0.015;

// ── Daily feed cap ──
export const DAILY_XP_CAP = 50;

// ── Stage thresholds (cumulative XP fed) ──
// Fast early progression, exponentially slower later.
// At 10 XP per feed: 1 feed to hatch, 2 more to Sprout, etc.
export interface StageThreshold {
  stage: number;
  xpRequired: number;  // cumulative XP fed to reach this stage
}

export const STAGE_THRESHOLDS: StageThreshold[] = [
  { stage: 0, xpRequired: 0 },      // Egg (start)
  { stage: 1, xpRequired: 20 },     // Hatchling  (2 feeds -- hatch on day 1)
  { stage: 2, xpRequired: 60 },     // Sprout     (6 feeds -- day 2 earliest)
  { stage: 3, xpRequired: 150 },    // Buddy      (15 feeds -- day 3+)
  { stage: 4, xpRequired: 350 },    // Pal        (35 feeds -- week 1+)
  { stage: 5, xpRequired: 800 },    // Champion   (80 feeds -- week 3+)
  { stage: 6, xpRequired: 1800 },   // Legend     (180 feeds -- month 2+)
];
