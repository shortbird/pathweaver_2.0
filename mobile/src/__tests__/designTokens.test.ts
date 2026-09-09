/**
 * Design-token guard: NativeWind silently generates nothing for a class whose
 * token step doesn't exist in tailwind.config.js (e.g. text-typo-600 when the
 * typo scale is DEFAULT/700/500/400/300), so the text just inherits whatever
 * color is above it. ~118 call sites shipped that way (Aug 2026). This test
 * scans every source file for numbered typo/surface/brand-surface steps and
 * fails on any step the config doesn't define.
 *
 * If you add a step to tailwind.config.js, add it to ALLOWED_STEPS here too.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const SCAN_DIRS = ['app', 'src'];

// Mirrors tailwind.config.js. `dark-` variants share the same steps.
const ALLOWED_STEPS: Record<string, number[]> = {
  typo: [300, 400, 500, 700],
  surface: [50, 100, 200, 300],
  'brand-surface': [50, 100, 200],
};

const TOKEN_RE = /\b(?:dark-)?(typo|brand-surface|surface)-(\d+)\b/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('design tokens', () => {
  it('only references typo/surface/brand-surface steps that exist in tailwind.config.js', () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of walk(path.join(ROOT, dir))) {
        const text = fs.readFileSync(file, 'utf8');
        for (const match of text.matchAll(TOKEN_RE)) {
          const [token, scale, step] = [match[0], match[1], Number(match[2])];
          if (!ALLOWED_STEPS[scale].includes(step)) {
            const line = text.slice(0, match.index).split('\n').length;
            offenders.push(`${path.relative(ROOT, file)}:${line} ${token}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
