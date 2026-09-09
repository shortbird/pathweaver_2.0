/**
 * Ratchet: the web app's ESLint findings may shrink, never grow.
 *
 * ESLint has never run on this app. web/package.json carried an `eslintConfig`
 * block that `extends: ["react-app"]` -- a Create React App preset, in a Vite
 * project with no react-scripts and no eslint dependency -- so the two rules it
 * declared, one of them the C2 token-storage security control, read as enforced
 * and were not. That is CI-03. `eslint.config.js` now exists, mirrors
 * mobile/eslint.config.js rule for rule, and runs.
 *
 * Its first run over 1,344 files reported 292 errors and 2,183 warnings. Fixing
 * those is not the job: 273,000 lines of JSX written without a linter will
 * always have a backlog, and a one-shot cleanup of that size is a change to
 * every screen in the product. What matters is that the number stops growing --
 * the same disposition CI-02 gave direct DB calls and QF-03 gave hand-rolled
 * fetches.
 *
 * WHAT THE FIRST RUN FOUND THAT IS A REAL BUG. Recorded here rather than fixed,
 * because this phase is structural (see PHASE_3_HANDOFF.md, "Bugs found, not
 * fixed"). Each of these is a `no-undef` on an identifier that is read at
 * runtime and never bound -- a ReferenceError the moment that line executes:
 *
 *   src/utils/animations.js               React        (no React import at all)
 *   src/components/ui/PhilosophyCard.jsx  Heart, TrendingUp, Clock
 *   src/components/admin/ServiceInquiries.jsx  Clock, Mail, CheckCircle
 *   src/components/demo/ConversionPanel.jsx    formatPrice
 *   src/components/diploma/DiplomaHeader.jsx   text, primary
 *   src/components/diploma/DiplomaStats.jsx    text, primary
 *   src/components/diploma/SkillsBreakdown.jsx text, primary, pillarInfo
 *   src/pages/SchoolPage.jsx              9x duplicate object key 'module'
 *
 * Also 5 `console.debug` calls that the vitest re-implementation of no-console
 * never saw, because it matched only `console.log`. They are counted in the
 * baseline below rather than converted.
 *
 * HOW TO LOWER THE NUMBERS. Run `npm run lint`, fix things, then set the two
 * constants to what it reports. `npm run lint:fix` autofixes the 205
 * unused-imports errors, which is the single biggest block; that is a real
 * change to 200 files and belongs in its own commit, not bundled with a
 * feature.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Measured 2026-09-09 on the first run. Ratchet DOWN, never up. */
const ERROR_BASELINE = 292
const WARNING_BASELINE = 2183

/**
 * Slack, so ordinary churn does not force an edit to this file on every commit,
 * but a real cleanup still has to lower the number. Same shape as
 * dataFetchingParadigm.test.js's SLACK.
 */
const SLACK = 60

let report

beforeAll(() => {
  // --format json to stdout. eslint exits non-zero whenever anything is an
  // error, which is the normal state here, so the exit code is not the signal
  // -- the parsed report is.
  let stdout
  try {
    stdout = execFileSync(
      'npx',
      ['eslint', 'src', '--format', 'json'],
      { cwd: WEB_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    )
  } catch (err) {
    stdout = err.stdout
  }
  report = JSON.parse(stdout)
}, 300_000)

const errors = () => report.reduce((n, f) => n + f.errorCount, 0)
const warnings = () => report.reduce((n, f) => n + f.warningCount, 0)

describe('eslint ratchet', () => {
  it('is looking at real files', () => {
    // Every ratchet of this shape regresses by globbing nothing and passing
    // forever. eslint reporting on 0 files is indistinguishable from a clean
    // codebase in the counts alone.
    expect(report.length).toBeGreaterThan(1000)
  })

  it('errors do not grow', () => {
    const n = errors()
    expect(
      n,
      `${n} eslint errors, baseline ${ERROR_BASELINE}. Run \`npm run lint\` in `
      + 'web/ to see them. If you fixed things, lower ERROR_BASELINE.',
    ).toBeLessThanOrEqual(ERROR_BASELINE)
  })

  it('warnings do not grow', () => {
    const n = warnings()
    expect(
      n,
      `${n} eslint warnings, baseline ${WARNING_BASELINE}. Run \`npm run lint\` `
      + 'in web/ to see them. If you fixed things, lower WARNING_BASELINE.',
    ).toBeLessThanOrEqual(WARNING_BASELINE)
  })

  it('has baselines that still mean something', () => {
    expect(
      errors(),
      `Only ${errors()} errors against a baseline of ${ERROR_BASELINE}. `
      + `Lower ERROR_BASELINE to ${errors()}.`,
    ).toBeGreaterThan(ERROR_BASELINE - SLACK)
    expect(
      warnings(),
      `Only ${warnings()} warnings against a baseline of ${WARNING_BASELINE}. `
      + `Lower WARNING_BASELINE to ${warnings()}.`,
    ).toBeGreaterThan(WARNING_BASELINE - SLACK)
  })
})
