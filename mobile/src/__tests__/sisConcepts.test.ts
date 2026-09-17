/**
 * The mobile half of the SIS concept manifest (shared/sisConcepts.json).
 *
 * The console's duplicated concepts are mostly a backend and web story, but
 * the phone carries its own copies of a few -- the school feed is re-merged
 * client-side with a title-and-day heuristic that shows an edited announcement
 * twice, for one. The backend and web tests (backend/tests/unit/
 * test_sis_concepts.py, web/src/__tests__/sisConcepts.test.js) explain the
 * manifest; this applies the rows that name `forbid.mobile` with the same
 * scanning rules, so a count here means the same thing as a count there.
 *
 * Per row: a ceiling (no more copies than the baseline), a floor (no fewer --
 * a removed copy lowers the baseline in the same commit), and freshness of the
 * owner. Mirrors importCase.test.ts in method: read the files, strip the
 * comments, regex the code.
 */

import fs from 'fs';
import path from 'path';

import manifest from '@shared/sisConcepts.json';

const MOBILE = path.resolve(__dirname, '../..');
const SIDE = 'mobile';

const SOURCE_EXT = /\.tsx?$/;
const TEST_FILE = /\.(test|spec)\.tsx?$/;
const SKIP_DIRS = new Set(['node_modules', '__tests__', 'tests']);
const BLOCK = /(^|[^\w"'`/])\/\*[\s\S]*?\*\//gm;

type SideConfig = {
  pattern?: string;
  dirs?: string[];
  files?: string[];
  unit?: 'lines' | 'files';
  exempt?: string[];
};
type Row = {
  id: string;
  means: string;
  owner?: Record<string, string[]>;
  proposed?: boolean;
  forbid?: Record<string, SideConfig>;
  baseline: Record<string, number>;
  lowered_by: string;
  use_instead: string;
};

function codeLines(text: string): string[] {
  const stripped = text.replace(BLOCK, (m, pre: string) => pre + '\n'.repeat((m.slice(pre.length).match(/\n/g) || []).length));
  return stripped.split('\n').map((line) => {
    const s = line.trimStart();
    if (s.startsWith('//') || s.startsWith('*')) return '';
    const idx = line.indexOf(' // ');
    return idx >= 0 ? line.slice(0, idx) : line;
  });
}

function filesUnder(rel: string, acc: string[] = []): string[] {
  const base = path.join(MOBILE, rel);
  if (fs.existsSync(base) && fs.statSync(base).isFile()) {
    acc.push(rel);
    return acc;
  }
  if (!fs.existsSync(base)) return acc;
  for (const entry of fs.readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(base, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) filesUnder(path.relative(MOBILE, full), acc);
    } else if (SOURCE_EXT.test(entry.name) && !TEST_FILE.test(entry.name)) {
      acc.push(path.relative(MOBILE, full).split(path.sep).join('/'));
    }
  }
  return acc;
}

function scan(row: Row): string[] {
  const forbid = row.forbid![SIDE];
  const exempt = new Set(forbid.exempt ?? row.owner?.[SIDE] ?? []);
  let hits: string[] = [];
  if (forbid.pattern) {
    const rx = new RegExp(forbid.pattern);
    const seen = new Set<string>();
    for (const entry of forbid.dirs || []) {
      for (const rel of filesUnder(entry)) {
        if (seen.has(rel) || exempt.has(rel)) continue;
        seen.add(rel);
        codeLines(fs.readFileSync(path.join(MOBILE, rel), 'utf8')).forEach((line, i) => {
          if (rx.test(line)) hits.push(`${rel}:${i + 1}`);
        });
      }
    }
  }
  if (forbid.unit === 'files') hits = [...new Set(hits.map((h) => h.slice(0, h.lastIndexOf(':'))))].sort();
  for (const rel of forbid.files || []) {
    if (fs.existsSync(path.join(MOBILE, rel))) hits.push(`${rel} (exists)`);
  }
  return hits;
}

function explain(row: Row, hits: string[]): string {
  return [
    '',
    `Concept \`${row.id}\`: ${row.means}`,
    `Owner: ${row.owner?.[SIDE]?.join(', ') || '(none on this side)'}${row.proposed ? ` (proposed; created by ${row.lowered_by})` : ''}`,
    'Copies found:',
    ...(hits.length ? hits.map((h) => `    ${h}`) : ['    (none)']),
    `Use instead: ${row.use_instead}`,
    `Manifest: shared/sisConcepts.json (lowered by ${row.lowered_by}).`,
  ].join('\n');
}

const rows = (manifest.concepts as Row[]).filter((r) => r.forbid && r.forbid[SIDE]);

describe('shared/sisConcepts.json, mobile side', () => {
  it('finds at least one row for this side', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  for (const row of rows) {
    describe(row.id, () => {
      it('gains no new copies', () => {
        const hits = scan(row);
        const baseline = row.baseline[SIDE];
        if (hits.length > baseline) {
          throw new Error(`${hits.length} copies of \`${row.id}\` against a baseline of ${baseline}.${explain(row, hits)}`);
        }
      });

      it('has a baseline that still means something', () => {
        const hits = scan(row);
        const baseline = row.baseline[SIDE];
        if (hits.length < baseline) {
          throw new Error(
            `Only ${hits.length} copies of \`${row.id}\` against a baseline of ${baseline}. `
            + `If a copy was genuinely removed, lower baseline.${SIDE} to ${hits.length} in `
            + 'shared/sisConcepts.json in this commit. If not, the scan is broken: check '
            + `forbid.${SIDE}.dirs and the pattern.${explain(row, hits)}`,
          );
        }
      });

      it('names an owner that is real, or says it is proposed', () => {
        const owners = row.owner?.[SIDE] || [];
        if (!owners.length) return;
        const missing = owners.filter((o) => !fs.existsSync(path.join(MOBILE, o)));
        if (row.proposed) {
          if (!missing.length) {
            throw new Error(`\`${row.id}\` is marked proposed but every mobile owner exists. ${row.lowered_by} has shipped: remove \`proposed\`.`);
          }
        } else if (missing.length) {
          throw new Error(`\`${row.id}\` names an owner that does not exist: ${missing.join(', ')}.`);
        }
      });
    });
  }

  it('the scan reads real files', () => {
    const scanned = filesUnder('src/components');
    expect(scanned.length).toBeGreaterThan(20);
    expect(scanned.some((p) => TEST_FILE.test(p))).toBe(false);
    const lines = codeLines(fs.readFileSync(path.join(MOBILE, 'src/components/school/SchoolFeed.tsx'), 'utf8'));
    expect(lines.filter((l) => l.trim()).length).toBeGreaterThan(40);
  });
});
