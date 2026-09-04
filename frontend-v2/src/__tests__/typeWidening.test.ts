/**
 * Ratchet: explicit `any` in the mobile app may shrink, never grow (QF-09).
 *
 * 580 of them across 110 files. Converting all of them is a large piece of work
 * that has not been funded and would touch nearly every screen, so this does
 * not ask anyone to. It asks that the number stop climbing while the decision
 * is pending -- the same fence `test_direct_db_calls_do_not_grow` puts around
 * the backend's repository-pattern debt.
 *
 * Why `any` is worth fencing rather than shrugging at: every one of them is a
 * place the compiler has been told to stop checking. In a codebase where the
 * API returns snake_case JSON into camelCase components, `as any` is exactly
 * how a renamed field ships as `undefined` and renders as a blank card instead
 * of a type error.
 *
 * Ratchet DOWN as files are typed. Never up.
 */

import fs from 'fs'
import path from 'path'

// __dirname, not import.meta: this suite runs under jest with the Hermes-style
// babel preset, which does not support import.meta without a polyfill.
const ROOT = path.resolve(__dirname, '../..')

/** Measured 2026-09-03. Lower this as `any` is removed. */
const BASELINE = 580

/** How far below the baseline the real count may drift before this nags. */
const SLACK = 60

const ANY = /:\s*any\b|<any>|\bas any\b|\bany\[\]/g

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      sourceFiles(full, acc)
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

function countAny(): { total: number; files: number } {
  let total = 0
  let files = 0
  for (const dir of ['src', 'app']) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      let n = 0
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const t = line.trim()
        // A comment explaining why something is `any` should not count as one.
        if (t.startsWith('//') || t.startsWith('*')) continue
        n += (line.match(ANY) || []).length
      }
      if (n) { total += n; files += 1 }
    }
  }
  return { total, files }
}

describe('explicit any', () => {
  // jest's expect takes one argument, unlike vitest's -- so the explanation
  // goes in a thrown Error rather than a second parameter.
  it('does not grow', () => {
    const { total, files } = countAny()
    if (total > BASELINE) {
      throw new Error(
        `${total} explicit \`any\` across ${files} files, baseline ${BASELINE}. `
        + 'Each one is a place the compiler was told to stop checking. Type the '
        + 'new code rather than raising this number.',
      )
    }
    expect(total).toBeLessThanOrEqual(BASELINE)
  })

  it('has a baseline that still means something', () => {
    // A ratchet that never tightens is just a number. If the real count has
    // fallen well below the baseline, lower the baseline.
    const { total } = countAny()
    if (total <= BASELINE - SLACK) {
      throw new Error(
        `Only ${total} explicit \`any\` against a baseline of ${BASELINE}. `
        + `Lower BASELINE to ${total}.`,
      )
    }
    expect(total).toBeGreaterThan(BASELINE - SLACK)
  })

  it('is looking at real files', () => {
    const files = ['src', 'app'].flatMap((d) => sourceFiles(path.join(ROOT, d)))
    expect(files.length).toBeGreaterThan(200)
  })
})
