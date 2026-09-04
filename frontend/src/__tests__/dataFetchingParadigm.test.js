import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Ratchet: pages that fetch by hand may shrink, never grow (QF-03).
 *
 * Two data-fetching paradigms live in v1. `hooks/api/` (react-query) is the one
 * the codebase decided on; calling `api.get()` inside a `useEffect` is the one
 * most pages actually do. Measured 2026-09-03 across 174 pages:
 *
 *   12  use hooks/api or react-query
 *  108  call api.* directly, with no hook
 *
 * The item is explicit that this is NOT a big-bang rewrite: migrate the
 * highest-churn pages first, and make new or touched pages use `hooks/api/`.
 * That is what a ratchet is for. Nobody has to migrate anything to keep this
 * green; a page that is REWRITTEN in the old style turns it red.
 *
 * What the hand-rolled style actually costs, so this reads as more than
 * consistency: no request dedupe (two components mounting the same page fetch
 * twice), no cache (a back-navigation refetches everything), no shared
 * retry/backoff, and every page inventing its own loading and error state --
 * which is also how QF-05's silent-empty-section pattern spreads.
 */

const PAGES = path.resolve(__dirname, '../pages')

/** Measured 2026-09-03. Ratchet DOWN as pages migrate. */
const HAND_ROLLED_BASELINE = 108
const SLACK = 15

const USES_HOOK = /useQuery|useMutation|hooks\/api/
const CALLS_API = /\bapi\.(get|post|put|patch|delete)\s*\(/

function pageFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      pageFiles(full, acc)
    } else if (/\.jsx$/.test(entry.name) && !/\.test\.jsx$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

function census() {
  let hooked = 0
  const handRolled = []
  for (const file of pageFiles(PAGES)) {
    const body = fs.readFileSync(file, 'utf8')
    if (USES_HOOK.test(body)) hooked += 1
    else if (CALLS_API.test(body)) handRolled.push(path.relative(PAGES, file))
  }
  return { hooked, handRolled }
}

describe('data-fetching paradigm', () => {
  it('is looking at real pages', () => {
    expect(pageFiles(PAGES).length).toBeGreaterThan(100)
  })

  it('hand-rolled pages do not multiply', () => {
    const { handRolled } = census()
    expect(
      handRolled.length,
      `${handRolled.length} pages fetch by hand, baseline ${HAND_ROLLED_BASELINE}. `
      + 'New and rewritten pages belong in hooks/api/ -- the hand-rolled style '
      + 'has no request dedupe, no cache, no shared retry, and reinvents '
      + 'loading and error state every time.',
    ).toBeLessThanOrEqual(HAND_ROLLED_BASELINE)
  })

  it('has a baseline that still means something', () => {
    const { handRolled } = census()
    expect(
      handRolled.length,
      `Only ${handRolled.length} hand-rolled pages against a baseline of `
      + `${HAND_ROLLED_BASELINE}. Lower HAND_ROLLED_BASELINE to ${handRolled.length}.`,
    ).toBeGreaterThan(HAND_ROLLED_BASELINE - SLACK)
  })

  it('the hooks/api directory it points people at still exists', () => {
    // The ratchet names a destination. If that directory were ever removed the
    // message would be telling people to migrate into nothing.
    const hooksApi = path.resolve(__dirname, '../hooks/api')
    expect(fs.existsSync(hooksApi)).toBe(true)
    expect(fs.readdirSync(hooksApi).length).toBeGreaterThan(5)
  })
})
