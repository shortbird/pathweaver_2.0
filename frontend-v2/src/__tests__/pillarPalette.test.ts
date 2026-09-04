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
 * The known divergence. These assertions describe what the repo says TODAY,
 * on purpose. They are not endorsements: each one is a file that should end up
 * matching CANONICAL, and when someone flips them this test fails and names
 * the rest of the work.
 */
describe('v1 and backend/config still disagree about civics and wellness', () => {
  const SWAPPED_FILES = [
    'frontend/tailwind.config.js',
    'frontend/src/constants/brandStyles.js',
    'frontend/src/utils/pillarMappings.js',
    'backend/config/pillars.py',
  ];

  /** The first civics/wellness hex after the pillar's key, whatever the syntax. */
  const colourFor = (src: string, key: string): string | null => {
    const at = src.toLowerCase().indexOf(key);
    if (at < 0) return null;
    const m = /#(FF9028|E65C5C)/i.exec(src.slice(at, at + 400));
    return m ? `#${m[1].toUpperCase()}` : null;
  };

  it.each(SWAPPED_FILES)('%s still has them the other way round', (rel) => {
    const src = read(rel);
    const civics = colourFor(src, 'civics');
    const wellness = colourFor(src, 'wellness');
    if (civics !== '#E65C5C' || wellness !== '#FF9028') {
      throw new Error(
        `${rel} now has civics=${civics} wellness=${wellness}, so somebody has ` +
        'started fixing the swap. Good -- finish it: every file in SWAPPED_FILES ' +
        'must match shared/pillars.json (civics #FF9028 orange, wellness #E65C5C ' +
        'red), then delete this block. Half done is worse than either end state, ' +
        'because then two halves of one screen disagree.');
    }
  });

  it('is contradicted by v1\'s own designated source, which is the tell', () => {
    // DESIGN_SYSTEM.md points at pillarMappings.js as v1's pillar source. In
    // that file civics carries color '#E65C5C' (red) alongside
    // bg-orange-50/text-orange-700 -- the Tailwind classes say orange while the
    // hex says red, in the same object. The hex is the field that drifted.
    const src = read('frontend/src/utils/pillarMappings.js');
    const civics = src.slice(src.indexOf('civics: {'), src.indexOf('wellness: {'));
    expect(civics).toContain('#E65C5C');
    expect(civics).toContain('orange');
  });

  it('is not shared by the backend consumer that computes pillar colours', () => {
    // backend/utils/pillar_utils.py agrees with shared/pillars.json and with
    // the brand doc, so the backend disagrees with ITSELF too.
    const src = read('backend/utils/pillar_utils.py');
    const civics = src.slice(src.indexOf("'civics': {"), src.indexOf("'wellness': {"));
    expect(civics).toContain('#FF9028');
  });
});
