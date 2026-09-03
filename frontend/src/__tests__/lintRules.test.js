/**
 * The two lint rules package.json declares, enforced.
 *
 * `eslintConfig` in frontend/package.json has carried `no-console` and a
 * `no-restricted-syntax` rule banning auth-token writes to localStorage for a
 * long time. Neither has ever run: eslint is not a devDependency, there is no
 * `lint` script, and the config `extends: ["react-app"]` -- a Create React App
 * preset, in a project that is Vite. So the config is a statement of intent
 * that no build has ever checked.
 *
 * The second rule is the one that matters. It is the C2 security control:
 * tokens live in memory plus httpOnly cookies (docs/ADR-001-token-storage.md),
 * and a single localStorage.setItem('access_token', ...) undoes that for every
 * user on the machine. A security rule that is configured and unenforced is
 * worse than one that was never written down -- it reads as covered.
 *
 * These run in vitest, which CI already gates on. Standing up eslint properly
 * is CI-03's remaining half and is not a five-minute job: the preset has to be
 * replaced, the plugins added, and the first run triaged.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Files where the rule genuinely does not apply, each with a reason. */
const CONSOLE_ALLOWED = new Set([
  // The logger IS the console wrapper. Banning it here would mean banning the
  // implementation of the thing everything else is told to use.
  path.join('utils', 'logger.js'),
])

function sourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      sourceFiles(full, acc)
    } else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

/** Strip line and block comments so a commented-out call is not a finding. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const FILES = sourceFiles(SRC)

describe('the scan itself', () => {
  it('is looking at real files', () => {
    // This shape of test regresses by globbing nothing and passing forever.
    expect(FILES.length).toBeGreaterThan(200)
  })
})

describe('no-console', () => {
  it('no console.log survives in src', () => {
    const offenders = []
    for (const file of FILES) {
      const rel = path.relative(SRC, file)
      if (CONSOLE_ALLOWED.has(rel)) continue
      const body = stripComments(fs.readFileSync(file, 'utf8'))
      body.split('\n').forEach((line, i) => {
        if (/\bconsole\.log\s*\(/.test(line)) offenders.push(`${rel}:${i + 1}`)
      })
    }
    expect(offenders, `use logger.debug() instead:\n  ${offenders.join('\n  ')}`)
      .toEqual([])
  })

  it('console.warn and console.error are deliberately still allowed', () => {
    // The package.json rule allows them, and they are how the app reports real
    // problems. Banning them would push people back to console.log.
    const anyWarnOrError = FILES.some((f) =>
      /\bconsole\.(warn|error)\s*\(/.test(fs.readFileSync(f, 'utf8')))
    expect(anyWarnOrError).toBe(true)
  })
})

describe('C2: auth tokens never reach localStorage', () => {
  const BANNED_KEYS = [
    'access_token', 'refresh_token', 'app_access_token', 'app_refresh_token',
    'user', 'original_admin_token', 'masquerade_token', 'session_encryption_key',
  ]

  it('nothing writes a credential key to localStorage or sessionStorage', () => {
    const pattern = new RegExp(
      `(localStorage|sessionStorage)\\s*\\.\\s*setItem\\s*\\(\\s*['"\`](${BANNED_KEYS.join('|')})['"\`]`)
    const offenders = []
    for (const file of FILES) {
      const body = stripComments(fs.readFileSync(file, 'utf8'))
      body.split('\n').forEach((line, i) => {
        if (pattern.test(line)) offenders.push(`${path.relative(SRC, file)}:${i + 1}`)
      })
    }
    expect(offenders, `tokens live in memory + httpOnly cookies (ADR-001), never `
      + `in web storage:\n  ${offenders.join('\n  ')}`).toEqual([])
  })

  it('the detector fires on the shape it bans', () => {
    // Every version of this that regressed did so by matching nothing.
    const pattern = new RegExp(
      `(localStorage|sessionStorage)\\s*\\.\\s*setItem\\s*\\(\\s*['"\`](${BANNED_KEYS.join('|')})['"\`]`)
    expect(pattern.test("localStorage.setItem('access_token', t)")).toBe(true)
    expect(pattern.test('sessionStorage.setItem("refresh_token", t)')).toBe(true)
    expect(pattern.test("localStorage.setItem('theme', 'dark')")).toBe(false)
  })
})
