import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Ratchet: the biggest v1 components may shrink, never grow (QF-02).
 *
 * The backend has had this fence since Q1 (`test_route_file_sizes.py`) and it
 * works -- it caught `dependents.py` crossing 1400 lines earlier today, on a
 * comment. The frontend had no equivalent, and 733 .jsx files contain fifteen
 * over 1,000 lines:
 *
 *   1653  pages/courses/CourseHomepage.jsx      (5 components, 28 useState)
 *   1617  pages/RegisterFunnelPage.jsx
 *   1544  pages/sis/ClassesPage.jsx             (41 useState, 36 direct api calls)
 *   1414  pages/sis/BillingPage.jsx
 *   1299  pages/ScheduleBuilderPage.jsx
 *
 * ...and thirteen more over 1,000, which is why the exemption list below is
 * eighteen entries rather than the five the audit named. The audit picked the
 * two worst; the cap has to know about all of them or it fails on day one for
 * files nobody was asked to touch.
 *
 * Why size is worth fencing in a component and not just a route file: state
 * count scales with it. A 1,500-line page with 41 `useState` has more possible
 * states than anybody can hold in their head, so the bugs it produces are
 * "sometimes the save button stays disabled" -- unreproducible, and untestable
 * without first splitting the thing.
 *
 * This does NOT ask anyone to split them. Decomposition is behaviour-preserving
 * work that needs a browser, and QF-02 is still open for exactly that. It asks
 * that they stop growing, and that no SIXTEENTH file joins them.
 */

const SRC = path.resolve(__dirname, '..')

/** Nothing new may cross this. */
const CAP = 1000

/**
 * Files already over the cap, at their measured size plus a little headroom so
 * an incidental edit does not flip CI red. Measured 2026-09-03.
 * Remove an entry when the file is split -- do not raise one.
 *
 * SPLIT AND REMOVED (QF-02, 2026-09-04):
 *   pages/courses/CourseHomepage.jsx  1654 -> 848
 *   pages/sis/ClassesPage.jsx         1545 -> 706
 *   pages/sis/BillingPage.jsx         1415 -> 719
 */
const EXEMPT = {
  'pages/RegisterFunnelPage.jsx': 1670,
  'pages/ScheduleBuilderPage.jsx': 1340,
  'pages/DiplomaPage.jsx': 1270,
  'components/quest/TaskWorkspace.jsx': 1260,
  'components/quests/QuestPersonalizationWizard.jsx': 1230,
  'pages/sis/PriorLearningPage.jsx': 1230,
  'pages/admin/CourseGeneratorWizard.jsx': 1230,
  'components/sis/RegistrationSetupTab.jsx': 1210,
  'components/admin/QuestForm.jsx': 1190,
  'pages/sis/StaffPage.jsx': 1180,
  'pages/QuestDetail.jsx': 1090,
  'pages/admin/TranscriptGeneratorPage.jsx': 1130,
  'pages/sis/ReportsPage.jsx': 1070,
  'pages/sis/ClpPage.jsx': 1070,
}

function jsxFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      jsxFiles(full, acc)
    } else if (/\.jsx$/.test(entry.name) && !/\.test\.jsx$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

const measured = jsxFiles(SRC).map((f) => ({
  rel: path.relative(SRC, f).split(path.sep).join('/'),
  lines: fs.readFileSync(f, 'utf8').split('\n').length,
}))

describe('component size', () => {
  it('is looking at real files', () => {
    expect(measured.length).toBeGreaterThan(500)
  })

  it('no new file crosses the cap', () => {
    const offenders = measured
      .filter(({ rel, lines }) => lines > (EXEMPT[rel] ?? CAP))
      .map(({ rel, lines }) => `${rel}: ${lines} (limit ${EXEMPT[rel] ?? CAP})`)
      .sort()
    expect(
      offenders,
      `Split the component instead of raising the limit. A page this size has `
      + 'more possible states than anyone can hold in their head:\n  '
      + offenders.join('\n  '),
    ).toEqual([])
  })

  it('every exemption still names a real file', () => {
    // A stale exemption is a cap nobody is under. When a file is split or
    // renamed its entry has to go, or the next file to take that path inherits
    // a limit somebody granted to something else.
    const present = new Set(measured.map((m) => m.rel))
    const stale = Object.keys(EXEMPT).filter((rel) => !present.has(rel))
    expect(stale, `EXEMPT names files that no longer exist: ${stale.join(', ')}`)
      .toEqual([])
  })
})
