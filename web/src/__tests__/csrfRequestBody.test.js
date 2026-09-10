/**
 * A mutating request always carries a body, even when it has nothing to say.
 *
 * `api.post('/api/badges/123/select')` fails. `api.post('/api/badges/123/select', {})`
 * works. The difference is that axios only sets `Content-Type: application/json`
 * when there is data to send, and the CSRF middleware rejects a mutating request
 * that arrives without it -- the user sees "Content-Type must be application/json",
 * which names the symptom and not the cause, on a button that looks like it
 * simply does nothing.
 *
 * This lived in CLAUDE.md under "Common Patterns" with a correct and an
 * incorrect example. It is decidable, so it is a test now.
 *
 * The codebase is at ZERO today, in both apps, which is why this asserts zero
 * rather than ratcheting. That is not luck -- it is a rule people have been
 * following by hand, and the point of writing it down mechanically is that
 * they no longer have to.
 *
 * Both apps are walked. The web app is the one with cookie auth and therefore
 * the one CSRF applies to, but the mobile app calls the same endpoints through
 * the same axios instance shape, and a one-argument post there is a bug waiting
 * for the day it runs on the web target.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const ROOTS = [
  path.join(REPO, 'web', 'src'),
  path.join(REPO, 'mobile', 'src'),
  path.join(REPO, 'mobile', 'app'),
]

const EXT = ['.js', '.jsx', '.ts', '.tsx']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.expo', 'build', '__mocks__'])

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(full, acc)
    } else if (EXT.includes(path.extname(entry.name))) {
      acc.push(full)
    }
  }
  return acc
}

/**
 * `api.post(<one argument>)` -- the argument may be a template literal, a
 * quoted string, or an expression, but there is no comma at the top level.
 *
 * Nested parentheses and brackets are tracked so that
 * `api.post(buildUrl(id, kind), {})` is not read as a single argument, and a
 * comma inside `api.post(\`/x/${a[0]}\`, {})` is not read as the separator.
 */
const CALL = /\bapi\.(post|put|patch)\s*\(/g

function isSingleArgument(source, openIndex) {
  let depth = 0
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i]
    if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' || char === ']' || char === '}') {
      depth -= 1
      if (depth === 0) return true // closed without ever seeing a top-level comma
    } else if (char === ',' && depth === 1) return false
  }
  return false
}

function findViolations() {
  const violations = []
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      if (/\.test\.[jt]sx?$/.test(file)) continue
      const source = fs.readFileSync(file, 'utf8')
      let match
      CALL.lastIndex = 0
      while ((match = CALL.exec(source)) !== null) {
        const openIndex = match.index + match[0].length - 1
        if (!isSingleArgument(source, openIndex)) continue
        const line = source.slice(0, match.index).split('\n').length
        violations.push(
          `${path.relative(REPO, file)}:${line}: api.${match[1]}(...) with no body`
        )
      }
    }
  }
  return violations
}

describe('mutating requests carry a body', () => {
  it('no api.post/put/patch is called with a URL alone', () => {
    const violations = findViolations()
    expect(
      violations,
      'Add an empty object: api.post(url, {}). Without a body axios omits '
        + 'Content-Type, and the CSRF middleware rejects the request with an '
        + 'error that names the header rather than the cause.'
    ).toEqual([])
  })

  it('the scan reads both apps', () => {
    // A walk that finds nothing passes forever. Both roots must have files,
    // and the pattern must find real two-argument calls to prove it matches
    // the shape at all.
    const files = ROOTS.flatMap((root) => walk(root))
    expect(files.length).toBeGreaterThan(1000)

    const withBody = files
      .filter((f) => !/\.test\.[jt]sx?$/.test(f))
      .reduce((total, file) => {
        const source = fs.readFileSync(file, 'utf8')
        CALL.lastIndex = 0
        let count = 0
        let match
        while ((match = CALL.exec(source)) !== null) count += 1
        return total + count
      }, 0)
    expect(withBody).toBeGreaterThan(100)
  })
})
