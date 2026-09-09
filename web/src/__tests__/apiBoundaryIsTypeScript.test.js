/**
 * The API boundary is `services/api.ts`, and `services/api.js` must not exist.
 *
 * This is not a style rule. Vite's default `resolve.extensions` puts `.js`
 * BEFORE `.ts`, so `import api from '../services/api'` -- which is how all ~250
 * call sites in this app spell it -- resolves to `api.js` if one is ever there.
 * A stray `api.js` therefore does not conflict with `api.ts`; it silently
 * SHADOWS it, and every request in the app goes through the wrong module while
 * both files sit in the tree looking plausible.
 *
 * The risk is concrete rather than theoretical. api.js was renamed on
 * 2026-09-09 while another session had uncommitted changes in it (two new
 * oeaAPI methods, which came across with the rename and are in api.ts today).
 * A session holding the old path in memory that WRITES rather than edits would
 * recreate api.js with a stale copy of a 1,100-line module. This test turns
 * that from an invisible regression into a red build with a name on it.
 *
 * The same applies to any future `services/api.jsx`.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SERVICES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../services')

describe('the API boundary', () => {
  it('exists as api.ts', () => {
    expect(fs.existsSync(path.join(SERVICES, 'api.ts'))).toBe(true)
  })

  it.each(['api.js', 'api.jsx', 'api.mjs'])('has no %s shadowing it', (name) => {
    const shadow = path.join(SERVICES, name)
    expect(
      fs.existsSync(shadow),
      `web/src/services/${name} exists and SHADOWS api.ts -- Vite resolves .js `
      + 'before .ts, so every `import api from "../services/api"` in the app is '
      + 'now reading that file instead. If it holds work that is not in api.ts, '
      + 'move the work across and delete it. Do not keep both.',
    ).toBe(false)
  })

  it('still exports the pieces the app imports by name', () => {
    // A rename that lost an export would be caught by the app failing to build,
    // but not by anything that says why. These five are the ones imported by
    // name across the app rather than as the default axios instance.
    const source = fs.readFileSync(path.join(SERVICES, 'api.ts'), 'utf8')
    for (const name of ['tokenStore', 'csrfTokenStore', 'beginSessionSwitch',
                        'getAuthHeaders', 'oeaAPI']) {
      expect(source, `api.ts no longer exports ${name}`).toContain(`export const ${name}`)
    }
    expect(source).toContain('export default api')
  })
})
