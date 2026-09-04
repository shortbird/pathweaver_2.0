/**
 * Guard: one pillar palette, and a record of the one place that disagrees (QF-01).
 *
 * The five pillars had their colours written out in eight places across the
 * repo, and two of those places disagree with the other six about which of
 * civics and wellness is orange. That is not a tidiness problem: the SAME
 * pillar renders orange in the mobile app and red on the web, on every badge,
 * chart and filter chip.
 *
 * shared/pillars.json is now the definition, and this file holds the line in
 * two directions:
 *
 *   1. Everything wired to it must actually derive from it, not re-declare it.
 *   2. The files that still disagree are pinned by name and exact value, so
 *      the disagreement cannot spread or be forgotten, and so whoever resolves
 *      it gets a failing test naming every file to change.
 *
 * WHY THE DISAGREEMENT IS STILL HERE: flipping two colours changes what users
 * see on every pillar surface of the production web app. The evidence points
 * one way (below), but it is a brand decision, not a refactor, so it is written
 * up in the Open Questions of docs/audit-2026-08/REMEDIATION_PLAN.md rather
 * than made silently inside a deduplication commit.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { PILLARS, PILLAR_KEYS, getPillar, formatPillar } from '@shared/pillars';
import { pillars, pillarShortLabels } from '../config/pillars';

const REPO = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

/** What shared/pillars.json says, and what six of the eight sources agree on. */
const CANONICAL: Record<string, string> = {
  stem: '#2469D1',
  art: '#AF56E5',
  communication: '#3DA24A',
  civics: '#FF9028',
  wellness: '#E65C5C',
};

describe('the shared pillar palette', () => {
  it('is the five pillars, in a stable order', () => {
    expect(PILLAR_KEYS).toEqual(['stem', 'art', 'communication', 'civics', 'wellness']);
  });

  it('matches the brand reference in docs/COLOR_REFERENCE.md', () => {
    for (const p of PILLARS) {
      if (p.color !== CANONICAL[p.key]) {
        throw new Error(
          `shared/pillars.json says ${p.key} is ${p.color}; docs/COLOR_REFERENCE.md ` +
          `says ${CANONICAL[p.key]}. Change the doc and this test together, or not at all.`);
      }
    }
  });

  it('formats STEM as STEM, not Stem', () => {
    // Both apps had grown their own copy of this one special case.
    expect(formatPillar('stem')).toBe('STEM');
    expect(formatPillar('art')).toBe('Art');
  });

  it('falls back rather than returning undefined for a bad key', () => {
    expect(getPillar('not-a-pillar').key).toBe('stem');
    expect(getPillar(null).key).toBe('stem');
  });
});

describe("v2 derives from it rather than copying it", () => {
  it('takes label and colour from shared, for every pillar', () => {
    for (const p of PILLARS) {
      expect(pillars[p.key].color).toBe(p.color);
      expect(pillars[p.key].label).toBe(p.label);
      expect(pillarShortLabels[p.key]).toBe(p.shortLabel);
    }
  });

  it('keeps only the mobile-only half locally', () => {
    // Icons and NativeWind classes mean nothing to the web app, so they stay.
    for (const p of PILLARS) {
      expect(pillars[p.key].icon).toBeTruthy();
      expect(pillars[p.key].bgClass).toContain(`pillar-${p.key}`);
    }
  });

  it("does not hardcode a pillar hex in the mobile config or tailwind", () => {
    for (const rel of ['frontend-v2/src/config/pillars.ts', 'frontend-v2/tailwind.config.js']) {
      const src = read(rel);
      const hits = Object.values(CANONICAL).filter((hex) => src.includes(hex));
      if (hits.length) {
        throw new Error(
          `${rel} spells out pillar hex ${hits.join(', ')} again. Derive it from ` +
          'shared/pillars.json -- a second copy is how these got out of sync.');
      }
    }
  });
});

/**
 * The divergence is over. Resolved 2026-09-04 on the user's call: the web app
 * and backend/config/pillars.py were flipped to match the brand reference, so
 * Civics is orange and Wellness is red on every surface.
 *
 * These assertions replace the ones that PINNED the old disagreement. They are
 * the reason it cannot come back: every place that spells a pillar hex is
 * checked against shared/pillars.json, including the -light/-dark shades and
 * gradients that only the web app has, which are the parts most likely to be
 * flipped back by someone matching them to a stale screenshot.
 */
describe('every surface now agrees with shared/pillars.json', () => {
  const SPELLS_PILLAR_HEXES = [
    'frontend/tailwind.config.js',
    'frontend/src/constants/brandStyles.js',
    'frontend/src/utils/pillarMappings.js',
    'backend/config/pillars.py',
    'backend/utils/pillar_utils.py',
  ];

  /** The first civics/wellness hex after the pillar's key, whatever the syntax. */
  const colourFor = (src: string, key: string): string | null => {
    for (const m of src.matchAll(new RegExp(key, 'gi'))) {
      const hit = /#(FF9028|E65C5C)/i.exec(src.slice(m.index! + key.length, m.index! + key.length + 300));
      if (hit) return `#${hit[1].toUpperCase()}`;
    }
    return null;
  };

  it.each(SPELLS_PILLAR_HEXES)('%s has civics orange and wellness red', (rel) => {
    const src = read(rel);
    expect({ civics: colourFor(src, 'civics'), wellness: colourFor(src, 'wellness') })
      .toEqual({ civics: CANONICAL.civics, wellness: CANONICAL.wellness });
  });

  it("v1's light and dark shades sit on the right base", () => {
    // The shades are web-only, so shared/pillars.json cannot carry them -- and
    // they are the half that gets flipped back, because they are picked by eye.
    // Wellness is the red family, civics the orange family.
    const tw = read('frontend/tailwind.config.js');
    expect(tw).toContain("'pillar-wellness-light': '#FBE5E5'");
    expect(tw).toContain("'pillar-wellness-dark': '#D43F3F'");
    expect(tw).toContain("'pillar-civics-light': '#FFF0E1'");
    expect(tw).toContain("'pillar-civics-dark': '#E67A1A'");
  });

  it("v1's pillarMappings tailwind classes agree with its own hex", () => {
    // This is the contradiction that identified which side was wrong: civics
    // carried color '#E65C5C' (red) beside bg-orange-50/text-orange-700. If the
    // two halves ever disagree again, the same bug is back.
    const src = read('frontend/src/utils/pillarMappings.js');
    const civics = src.slice(src.indexOf('civics: {'), src.indexOf('wellness: {'));
    const wellness = src.slice(src.indexOf('wellness: {'));
    expect(civics).toContain(CANONICAL.civics);
    expect(civics).toContain('orange');
    expect(wellness).toContain(CANONICAL.wellness);
    expect(wellness).toContain('red');
  });
});
