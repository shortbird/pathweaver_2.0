/**
 * Architecture guard: no native JS dialogs (`window.confirm` / `window.prompt`).
 *
 * THE BUG THIS PREVENTS
 * An iCreate parent could not drop a class from the Schedule Builder on their
 * phone (reported 2026-08-18). They tapped "Drop", nothing happened, and it
 * worked fine on a computer. The drop was gated by `window.confirm`, which
 * returns `false` WITHOUT RENDERING ANYTHING inside an iOS in-app WKWebView —
 * a link opened from Gmail, Outlook, Facebook, or a school newsletter, which is
 * how most families reach the app. The host app never implements the
 * JS-dialog delegate, so there is no dialog and no error. Safari's pop-up
 * blocking and its "don't show more dialogs" suppression land the same way.
 *
 * That makes every `window.confirm` a button that silently does nothing for
 * some share of mobile users, and nothing in the code or in Sentry says so —
 * the handler just takes its early return. `window.prompt` fails identically,
 * returning null.
 *
 * THE FIX
 * `useConfirm()` / `usePromptText()` from src/contexts/ConfirmContext.jsx.
 * They render a real in-app dialog and return a promise:
 *
 *   const confirm = useConfirm()
 *   if (!(await confirm('Delete this quest?'))) return
 *
 * Tests drive it with the helpers in src/tests/confirmTestUtils.jsx.
 *
 * NOTE ON alert()
 * Bare `alert()` is not covered here. It has the same iOS problem, but it never
 * gates an action — it reports after the fact — so the failure is a missed
 * message rather than a dead button. Those call sites should move to `toast`,
 * which is already the house style, but that is a separate sweep.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname, relative } from 'path'
import { fileURLToPath } from 'url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

// `window.confirm(` / `window.prompt(` as an actual call. Assignments and mock
// wiring (`window.confirm = ...`, `window.confirm.mockReturnValue`) are not
// calls into the native dialog, so they are not what this guard is about.
const NATIVE_DIALOG = /\bwindow\.(confirm|prompt)\s*\(/

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(jsx?|tsx?)$/.test(entry)) out.push(full)
  }
  return out
}

describe('native dialog guard', () => {
  it('no source file calls window.confirm or window.prompt', () => {
    const offenders = []
    for (const file of walk(SRC)) {
      // The context module names them in its own documentation.
      if (file.endsWith(join('contexts', 'ConfirmContext.jsx'))) continue
      if (file.endsWith('nativeDialogGuard.test.js')) continue

      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (NATIVE_DIALOG.test(line)) {
          offenders.push(`${relative(SRC, file)}:${i + 1}`)
        }
      })
    }

    expect(
      offenders,
      'Use useConfirm() / usePromptText() from contexts/ConfirmContext instead — ' +
      'window.confirm and window.prompt silently return false/null inside iOS ' +
      'in-app browsers, so the guarded action never runs. See the comment at the ' +
      'top of this file.',
    ).toEqual([])
  })
})
