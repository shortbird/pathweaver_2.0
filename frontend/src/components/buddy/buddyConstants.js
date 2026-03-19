// Stage color palettes - each stage has a unique color scheme
export const STAGE_PALETTES = [
  { body: "#B4B2A9", belly: "#D3D1C7", cheek: "#C8C6BD", name: "Egg",       glow: "#B4B2A9" },
  { body: "#5DCAA5", belly: "#9FE1CB", cheek: "#FF9EBA", name: "Hatchling", glow: "#5DCAA5" },
  { body: "#85B7EB", belly: "#B5D4F4", cheek: "#FF9EBA", name: "Sprout",    glow: "#85B7EB" },
  { body: "#AFA9EC", belly: "#CECBF6", cheek: "#FF9EBA", name: "Buddy",     glow: "#AFA9EC" },
  { body: "#ED93B1", belly: "#F4C0D1", cheek: "#FFBD5A", name: "Pal",       glow: "#ED93B1" },
  { body: "#EF9F27", belly: "#FAC775", cheek: "#FF6B8A", name: "Champion",  glow: "#EF9F27" },
  { body: "#E24B4A", belly: "#F09595", cheek: "#FFBD5A", name: "Legend",    glow: "#E24B4A" },
]

// Size multiplier per stage (Egg smallest, Legend largest)
export const STAGE_SCALES = [0.5, 0.55, 0.65, 0.8, 0.92, 1.0, 1.1]

// Food catalog - simplified for free feeding (no XP cost)
export const FOOD_CATALOG = [
  // Permanent staples (always available from stage 1)
  { id: "apple",       name: "Apple",       emoji: "\u{1F34E}", type: "crunch", stageUnlock: 1 },
  { id: "bread",       name: "Bread",       emoji: "\u{1F35E}", type: "chewy",  stageUnlock: 1 },
  { id: "milk",        name: "Milk",        emoji: "\u{1F95B}", type: "soupy",  stageUnlock: 1 },

  // Unlocked at later stages
  { id: "onigiri",     name: "Onigiri",     emoji: "\u{1F359}", type: "chewy",  stageUnlock: 2 },
  { id: "ramen",       name: "Ramen",       emoji: "\u{1F35C}", type: "soupy",  stageUnlock: 2 },
  { id: "mochi",       name: "Mochi",       emoji: "\u{1F361}", type: "sweet",  stageUnlock: 2 },
  { id: "tamales",     name: "Tamales",     emoji: "\u{1FAD4}", type: "spicy",  stageUnlock: 2 },
  { id: "taco",        name: "Taco",        emoji: "\u{1F32E}", type: "spicy",  stageUnlock: 3 },
  { id: "pad_thai",    name: "Pad Thai",    emoji: "\u{1F35D}", type: "chewy",  stageUnlock: 3 },
  { id: "pierogi",     name: "Pierogi",     emoji: "\u{1F95F}", type: "chewy",  stageUnlock: 3 },
  { id: "pho",         name: "Pho",         emoji: "\u{1F372}", type: "soupy",  stageUnlock: 4 },
  { id: "jollof",      name: "Jollof Rice", emoji: "\u{1F35B}", type: "spicy",  stageUnlock: 4 },
  { id: "sushi",       name: "Sushi",       emoji: "\u{1F363}", type: "novel",  stageUnlock: 5 },
  { id: "golden_apple", name: "Golden Apple", emoji: "\u{1F34F}", type: "novel", stageUnlock: 6 },
]

// Decay rates (per 24 hours)
export const VITALITY_DECAY_RATE = 0.92  // 8% decay
export const BOND_DECAY_RATE = 0.98      // 2% decay

// Interaction increments
export const BOND_INCREMENT_FEED = 0.03
export const BOND_INCREMENT_TAP = 0.005
export const BOND_INCREMENT_OPEN = 0.01

// Vitality boost per feed (flat since no XP cost)
export const VITALITY_PER_FEED = 0.08

// Daily feed limit
export const DAILY_FEED_LIMIT = 5

// Stage thresholds based on total feeds (cumulative)
export const STAGE_THRESHOLDS = [
  { stage: 0, feeds: 0 },     // Egg (start here)
  { stage: 1, feeds: 5 },     // Hatchling (~1 day)
  { stage: 2, feeds: 15 },    // Sprout (~3 days)
  { stage: 3, feeds: 35 },    // Buddy (~1 week)
  { stage: 4, feeds: 75 },    // Pal (~2 weeks)
  { stage: 5, feeds: 150 },   // Champion (~1 month)
  { stage: 6, feeds: 300 },   // Legend (~2 months)
]

/**
 * Calculate what stage a buddy should be at based on total feeds.
 */
export function getStageForFeeds(totalFeeds) {
  let stage = 0
  for (const threshold of STAGE_THRESHOLDS) {
    if (totalFeeds >= threshold.feeds) {
      stage = threshold.stage
    }
  }
  return stage
}

/**
 * Get feeds needed for the next stage.
 */
export function feedsToNextStage(totalFeeds, currentStage) {
  const nextThreshold = STAGE_THRESHOLDS.find(t => t.stage === currentStage + 1)
  if (!nextThreshold) return null
  return Math.max(0, nextThreshold.feeds - totalFeeds)
}
