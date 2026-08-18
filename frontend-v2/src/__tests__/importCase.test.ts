/**
 * Relative imports must match the real filename's case.
 *
 * Development happens on macOS, whose filesystem is case-insensitive, and CI
 * runs on Linux, whose filesystem is not. So `import { UIText } from '../Text'`
 * against a file named `text.tsx` resolves fine on a laptop and fails the build
 * — which is exactly what happened on 2026-08-18: green locally, red in CI with
 * "Cannot find module '../Text'".
 *
 * The TypeScript step in CI does report this (TS2307), but it is marked
 * informational because of a backlog of pre-existing errors, so it cannot fail
 * the build. This can.
 *
 * `fs.existsSync` is itself case-insensitive on macOS, so the check compares
 * against the real directory listing rather than asking whether the path
 * exists.
 */

import fs from 'fs';
import path from 'path';

const ROOTS = ['src', 'app'];
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);
// The suffixes a bare relative specifier may resolve through.
const RESOLUTIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.json',
  '/index.ts', '/index.tsx', '/index.js'];

const IMPORT_RE = /(?:from|require\()\s*['"](\.[^'"]+)['"]/g;

/** Comments are not code. Without this the checker reports the example in its
 *  own header, and any doc block that quotes an import path. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (SOURCE_EXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

/** True when this specifier resolves to a file whose name matches exactly. */
function resolvesWithExactCase(fromFile: string, specifier: string): boolean {
  const target = path.resolve(path.dirname(fromFile), specifier);
  for (const suffix of RESOLUTIONS) {
    const candidate = target + suffix;
    const dir = path.dirname(candidate);
    if (!fs.existsSync(dir)) continue;
    // readdirSync gives the real names, so this is the case-sensitive test.
    if (fs.readdirSync(dir).includes(path.basename(candidate))) return true;
  }
  return false;
}

describe('relative imports are case-correct', () => {
  const files = ROOTS.flatMap((r) => (fs.existsSync(r) ? sourceFiles(r) : []));

  it('finds source files to check', () => {
    // Guard the guard: an empty sweep would pass silently forever.
    expect(files.length).toBeGreaterThan(100);
  });

  it('every relative import matches the real filename on a case-sensitive disk', () => {
    const broken: string[] = [];
    for (const file of files) {
      const text = stripComments(fs.readFileSync(file, 'utf8'));
      for (const match of text.matchAll(IMPORT_RE)) {
        const specifier = match[1];
        if (!resolvesWithExactCase(file, specifier)) {
          broken.push(`${file} -> '${specifier}'`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
