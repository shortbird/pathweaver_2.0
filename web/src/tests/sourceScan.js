import fs from 'fs'
import path from 'path'

/**
 * Reading source files for the guard tests: the comment rules and the walk.
 *
 * Shared by sisConcepts.test.js, routeRulesAreUnique.test.js and
 * schoolEventWallClock.test.js so that "a line of code" means one thing across
 * them. The rules are the ones the manifest patterns rely on (see the
 * `_comment` in shared/sisConcepts.json), and the backend and mobile tests
 * implement the same ones in their own languages.
 */

export const SOURCE_EXT = /\.(jsx?|tsx?)$/
export const TEST_FILE = /(\.test\.[jt]sx?|\.spec\.[jt]sx?)$/
export const SKIP_DIRS = new Set(['node_modules', '__tests__', 'tests'])

// A block comment opener is `/*` not glued to a word or quote character:
// `accept="image/*"` is an attribute value, not the start of a comment that
// swallows the next thirty lines.
const BLOCK = /(^|[^\w"'`/])\/\*[\s\S]*?\*\//gm

/** The file's lines with comments blanked and line positions kept. */
export function codeLines(text) {
  const stripped = text.replace(BLOCK, (m, pre) => pre + '\n'.repeat((m.slice(pre.length).match(/\n/g) || []).length))
  return stripped.split('\n').map((line) => {
    const s = line.trimStart()
    if (s.startsWith('//') || s.startsWith('*')) return ''
    const idx = line.indexOf(' // ')
    return idx >= 0 ? line.slice(0, idx) : line
  })
}

/**
 * Source files a `dirs` entry names, relative to `root`: a directory (walked,
 * test files and __tests__ skipped), one file, or a prefix such as
 * `pages/sis/clp/Class` (the files in that folder that start with it).
 */
export function filesUnder(root, rel, acc = []) {
  const base = path.join(root, rel)
  if (fs.existsSync(base) && fs.statSync(base).isFile()) {
    acc.push(rel)
    return acc
  }
  if (!fs.existsSync(base)) {
    const parent = path.dirname(rel)
    const prefix = path.basename(rel)
    const pdir = path.join(root, parent)
    if (fs.existsSync(pdir)) {
      for (const name of fs.readdirSync(pdir).sort()) {
        if (name.startsWith(prefix) && SOURCE_EXT.test(name) && !TEST_FILE.test(name)) {
          acc.push(parent === '.' ? name : `${parent}/${name}`)
        }
      }
    }
    return acc
  }
  for (const entry of fs.readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(base, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) filesUnder(root, path.relative(root, full), acc)
    } else if (SOURCE_EXT.test(entry.name) && !TEST_FILE.test(entry.name)) {
      acc.push(path.relative(root, full).split(path.sep).join('/'))
    }
  }
  return acc
}
