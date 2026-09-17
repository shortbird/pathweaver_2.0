import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { codeLines } from '../tests/sourceScan.js'

/**
 * One <Route path> per path in App.jsx.
 *
 * React Router takes the first rule that matches and never says a second one
 * exists, so a duplicate is dead code that looks like a redirect: `/connections`
 * is declared at line ~625 (the friends page) and again at ~721 (a Navigate to
 * /dashboard, from before the page existed). Whichever a reader finds first
 * tells them what the URL does, and one of them is wrong. The backend has the
 * same rule for Flask blueprints (CLAUDE.md, "one route, one owner"; four
 * production bugs); this is the web side of it.
 *
 * The parser is deliberately small: it walks App.jsx's <Route ...> tags with a
 * brace-aware scanner (attributes like element={<X />} contain `>`), keeps a
 * stack of open layout routes so a nested relative path is joined to its
 * parents, and reads only literal `path="..."` attributes. Two paths are
 * legitimately declared twice and excluded: `/` (the HomeRoute leaf and the
 * Layout route that hosts everything else) and `*` (the catch-all).
 *
 * KNOWN_DUPLICATES is the baseline, measured 2026-09-17; M19 in
 * docs/sis/CONSOLIDATION_PLAN.md empties it. Equality both ways: a new
 * duplicate fails, and so does a fix that leaves its entry here.
 */

const APP = path.resolve(__dirname, '../App.jsx')
const IGNORE = new Set(['/', '*'])

/** Baseline: none. The second /connections rule went with M19 (2026-09-17). */
const KNOWN_DUPLICATES = []

function joinPath(parent, child) {
  if (child.startsWith('/') || !parent) return child
  const base = parent.endsWith('/') ? parent : `${parent}/`
  return `${base}${child}`.replace(/\/+/g, '/')
}

/** Every literal <Route path> in the file, joined to its layout parents. */
export function routePaths(source) {
  const code = codeLines(source).join('\n')
  const paths = []
  const stack = [] // open (non-self-closing) Route tags: their path or ''
  let i = 0
  while (i < code.length) {
    if (code.startsWith('</Route>', i)) {
      stack.pop()
      i += 8
      continue
    }
    if (code.startsWith('<Route', i) && /[\s>/]/.test(code[i + 6] || '')) {
      // scan to the closing `>` at brace depth 0, skipping quoted strings
      let j = i + 6
      let depth = 0
      let selfClosing = false
      while (j < code.length) {
        const c = code[j]
        if (depth === 0 && (c === '"' || c === "'")) {
          j = code.indexOf(c, j + 1)
          if (j < 0) throw new Error('unterminated string in a <Route> tag')
        } else if (c === '{') depth += 1
        else if (c === '}') depth -= 1
        else if (depth === 0 && c === '>') {
          selfClosing = code[j - 1] === '/'
          break
        }
        j += 1
      }
      const tag = code.slice(i, j + 1)
      const m = tag.match(/\spath="([^"]*)"/)
      const parent = stack.length ? stack[stack.length - 1] : ''
      const own = m ? joinPath(parent, m[1]) : parent
      if (m) paths.push(own)
      if (!selfClosing) stack.push(own)
      i = j + 1
      continue
    }
    i += 1
  }
  return paths
}

function duplicates(paths) {
  const seen = new Map()
  for (const p of paths) seen.set(p, (seen.get(p) || 0) + 1)
  return [...seen.entries()].filter(([p, n]) => n > 1 && !IGNORE.has(p)).map(([p]) => p).sort()
}

describe('App.jsx declares each route path once', () => {
  const source = fs.readFileSync(APP, 'utf8')
  const paths = routePaths(source)

  it('parses the route table, so an empty result cannot pass silently', () => {
    expect(paths.length).toBeGreaterThan(100)
    expect(paths).toContain('/')
    expect(paths).toContain('/connections/:peerId')
    expect(paths).toContain('/messages')
  })

  it('joins nested paths to their layout parents and reads self-closing tags', () => {
    const sample = [
      '<Routes>',
      '  <Route path="/" element={<Layout />}>',
      '    <Route element={<PrivateRoute allow={["parent"]} />}>',
      '      <Route path="family" element={<Family />} />',
      '      <Route path="family/:id" element={<Child kind={">"} />} />',
      '    </Route>',
      '    <Route path="admin" element={<Admin />}>',
      '      <Route path="tickets" element={<Tickets />} />',
      '    </Route>',
      '    <Route path="/absolute" element={<X />} />',
      '  </Route>',
      '  <Route path="*" element={<NotFound />} />',
      '</Routes>',
    ].join('\n')
    expect(routePaths(sample)).toEqual([
      '/', '/family', '/family/:id', '/admin', '/admin/tickets', '/absolute', '*',
    ])
  })

  it('has exactly the known duplicates and no others', () => {
    const found = duplicates(paths)
    const added = found.filter((p) => !KNOWN_DUPLICATES.includes(p))
    const fixed = KNOWN_DUPLICATES.filter((p) => !found.includes(p))
    expect(
      added,
      `${added.join(', ')}: declared more than once in App.jsx. React Router takes the first `
      + 'rule that matches; the other is unreachable. A redirect for a retired path replaces '
      + 'the old rule, it does not sit beside it.',
    ).toEqual([])
    expect(
      fixed,
      `${fixed.join(', ')}: no longer duplicated. Remove it from KNOWN_DUPLICATES in this commit `
      + 'and lower the route_rule_unique baseline in shared/sisConcepts.json.',
    ).toEqual([])
  })

  it('agrees with the manifest baseline', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../shared/sisConcepts.json'), 'utf8'))
    const row = manifest.concepts.find((r) => r.id === 'route_rule_unique')
    expect(row, 'shared/sisConcepts.json lost the route_rule_unique row').toBeTruthy()
    expect(row.baseline.web).toBe(KNOWN_DUPLICATES.length)
  })
})
