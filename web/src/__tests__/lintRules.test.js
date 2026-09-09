/**
 * The two rules package.json declared, now enforced by ESLint -- and checked
 * here to be at zero.
 *
 * HISTORY. web/package.json carried an `eslintConfig` block declaring
 * `no-console` and a `no-restricted-syntax` rule banning auth-token writes to
 * localStorage. Neither had ever run: eslint was not a dependency, there was
 * no `lint` script, and the config `extends: ["react-app"]` -- a Create React
 * App preset, in a project that is Vite. So this file re-implemented both as
 * regex scans over the source, because vitest was the only thing CI gated
 * (CI-03).
 *
 * ESLint now exists (`eslint.config.js`, `npm run lint`) and owns both rules,
 * so the regex scans are gone. They were a lossy copy in both directions: the
 * no-console scan matched only `console.log`, which is why five `console.debug`
 * calls sat in shipped code for months under a rule whose declared form allows
 * only `warn` and `error`; and the localStorage scan had to strip comments by
 * hand to avoid matching a mention in a docstring, which an AST selector never
 * does.
 *
 * WHY THIS FILE STILL EXISTS. `eslintRatchet.test.js` caps the TOTAL error
 * count, so a new violation of either rule does turn it red -- but it turns red
 * saying "293 errors, baseline 292", which does not tell a reader that they
 * just put a refresh token in localStorage. These two rules earn a named guard:
 * one is a security control (C2 / ADR-001), and the other is the convention the
 * whole codebase's logging rests on.
 *
 * So this asserts two things the ratchet cannot: that the rules are still
 * CONFIGURED (deleting a rule from eslint.config.js would lower the count, not
 * raise it -- a ratchet reads that as an improvement), and that the C2 rule is
 * at exactly zero.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * The five console.debug calls the regex scan never saw. Counted, not fixed:
 * converting them to logger.debug gates output that currently prints, and this
 * phase is structural. They are in PHASE_3_HANDOFF.md.
 */
const CONSOLE_BASELINE = 5

let report
let effectiveConfig

beforeAll(() => {
  let stdout
  try {
    stdout = execFileSync(
      'npx',
      ['eslint', 'src', '--format', 'json'],
      { cwd: WEB_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    )
  } catch (err) {
    // eslint exits non-zero whenever anything is an error, which is the normal
    // state of this codebase. The report is the signal, not the exit code.
    stdout = err.stdout
  }
  report = JSON.parse(stdout)

  // What ESLint ACTUALLY applies to a shipped source file, resolved through
  // every config block. Reading eslint.config.js as a module instead would
  // load its plugins inside vitest's browser-shaped environment, which some of
  // them refuse; and reading it as text would pass on a rule that is declared
  // but overridden to 'off' three blocks later.
  effectiveConfig = JSON.parse(execFileSync(
    'npx',
    ['eslint', '--print-config', 'src/services/api.js'],
    { cwd: WEB_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
  ))
}, 300_000)

/** Every finding for one rule, as `path:line`. */
function findings(ruleId) {
  const out = []
  for (const file of report) {
    for (const message of file.messages) {
      if (message.ruleId === ruleId) {
        out.push(`${path.relative(WEB_ROOT, file.filePath)}:${message.line}`)
      }
    }
  }
  return out
}

describe('the scan itself', () => {
  it('is looking at real files', () => {
    // This shape of test regresses by linting nothing and passing forever.
    expect(report.length).toBeGreaterThan(1000)
  })
})

describe('C2: auth tokens never reach localStorage', () => {
  it('is a configured rule, not a comment', () => {
    // A ratchet on totals cannot catch the deletion of a rule: removing it
    // lowers the count, which reads as an improvement. Assert the config.
    const rule = effectiveConfig.rules['no-restricted-syntax']
    // --print-config normalises severities to numbers; 2 is 'error'.
    expect(rule[0], 'no-restricted-syntax must stay an error').toBe(2)
    const source = JSON.stringify(rule)
    expect(source).toContain('localStorage')
    expect(source).toContain('sessionStorage')
    for (const key of ['access_token', 'refresh_token', 'masquerade_token', 'session_encryption_key']) {
      expect(source, `${key} dropped from the banned-key list`).toContain(key)
    }
  })

  it('nothing writes a credential key to web storage', () => {
    const offenders = findings('no-restricted-syntax')
    expect(
      offenders,
      'Tokens live in memory + httpOnly cookies (docs/ADR-001-token-storage.md), '
      + `never in web storage:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })
})

describe('no-console', () => {
  it('is a configured rule, and still allows warn and error', () => {
    const rule = effectiveConfig.rules['no-console']
    expect(rule[0], 'no-console must stay an error in shipped code').toBe(2)
    // warn and error are how the app reports real problems. Banning them would
    // push people back to console.log, which is the thing being prevented.
    expect(rule[1].allow).toEqual(['warn', 'error'])
  })

  it('console statements do not multiply', () => {
    const offenders = findings('no-console')
    expect(
      offenders,
      `${offenders.length} console statements, baseline ${CONSOLE_BASELINE}. `
      + `Use logger.debug() instead:\n  ${offenders.join('\n  ')}`,
    ).toHaveLength(CONSOLE_BASELINE)
  })
})
