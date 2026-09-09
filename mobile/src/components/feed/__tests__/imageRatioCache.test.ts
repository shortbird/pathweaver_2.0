/**
 * imageRatioCache — remembers measured aspect ratios so a remounted feed image
 * renders at its final height instead of resizing the row after layout.
 */

import {
  getImageRatio, setImageRatio, clampRatio, clearImageRatios,
  MIN_RATIO, MAX_RATIO, DEFAULT_RATIO,
} from '../imageRatioCache';

beforeEach(() => clearImageRatios());

describe('clampRatio', () => {
  it('returns the natural ratio inside the allowed range', () => {
    expect(clampRatio(1200, 900)).toBeCloseTo(4 / 3);
  });

  it('clamps a panorama and a tall scan so neither dominates the feed', () => {
    expect(clampRatio(6000, 500)).toBe(MAX_RATIO);
    expect(clampRatio(500, 6000)).toBe(MIN_RATIO);
  });
});

describe('get/setImageRatio', () => {
  it('round-trips a measured ratio', () => {
    setImageRatio('https://cdn/a.jpg', 1.5);
    expect(getImageRatio('https://cdn/a.jpg')).toBe(1.5);
  });

  it('returns undefined for an unseen image so the caller can fall back', () => {
    expect(getImageRatio('https://cdn/never-seen.jpg')).toBeUndefined();
    expect(getImageRatio(null)).toBeUndefined();
    expect(getImageRatio(undefined)).toBeUndefined();
  });

  it('ignores a missing uri', () => {
    expect(() => setImageRatio(null, 1.2)).not.toThrow();
    expect(getImageRatio(null)).toBeUndefined();
  });

  it('stays bounded over a long session, keeping the most recent entries', () => {
    for (let i = 0; i < 2100; i++) setImageRatio(`https://cdn/${i}.jpg`, 1 + i / 10000);
    // Oldest evicted, newest retained — a miss only costs one re-measure.
    expect(getImageRatio('https://cdn/0.jpg')).toBeUndefined();
    expect(getImageRatio('https://cdn/2099.jpg')).toBeDefined();
  });
});

describe('DEFAULT_RATIO', () => {
  it('is the 4:3 placeholder used before an image has loaded', () => {
    expect(DEFAULT_RATIO).toBeCloseTo(4 / 3);
  });
});
