/**
 * S2 lint: every `dangerouslySetInnerHTML` call in src/ must route its
 * __html value through `sanitizeHtml(...)` or `DOMPurify.sanitize(...)`.
 * Raw user/AI-authored HTML is an XSS vector.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const SRC = path.resolve(path.dirname(__filename), '..', '..');

const SAFE = /dangerouslySetInnerHTML\s*=\s*\{\{\s*__html:\s*(sanitizeHtml|sanitizeBasicHtml|textToSafeHtml|DOMPurify\.sanitize)\s*\(/;
const ANY = /dangerouslySetInnerHTML/;

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      out.push(...walk(p));
    } else if (/\.(jsx?|tsx?)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe('S2 — dangerouslySetInnerHTML sanitization', () => {
  it('every site uses sanitizeHtml/DOMPurify.sanitize', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      const text = fs.readFileSync(file, 'utf8');
      if (!ANY.test(text)) continue;
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line.includes('dangerouslySetInnerHTML')) continue;
        // Allow the comment/doc examples in sanitize.js itself.
        if (file.endsWith(path.join('utils', 'sanitize.js'))) continue;
        // Check this line and the next for the sanitizer call (props may span lines).
        const window = (line + ' ' + (lines[i + 1] || '') + ' ' + (lines[i + 2] || ''));
        if (!SAFE.test(window)) {
          offenders.push(`${path.relative(SRC, file)}:${i + 1}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
