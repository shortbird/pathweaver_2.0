/**
 * Session cache of measured image aspect ratios, keyed by URL.
 *
 * A feed image doesn't know its own shape until it has loaded, so the card
 * renders at a placeholder ratio and then corrects itself in `onLoad`. That
 * changes the row's height AFTER the list has measured it, forcing FlatList to
 * recompute content size and correct its scroll offset — the jank you feel when
 * images pop in, and the reason `removeClippedSubviews` had to be turned off.
 *
 * We can't avoid that the first time we see an image. We can avoid paying it
 * again: once measured, a URL's ratio is remembered, so a row that remounts
 * (scroll back, tab away and return, cell recycle) renders at its final height
 * immediately.
 *
 * Session-scoped and deliberately not persisted — prefsStore is async
 * SecureStore, far too slow to consult during a render.
 */

export const DEFAULT_RATIO = 4 / 3;
/** Clamp so an extreme panorama or a very tall scan can't dominate the feed. */
export const MIN_RATIO = 0.5;
export const MAX_RATIO = 2.5;

// Bounded so a long session can't grow this without limit. Entries are tiny
// (a URL and a number) and eviction only costs a re-measure on next load.
const MAX_ENTRIES = 2000;

const ratios = new Map<string, number>();

export function clampRatio(width: number, height: number): number {
  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, width / height));
}

export function getImageRatio(uri: string | null | undefined): number | undefined {
  return uri ? ratios.get(uri) : undefined;
}

export function setImageRatio(uri: string | null | undefined, ratio: number): void {
  if (!uri) return;
  if (ratios.size >= MAX_ENTRIES && !ratios.has(uri)) {
    // Map preserves insertion order, so this drops the oldest entry.
    const oldest = ratios.keys().next().value;
    if (oldest !== undefined) ratios.delete(oldest);
  }
  ratios.set(uri, ratio);
}

/** Test seam. */
export function clearImageRatios(): void {
  ratios.clear();
}
