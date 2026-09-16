/**
 * School event stamps are formatted in one place: components/school/format.ts.
 *
 * `sis_events.start_at` / `end_at` do not name an instant. The office types
 * "18:30" and routes/sis/events.py stores that string into a timestamptz, so
 * Postgres tags it +00 without converting. The stamp is a wall clock wearing a
 * UTC label, and only a reader that formats it in UTC shows what the office
 * meant. (EVENT_STAMPS_ARE_WALL_CLOCK in format.ts has the whole story.)
 *
 * The rule itself has been in format.ts since Perch 1d0d41a9. The bug shipped
 * a third time anyway: the calendar screen grew its own inline time label,
 * without the timeZone, and iCreate's 6:30 Moms' Group Night reached every
 * Denver parent as 12:30 (Marika, 2026-09-15). A rule that lives in one
 * function does not protect a second function somebody writes beside it.
 *
 * So this sweep enforces the shape, not the option: a source file that reads a
 * school event's stamps may not format a Date in local time. It imports the
 * label it needs from format.ts, which is unit-tested under a pinned Denver
 * timezone (globalSetup.js). Only format.ts itself may hold such a call.
 *
 * Mirrors importCase.test.ts in method — read the files, strip comments,
 * regex the code.
 */

import fs from 'fs';
import path from 'path';

const ROOTS = ['src', 'app'];
const SOURCE_EXT = new Set(['.ts', '.tsx']);

/** The one file allowed to turn an event stamp into text. */
const FORMATTER = path.normalize('src/components/school/format.ts');

/** A file is a reader of school event stamps when it touches `.start_at` or
 *  `.end_at` AND is in the school world — imports one of the school hooks or
 *  the formatter, fetches the events endpoint, or names the event type. Quest
 *  and class rows have their own `start_at` and are somebody else's rule. */
const STAMP_RE = /\.(start_at|end_at)\b/;
const SCHOOL_RE = /useSchool|useSchoolCalendar|components\/school\/format|sis\/parent\/events|SchoolEvent/;

/** Methods that read a Date in the device's zone. `getMonth` / `getFullYear`
 *  are left off: the month picker reads them off `new Date()` for the current
 *  month, which is legitimately local. */
const LOCAL_TIME_RE = /\.(toLocaleTimeString|toLocaleDateString|toLocaleString|getHours|getMinutes|getDate|getDay)\s*\(/g;

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (SOURCE_EXT.has(path.extname(entry.name)) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = ROOTS.flatMap((r) => (fs.existsSync(r) ? sourceFiles(r) : []));
const readers = files.filter((f) => {
  const code = stripComments(fs.readFileSync(f, 'utf8'));
  return STAMP_RE.test(code) && SCHOOL_RE.test(code);
});

describe('school event stamps are formatted only in format.ts', () => {
  it('finds the known readers, so an empty sweep cannot pass silently', () => {
    const names = readers.map((f) => path.normalize(f));
    // The calendar screen is deliberately absent: it hands the whole event to
    // fmtTimeRange and never touches the stamps itself. Its old inline label
    // did, and this sweep would have named it.
    expect(names).toEqual(expect.arrayContaining([
      FORMATTER,
      path.normalize('src/hooks/useSchoolCalendar.ts'),
    ]));
  });

  it('no reader outside format.ts formats a Date in local time', () => {
    const offenders: string[] = [];
    for (const file of readers) {
      if (path.normalize(file) === FORMATTER) continue;
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      for (const match of code.matchAll(LOCAL_TIME_RE)) {
        const line = code.slice(0, match.index).split('\n').length;
        offenders.push(`${file}:${line} calls .${match[1]}() — import the label from components/school/format.ts instead`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every time-of-day the formatter prints is read in UTC', () => {
    // The formatter is the exception to the rule above, so it carries the
    // rule inline: each toLocaleTimeString call names the zone. A date-only
    // label (fmtDate, for feed items that are real instants) is allowed to
    // stay local, so only the time calls are checked here; the behaviour tests
    // in components/school/__tests__/format.test.ts cover the rest.
    const code = stripComments(fs.readFileSync(FORMATTER, 'utf8'));
    const calls = [...code.matchAll(/\.toLocaleTimeString\s*\(([\s\S]*?)\)\s*;/g)];
    expect(calls.length).toBeGreaterThan(0);
    const unzoned = calls.filter((m) => !/timeZone:\s*['"]UTC['"]/.test(m[1]));
    expect(unzoned.map((m) => m[0])).toEqual([]);
  });
});
