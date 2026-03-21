/**
 * useBuddyState - Runtime state hook for the buddy companion.
 *
 * Calculates decay on mount, handles feeding, tapping, and stage
 * evolution checks. Stage evolution is based on cumulative XP fed.
 * Daily feed cap prevents overfeeding.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  VITALITY_DECAY_RATE,
  BOND_DECAY_RATE,
  BOND_INCREMENT_FEED,
  BOND_INCREMENT_TAP,
  BOND_INCREMENT_OPEN,
  VITALITY_PER_XP,
  STAGE_THRESHOLDS,
  DAILY_XP_CAP,
  FOOD_CATALOG,
  type FoodItem,
  type FoodReactionType,
} from './buddyConstants';

export interface BuddyRecord {
  name: string;
  vitality: number;
  bond: number;
  stage: number;
  highest_stage: number;
  last_interaction: string;
  food_journal: string[] | null;
  equipped: Record<string, string>;
  wallet: number;
  total_xp_fed: number;
  xp_fed_today: number;
  last_fed_date: string | null;
}

export interface FeedResult {
  xpCost: number;
  foodId: string;
  isFirstTaste: boolean;
  newVitality: number;
  newBond: number;
  newTotalXpFed: number;
  newXpFedToday: number;
  didHatch: boolean;
}

export interface TapResult {
  newBond: number;
}

export interface EvolutionResult {
  newStage: number;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function useBuddyState(initialRecord: BuddyRecord) {
  const [vitality, setVitality] = useState(() => {
    const elapsed =
      (Date.now() - new Date(initialRecord.last_interaction).getTime()) /
      (1000 * 60 * 60);
    const decayed =
      initialRecord.vitality * Math.pow(VITALITY_DECAY_RATE, elapsed / 24);
    return Math.max(0, decayed);
  });

  const [bond, setBond] = useState(() => {
    const elapsed =
      (Date.now() - new Date(initialRecord.last_interaction).getTime()) /
      (1000 * 60 * 60);
    const decayed =
      initialRecord.bond * Math.pow(BOND_DECAY_RATE, elapsed / 24);
    return Math.max(initialRecord.bond * 0.5, decayed);
  });

  const [stage, setStage] = useState(() => {
    // Regress at most one stage if inactive for 7+ days, but never below stage 1
    if (initialRecord.stage <= 1) return initialRecord.stage;
    const elapsed =
      (Date.now() - new Date(initialRecord.last_interaction).getTime()) /
      (1000 * 60 * 60 * 24);
    if (elapsed >= 7) {
      return initialRecord.stage - 1;
    }
    return initialRecord.stage;
  });
  const [totalXpFed, setTotalXpFed] = useState(initialRecord.total_xp_fed || 0);
  const [feedReaction, setFeedReaction] = useState<FoodReactionType | null>(null);
  const [tapBurst, setTapBurst] = useState(0);
  const feedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Daily feed tracking -- reset if it's a new day
  const [xpFedToday, setXpFedToday] = useState(() => {
    const lastDate = initialRecord.last_fed_date;
    if (!lastDate || lastDate !== todayStr()) return 0;
    return initialRecord.xp_fed_today || 0;
  });

  const isFull = xpFedToday >= DAILY_XP_CAP;
  const feedsRemaining = Math.floor((DAILY_XP_CAP - xpFedToday) / 10);

  // Record screen open as bond interaction
  useEffect(() => {
    setBond((b) => Math.min(1, b + BOND_INCREMENT_OPEN));
  }, []);

  const feed = useCallback(
    (foodItem: FoodItem): FeedResult | null => {
      if (feedReaction) return null;
      if (isFull) return null;

      const food = FOOD_CATALOG.find((f) => f.id === foodItem.id) || foodItem;
      const boost = food.xpCost * VITALITY_PER_XP;
      const newTotal = totalXpFed + food.xpCost;
      const newToday = xpFedToday + food.xpCost;

      // Hatch when cumulative XP reaches the threshold
      const didHatch = stage === 0 && newTotal >= STAGE_THRESHOLDS[1].xpRequired;
      if (didHatch) {
        setStage(1);
      }

      setFeedReaction(food.type);
      setVitality((v) => Math.min(1, v + boost));
      setBond((b) => Math.min(1, b + BOND_INCREMENT_FEED));
      setTotalXpFed(newTotal);
      setXpFedToday(newToday);

      if (feedTimeout.current) clearTimeout(feedTimeout.current);
      feedTimeout.current = setTimeout(() => setFeedReaction(null), 2000);

      return {
        xpCost: food.xpCost,
        foodId: food.id,
        isFirstTaste: !initialRecord.food_journal?.includes(food.id),
        newVitality: Math.min(1, vitality + boost),
        newBond: Math.min(1, bond + BOND_INCREMENT_FEED),
        newTotalXpFed: newTotal,
        newXpFedToday: newToday,
        didHatch,
      };
    },
    [feedReaction, vitality, bond, totalXpFed, xpFedToday, isFull, stage, initialRecord],
  );

  const tap = useCallback((): TapResult | null => {
    if (feedReaction) return null;
    setTapBurst((t) => t + 1);
    setBond((b) => Math.min(1, b + BOND_INCREMENT_TAP));
    return { newBond: Math.min(1, bond + BOND_INCREMENT_TAP) };
  }, [feedReaction, bond]);

  // Check evolution based on cumulative XP fed (skip stage 1, handled by hatch)
  const checkEvolution = useCallback((): EvolutionResult | null => {
    const nextStage = stage + 1;
    if (nextStage <= 1 || nextStage > 6) return null;
    const threshold = STAGE_THRESHOLDS[nextStage];
    if (totalXpFed >= threshold.xpRequired) {
      setStage(nextStage);
      return { newStage: nextStage };
    }
    return null;
  }, [stage, totalXpFed]);

  return {
    vitality,
    bond,
    stage,
    totalXpFed,
    xpFedToday,
    isFull,
    feedsRemaining,
    feedReaction,
    tapBurst,
    feed,
    tap,
    checkEvolution,
    setVitality,
    setBond,
    setStage,
  };
}
