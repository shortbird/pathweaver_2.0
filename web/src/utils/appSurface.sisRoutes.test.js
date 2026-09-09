/**
 * Guard: SIS_SURFACE_PATHS keeps up with the SIS router.
 *
 * One built SPA serves two products. When a path exists on the SIS console but
 * not in the learning app, a staff member who opens it on www matches no route
 * and hits NotFoundRedirect, which consults SIS_SURFACE_PATHS to decide whether
 * to hand them across to sis.optioeducation.com. A path missing from that list
 * sends them to their dashboard instead of the page their notification was
 * about.
 *
 * That is not hypothetical. It shipped for iCreate on 2026-08-26, was fixed by
 * writing the list out by hand, and then happened again as SIS grew: ten more
 * routes (calendar, community, directory, households, my-profile, onboarding,
 * roster, settings, time, users) were added to SisRoutes.jsx and nobody
 * remembered this file. A hand-maintained mirror of a router will always drift,
 * so this test derives the answer instead of trusting the copy.
 *
 * The rule: every top-level SIS route that the learning app does NOT also serve
 * must appear in SIS_SURFACE_PATHS. Paths BOTH serve are excluded, because the
 * learning route matches first and this list is never consulted for them.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

import { SIS_SURFACE_PATHS, isSisSurfacePath } from './appSurface'

const SRC = join(__dirname, '..')

/** Top-level path segments declared by a <Routes> table. */
function topLevelRoutes(relPath) {
  const src = readFileSync(join(SRC, relPath), 'utf8')
  const found = new Set()
  for (const m of src.matchAll(/<Route\s+path="([^"]+)"/g)) {
    const first = m[1].replace(/^\//, '').split('/')[0]
    // Wildcards, index routes and :params are not paths anyone links to.
    if (!first || first === '*' || first.startsWith(':')) continue
    found.add(`/${first}`)
  }
  return found
}

describe('SIS_SURFACE_PATHS vs the actual routers', () => {
  const sis = topLevelRoutes('sis/SisRoutes.jsx')
  const learning = topLevelRoutes('App.jsx')

  it('reads both route tables (a scan finding nothing would pass forever)', () => {
    expect(sis.size).toBeGreaterThan(20)
    expect(learning.size).toBeGreaterThan(20)
  })

  it('lists every SIS route the learning app does not also serve', () => {
    const sisOnly = [...sis].filter((p) => !learning.has(p)).sort()
    const missing = sisOnly.filter((p) => !SIS_SURFACE_PATHS.includes(p))
    expect(missing,
      `These paths are served by the SIS console and by nothing on www, so a ` +
      `staff member opening one there is redirected to their dashboard instead ` +
      `of the page: ${missing.join(', ')}. Add them to SIS_SURFACE_PATHS in ` +
      `utils/appSurface.js.`,
    ).toEqual([])
  })

  it('does not list a path that is no longer a SIS route', () => {
    // The other direction: a stale entry hands staff to a console page that
    // does not exist, which is a worse landing than the dashboard.
    const stale = SIS_SURFACE_PATHS.filter((p) => !sis.has(p))
    expect(stale,
      `SIS_SURFACE_PATHS names ${stale.join(', ')}, which SisRoutes.jsx no ` +
      `longer serves. Staff following one lands on a 404 on the SIS host.`,
    ).toEqual([])
  })

  it('still matches sub-paths, not just the exact segment', () => {
    // The bug that started this was a notification deep link, and those carry
    // ids: /my-classes/abc, /people/123.
    expect(isSisSurfacePath('/onboarding/step-2')).toBe(true)
    expect(isSisSurfacePath('/users/00000000-0000-0000-0000-000000000000')).toBe(true)
    // A learning path that merely starts with the same letters must not match.
    expect(isSisSurfacePath('/timeline')).toBe(false)
    expect(isSisSurfacePath('/settingsomething')).toBe(false)
  })
})
