/**
 * The three heavy libraries stay behind a dynamic import (QF-06).
 *
 * `html2pdf.js`, `pdf-lib` and `@techstark/opencv-js` are the largest things in
 * this app's dependency tree by a wide margin -- OpenCV alone is roughly 10MB of
 * WebAssembly. A static `import` at module scope puts all of it in the chunk
 * that loads with the page, whether or not the visitor ever does the thing that
 * needs it.
 *
 * This was live. Three pages imported html2pdf at module scope, so every
 * visitor to a PUBLIC TRANSCRIPT -- a link a student sends to an admissions
 * office -- downloaded the whole PDF machinery to read a web page. That is the
 * audience least likely to be on a fast connection and least likely to press
 * Download.
 *
 * Two of the three claims in the original finding were already false when it
 * was written: OpenCV and pdf-lib were lazy. Only html2pdf was not. This test
 * exists because nothing stopped a future eager import, and the failure is
 * invisible -- the page works perfectly, it just costs several megabytes.
 *
 * WHAT THIS DOES NOT CHECK. Not the built bundle: reading dist/ would mean
 * running a production build inside the unit suite, which takes minutes and
 * needs the build to have happened. It checks the import statements, which is
 * where the mistake is actually made -- somebody adds `import html2pdf from
 * 'html2pdf.js'` at the top of a file because that is what autocomplete offers.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Package specifiers that must never be statically imported. */
const HEAVY = ['html2pdf.js', 'pdf-lib', '@techstark/opencv-js']

function sourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      sourceFiles(full, acc)
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

const FILES = sourceFiles(SRC)

/**
 * A STATIC import of `spec` -- `import x from 'spec'` or `export … from 'spec'`.
 * Deliberately does not match `await import('spec')`, which is the whole point:
 * the dynamic form is what these three are supposed to use.
 */
const staticImport = (spec) => new RegExp(
  String.raw`(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*['"]${spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
)

describe('heavy libraries are loaded on demand', () => {
  it('is looking at real files', () => {
    // This shape of test regresses by globbing nothing and passing forever.
    expect(FILES.length).toBeGreaterThan(1000)
  })

  it.each(HEAVY)('%s is never imported at module scope', (spec) => {
    const pattern = staticImport(spec)
    const offenders = FILES
      .filter((file) => pattern.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file))
    expect(
      offenders,
      `${spec} is imported at module scope in:\n  ${offenders.join('\n  ')}\n\n`
      + `Use \`await import('${spec}')\` inside the handler that needs it. A `
      + 'static import puts megabytes into the chunk that loads with the page, '
      + 'for every visitor, whether or not they ever press the button.',
    ).toEqual([])
  })

  it('the libraries are still reached dynamically somewhere', () => {
    // Otherwise this passes forever by the dependencies having been removed,
    // which would be fine -- but it would no longer be testing anything, and
    // nobody would know.
    const all = FILES.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
    for (const spec of HEAVY) {
      expect(all, `nothing imports ${spec} at all any more -- drop it from HEAVY `
        + 'and from package.json, or this test is watching nothing')
        .toContain(`import('${spec}')`)
    }
  })

  it('the detector fires on the shape it bans', () => {
    // Every version of this that regressed did so by matching nothing.
    const p = staticImport('html2pdf.js')
    expect(p.test("import html2pdf from 'html2pdf.js'")).toBe(true)
    expect(p.test('\nimport html2pdf from "html2pdf.js"\n')).toBe(true)
    expect(p.test("const html2pdf = (await import('html2pdf.js')).default")).toBe(false)
    expect(p.test("// html2pdf is loaded on demand, not from 'html2pdf.js'")).toBe(false)
  })
})
