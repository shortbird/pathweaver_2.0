/**
 * Glass Animation Presets - Shared animation utilities for the liquid glass system.
 *
 * Provides materialization, dematerialization, morph, and spring presets
 * that align with the design philosophy.
 */

import {
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  SharedValue,
  WithSpringConfig,
  WithTimingConfig,
} from 'react-native-reanimated';
import { tokens } from '../theme/tokens';

// ── Spring Configs ───────────────────────────────────────────

/** Default interactive spring -- bouncy, responsive */
export const springDefault: WithSpringConfig = {
  damping: tokens.animation.spring.damping,
  stiffness: tokens.animation.spring.stiffness,
};

/** Touch response spring -- snappy, minimal overshoot */
export const springTouch: WithSpringConfig = {
  damping: 20,
  stiffness: 300,
};

/** Morph spring -- smooth, elegant transitions between states */
export const springMorph: WithSpringConfig = {
  damping: 18,
  stiffness: 120,
};

/** Heavy spring -- for large elements, slower and more weighty */
export const springHeavy: WithSpringConfig = {
  damping: 22,
  stiffness: 80,
};

// ── Timing Configs ───────────────────────────────────────────

export const timingFast: WithTimingConfig = {
  duration: tokens.animation.timing.fast,
  easing: Easing.out(Easing.cubic),
};

export const timingNormal: WithTimingConfig = {
  duration: tokens.animation.timing.normal,
  easing: Easing.out(Easing.cubic),
};

export const timingSlow: WithTimingConfig = {
  duration: tokens.animation.timing.slow,
  easing: Easing.out(Easing.cubic),
};

// ── Materialization ──────────────────────────────────────────

/**
 * Materialize: Element appears by modulating blur (blurry to sharp).
 * Returns opacity and blur values to animate.
 */
export function materialize(
  opacity: SharedValue<number>,
  blur: SharedValue<number>,
  reduceMotion = false,
) {
  if (reduceMotion) {
    opacity.value = withTiming(1, { duration: 200 });
    blur.value = 0;
    return;
  }
  opacity.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) });
  blur.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
}

/**
 * Dematerialize: Element disappears by defocusing (sharp to blurry).
 */
export function dematerialize(
  opacity: SharedValue<number>,
  blur: SharedValue<number>,
  reduceMotion = false,
) {
  if (reduceMotion) {
    opacity.value = withTiming(0, { duration: 200 });
    blur.value = 0;
    return;
  }
  opacity.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) });
  blur.value = withTiming(20, { duration: 200, easing: Easing.in(Easing.cubic) });
}

// ── Touch Scale ──────────────────────────────────────────────

/** Press down: scale to 0.97 with snappy spring */
export function pressDown(scale: SharedValue<number>, reduceMotion = false) {
  if (reduceMotion) {
    scale.value = 0.97;
    return;
  }
  scale.value = withSpring(0.97, springTouch);
}

/** Press up: bounce back to 1.0 */
export function pressUp(scale: SharedValue<number>, reduceMotion = false) {
  if (reduceMotion) {
    scale.value = 1;
    return;
  }
  scale.value = withSpring(1, springDefault);
}

// ── Blob Drift ───────────────────────────────────────────────

/**
 * Create a slow drift animation for background blobs.
 * Returns a looping offset value that oscillates between -range and +range.
 */
export function blobDrift(
  value: SharedValue<number>,
  range: number,
  duration: number,
) {
  value.value = withSequence(
    withTiming(range, { duration: duration / 2, easing: Easing.inOut(Easing.sin) }),
    withTiming(-range, { duration, easing: Easing.inOut(Easing.sin) }),
    withTiming(0, { duration: duration / 2, easing: Easing.inOut(Easing.sin) }),
  );
}

// ── Scroll Shadow ────────────────────────────────────────────

/**
 * Interpolate shadow depth based on scroll offset.
 * Returns a shadow opacity multiplier (0 to 1).
 */
export function scrollShadowOpacity(scrollY: number, threshold = 10): number {
  if (scrollY <= 0) return 0;
  if (scrollY >= threshold) return 1;
  return scrollY / threshold;
}
