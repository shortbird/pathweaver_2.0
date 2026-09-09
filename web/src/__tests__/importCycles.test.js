/**
 * No module in the app may import itself, however long the way round.
 *
 * Four cycles existed when this was written -- three in web, one in mobile:
 *
 *   components/curriculum/blocks/index.js  <-> CalloutBlockEditor.jsx
 *   components/curriculum/blocks/index.js  <-> DividerBlockEditor.jsx
 *   pages/sis/OnboardingPage.jsx           <-> components/sis/tasks/PaperworkTemplatesManager.jsx
 *   (mobile) stores/authStore.ts           <-> services/landingRoute.ts
 *
 * WHY THIS MATTERS, since all four "worked". ES modules resolve a cycle by
 * handing whichever module loads second a partially-initialised copy of the
 * first: its `const`s are in the temporal dead zone and read as undefined until
 * the first module finishes evaluating. Which of the two gets the complete
 * module depends on which one the bundler reaches first, which depends on the
 * entry point. The blocks pair worked because the constants happened to be
 * evaluated before the re-exports below them -- move one line and
 * CALLOUT_VARIANTS is undefined at import time, in a component whose own file
 * you did not touch.
 *
 * The mobile one was type-only, so TypeScript erased it and there was no
 * runtime edge at all. It is still fixed, because the day somebody imports a
 * value across that edge the cycle becomes real, at a call site that has
 * nothing to do with types.
 *
 * This walks BOTH apps: the cycle it is most likely to catch next is in
 * whichever one is being worked on, and there is no reason to run the same
 * scan twice in two frameworks.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const EXT = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.expo', 'build'])

function walk(dir, acc = []) {
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
 * Static imports and re-exports. `import type` is included on purpose: it is
 * erased at runtime, but a cycle in the source graph is the thing being
 * prevented -- see the mobile case in the header.
 */
const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'"()]*?\sfrom\s*)?['"]([^'"]+)['"]/g

function makeResolver(aliases) {
  return (from, spec) => {
    let base
    const alias = Object.keys(aliases).find((a) => spec === a || spec.startsWith(`${a}/`))
    if (alias) base = path.resolve(aliases[alias], spec.slice(alias.length + 1))
    else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec)
    else return null // a package, not our code

    for (const ext of EXT) {
      const candidate = base + ext
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
    }
    if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
      for (const ext of EXT) {
        const index = path.join(base, `index${ext}`)
        if (fs.existsSync(index)) return index
      }
    }
    if (fs.existsSync(base) && fs.statSync(base).isFile()) return base
    return null
  }
}

/** Every cycle in `roots`, each as a list of repo-relative paths. */
function findCycles(roots, aliases) {
  const resolve = makeResolver(aliases)
  const files = roots.flatMap((r) => walk(r))
  const graph = new Map()
  for (const file of files) {
    const out = new Set()
    for (const match of fs.readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
      const target = resolve(file, match[1])
      if (target) out.add(target)
    }
    graph.set(file, [...out])
  }

  const cycles = []
  const state = new Map() // 1 = on the stack, 2 = done
  const stack = []
  function visit(node) {
    state.set(node, 1)
    stack.push(node)
    for (const next of graph.get(node) || []) {
      if (!state.has(next)) visit(next)
      else if (state.get(next) === 1) cycles.push(stack.slice(stack.indexOf(next)).concat(next))
    }
    stack.pop()
    state.set(node, 2)
  }
  for (const file of files) if (!state.has(file)) visit(file)

  const unique = new Map()
  for (const cycle of cycles) {
    const key = cycle.slice(0, -1).map((f) => path.relative(REPO, f)).sort().join('|')
    if (!unique.has(key)) unique.set(key, cycle.map((f) => path.relative(REPO, f)))
  }
  return { cycles: [...unique.values()], fileCount: files.length }
}

const WEB = findCycles([path.join(REPO, 'web/src')], {})
const MOBILE = findCycles(
  [path.join(REPO, 'mobile/src'), path.join(REPO, 'mobile/app')],
  { '@': path.join(REPO, 'mobile') },
)

const format = (cycles) => cycles.map((c) => `  ${c.join('\n    -> ')}`).join('\n\n')

describe('import cycles', () => {
  it('is looking at real files', () => {
    // Every scan of this shape regresses by walking nothing and passing
    // forever. Zero cycles across zero files is not the same claim.
    expect(WEB.fileCount).toBeGreaterThan(1000)
    expect(MOBILE.fileCount).toBeGreaterThan(300)
  })

  it('the detector finds a cycle when there is one', () => {
    // Proven against the real shape this replaced: a barrel that re-exports a
    // member which imports a constant back out of the barrel.
    const fixture = path.join(REPO, 'web/src/components/curriculum/blocks')
    const resolve = makeResolver({})
    expect(resolve(path.join(fixture, 'index.js'), './CalloutBlockEditor')).toContain('CalloutBlockEditor.jsx')
    expect(resolve(path.join(fixture, 'CalloutBlockEditor.jsx'), './blockConfig')).toContain('blockConfig.js')
  })

  it('web has none', () => {
    expect(
      WEB.cycles,
      `${WEB.cycles.length} import cycle(s) in web/src:\n\n${format(WEB.cycles)}\n\n`
      + 'A cycle hands one of the two modules a partially-initialised copy of '
      + 'the other, and which one depends on the bundler. Move the shared piece '
      + 'into a module both can import.',
    ).toEqual([])
  })

  it('mobile has none', () => {
    expect(
      MOBILE.cycles,
      `${MOBILE.cycles.length} import cycle(s) in mobile:\n\n${format(MOBILE.cycles)}\n\n`
      + 'A type-only cycle counts: it is erased today, and becomes real the '
      + 'moment somebody imports a value across the same edge.',
    ).toEqual([])
  })
})
