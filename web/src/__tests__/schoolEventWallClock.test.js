import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { codeLines, filesUnder } from '../tests/sourceScan.js'

/**
 * School event stamps are formatted in one place. The web port of
 * mobile/src/__tests__/schoolEventWallClock.test.ts.
 *
 * `sis_events.start_at` / `end_at` do not name an instant. The office types
 * "18:30" and routes/sis/events.py stores that string into a timestamptz, so
 * Postgres tags it +00 without converting. The stamp is a wall clock wearing a
 * UTC label, and only a reader that formats it in UTC shows what the office
 * meant. Read it as an instant and Denver sees 12:30.
 *
 * The bug has shipped three times, each time as a new reader of the stamps
 * written without the rule: the 10am Hang Time that a parent's calendar put at
 * 4am (Perch 1d0d41a9), "NO CLASS - LABOR DAY" on the wrong day, and the 6:30
 * Moms' Group Night that reached every Denver parent as 12:30 (Marika,
 * 2026-09-15: "this would likely explain our low turnout"). Mobile fixed its
 * side by centralising the rule in components/school/format.ts with this
 * test's twin (c88c70c0). The web still has five readers with their own
 * formatting, two of which share function names and disagree, and one of
 * which (CommunityPage's fmtDateTime, the admin's own event list) formats a
 * timed event in local time today.
 *
 * The rule enforced: a source file that reads a school event's stamps may not
 * format a Date itself. It imports the label from utils/timeFormat.js, the one
 * file allowed to hold such a call for these stamps. `getDate`/`getDay` are
 * left off the list, unlike the mobile test, because both calendar pages walk
 * a month grid built from `new Date(year, month, 1)`, which is legitimately
 * local; the stamp itself they read by slicing the string.
 *
 * BASELINE is per file, measured 2026-09-17, and is exact both ways: M12 in
 * docs/sis/CONSOLIDATION_PLAN.md lowers each entry to zero and removes it.
 */

const SRC = path.resolve(__dirname, '..')
const FORMATTER = 'utils/timeFormat.js'

/** A file reads school event stamps when it touches `.start_at`/`.end_at`
 *  and is in the school world. Class meetings have their own `start_at` and
 *  are somebody else's rule. */
const STAMP_RE = /\.(start_at|end_at)\b/
const SCHOOL_RE = /all_day|sis\/events|sis\/parent\/events|sis\/community|SchoolEvent|school-calendar/

/** Methods that turn a Date into text in the viewer's zone. `toLocaleString`
 *  counts only when it is asked for a date part; a number's toLocaleString
 *  (money) is not a clock. */
const LOCAL_TIME_RE = /\.(toLocaleTimeString|toLocaleDateString|toLocaleString|getHours|getMinutes)\s*\(([^)]*)\)/g
const DATE_PART_RE = /hour|minute|weekday|month|day/

/** Baseline: offending calls per reader, measured 2026-09-17. Lowered by M12. */
const BASELINE = {
  'components/announcements/SchoolCommunity.jsx': 3,
  'pages/FamilyCalendarPage.jsx': 2,
  'pages/sis/CommunityPage.jsx': 2,
  'pages/sis/SisDashboard.jsx': 2,
}

function readers() {
  return filesUnder(SRC, '.').filter((rel) => {
    const code = codeLines(fs.readFileSync(path.join(SRC, rel), 'utf8')).join('\n')
    return STAMP_RE.test(code) && SCHOOL_RE.test(code)
  })
}

function offenders(rel) {
  const code = codeLines(fs.readFileSync(path.join(SRC, rel), 'utf8')).join('\n')
  const out = []
  for (const m of code.matchAll(LOCAL_TIME_RE)) {
    if (m[1] === 'toLocaleString' && !DATE_PART_RE.test(m[2])) continue
    const line = code.slice(0, m.index).split('\n').length
    out.push(`${rel}:${line} calls .${m[1]}()`)
  }
  return out
}

describe('school event stamps are formatted only in utils/timeFormat.js', () => {
  const files = readers()

  it('finds the known readers, so an empty sweep cannot pass silently', () => {
    expect(files).toEqual(expect.arrayContaining([
      'pages/sis/CalendarPage.jsx',
      'pages/FamilyCalendarPage.jsx',
      'pages/sis/SisDashboard.jsx',
    ]))
  })

  it('no reader outside the formatter formats a Date, beyond the baseline', () => {
    const found = {}
    for (const rel of files) {
      if (rel === FORMATTER) continue
      const hits = offenders(rel)
      if (hits.length) found[rel] = hits
    }
    const added = Object.entries(found)
      .filter(([rel, hits]) => hits.length > (BASELINE[rel] || 0))
      .flatMap(([, hits]) => hits)
    expect(
      added,
      'A reader of school event stamps formats a Date itself. Import the label from '
      + 'utils/timeFormat.js instead (fmtEventWhen / fmtEventTimeRange / fmtDayHeading after '
      + 'M12; until then, add nothing here -- the four files in BASELINE are the whole debt).',
    ).toEqual([])
  })

  it('has a baseline that still means something', () => {
    // A file that stopped offending comes out of BASELINE in the same commit;
    // slack left behind is the fraction of the fix that can be undone silently.
    const stale = Object.entries(BASELINE)
      .map(([rel, n]) => [rel, n, files.includes(rel) ? offenders(rel).length : 0])
      .filter(([, n, actual]) => actual < n)
      .map(([rel, n, actual]) => `${rel}: baseline ${n}, found ${actual}`)
    expect(
      stale,
      'Lower or remove these BASELINE entries in this commit, and lower the event_wall_clock '
      + 'baseline in shared/sisConcepts.json if a `timeZone: UTC` spelling went with it.',
    ).toEqual([])
  })

  it('every time-of-day the formatter prints for an event is read in UTC', () => {
    // The formatter is the exception to the rule above, so it carries the
    // rule inline: each toLocaleTimeString call names the zone. Today the file
    // holds none (class times are HH:MM strings, formatted by to12h); M12 adds
    // the event helpers, and this is what keeps them honest.
    const code = codeLines(fs.readFileSync(path.join(SRC, FORMATTER), 'utf8')).join('\n')
    const calls = [...code.matchAll(/\.toLocaleTimeString\s*\(([\s\S]*?)\)\s*[;\n]/g)]
    const unzoned = calls.filter((m) => !/timeZone:\s*['"]UTC['"]/.test(m[1]))
    expect(unzoned.map((m) => m[0])).toEqual([])
  })
})
