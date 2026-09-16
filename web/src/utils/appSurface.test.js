import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getAppSurface,
  getSisFlagOverride,
  isSisHost,
  goToSisSurface,
  goToLearningSurface,
  switchSurfaceInApp,
  getLearningOrigin,
  isSisSurfacePath,
  LEARNING_SURFACE_PATHS,
  SIS_SURFACE_PATHS,
} from './appSurface'

// jsdom default host is localhost — treated as a non-prod surface, so the
// override path is what these exercise.
function setLocation({ hostname = 'localhost', search = '' } = {}) {
  const assign = vi.fn()
  Object.defineProperty(window, 'location', {
    value: { hostname, search, assign, href: '' },
    writable: true,
    configurable: true,
  })
  return assign
}

describe('appSurface', () => {
  beforeEach(() => {
    localStorage.clear()
    setLocation()
  })

  it('defaults to the learning surface', () => {
    expect(getAppSurface()).toBe('learning')
    expect(isSisHost()).toBe(false)
  })

  it('returns the sis surface on the real sis. host', () => {
    setLocation({ hostname: 'sis.optioeducation.com' })
    expect(isSisHost()).toBe(true)
    expect(getAppSurface()).toBe('sis')
  })

  it('honors and persists the ?app=sis override', () => {
    setLocation({ search: '?app=sis' })
    expect(getAppSurface()).toBe('sis')
    // persisted, so it sticks without the query param
    setLocation({ search: '' })
    expect(getAppSurface()).toBe('sis')
  })

  it('?app=learning clears back to the learning surface', () => {
    localStorage.setItem('optio_surface', 'sis')
    setLocation({ search: '?app=learning' })
    expect(getAppSurface()).toBe('learning')
  })

  it('getSisFlagOverride reflects localStorage on non-prod hosts', () => {
    expect(getSisFlagOverride()).toBe(false)
    setLocation({ search: '?sisflag=1' })
    expect(getSisFlagOverride()).toBe(true)
    setLocation({ search: '?sisflag=0' })
    expect(getSisFlagOverride()).toBe(false)
  })

  it('ignores the flag override on the real prod host', () => {
    localStorage.setItem('optio_sis_flag', '1')
    setLocation({ hostname: 'www.optioeducation.com' })
    expect(getSisFlagOverride()).toBe(false)
  })

  it('goToSisSurface sets the override + navigates locally', () => {
    const assign = setLocation()
    goToSisSurface('/')
    expect(localStorage.getItem('optio_surface')).toBe('sis')
    expect(assign).toHaveBeenCalled()
  })

  it('goToLearningSurface clears the override + navigates locally', () => {
    localStorage.setItem('optio_surface', 'sis')
    const assign = setLocation()
    goToLearningSurface('/dashboard')
    expect(localStorage.getItem('optio_surface')).toBeNull()
    expect(assign).toHaveBeenCalledWith('/dashboard')
  })
})

// The learning app lives on app.optioeducation.com since the 2026-09-01
// cutover. www is the marketing site with a fixed allowlist of 301s, so a hop
// that names www only works for the paths on that list. /family was not, and
// an org admin viewing as a parent got www's 404 page from "Switch to Learning
// app" (iCreate, 2026-09-15).
describe('prod host hops', () => {
  beforeEach(() => {
    localStorage.clear()
    setLocation({ hostname: 'sis.optioeducation.com' })
  })

  it('switchSurfaceInApp sends the SIS console to the app host, not www', () => {
    switchSurfaceInApp('learning', '/family')
    expect(window.location.href).toBe('https://app.optioeducation.com/family')
  })

  it('goToLearningSurface sends the SIS console to the app host, not www', () => {
    goToLearningSurface('/login')
    expect(window.location.href).toBe('https://app.optioeducation.com/login')
  })

  it('getLearningOrigin names the app host from the SIS console', () => {
    expect(getLearningOrigin()).toBe('https://app.optioeducation.com')
  })

  it('getLearningOrigin keeps the local origin off the real hosts', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost', search: '', origin: 'http://localhost:3000', href: '' },
      writable: true,
      configurable: true,
    })
    expect(getLearningOrigin()).toBe('http://localhost:3000')
  })
})

describe('isSisSurfacePath', () => {
  it('claims the SIS-only pages', () => {
    expect(isSisSurfacePath('/attendance')).toBe(true)
    expect(isSisSurfacePath('/inbox')).toBe(true)
    expect(isSisSurfacePath('/my-classes/abc-123')).toBe(true)
  })

  it('ignores query strings and hashes', () => {
    expect(isSisSurfacePath('/people?tab=families')).toBe(true)
    expect(isSisSurfacePath('/tasks#requests')).toBe(true)
  })

  it('leaves the learning app alone', () => {
    expect(isSisSurfacePath('/school')).toBe(false)
    expect(isSisSurfacePath('/dashboard')).toBe(false)
    expect(isSisSurfacePath('/')).toBe(false)
  })

  it('does not match a longer name that merely starts the same', () => {
    expect(isSisSurfacePath('/classes-archive')).toBe(false)
    expect(isSisSurfacePath('/inboxes')).toBe(false)
  })

  it('survives junk', () => {
    expect(isSisSurfacePath(null)).toBe(false)
    expect(isSisSurfacePath('')).toBe(false)
  })

  it('the two surface lists do not overlap — an overlap is a redirect loop', () => {
    const both = LEARNING_SURFACE_PATHS.filter((p) => SIS_SURFACE_PATHS.includes(p))
    expect(both).toEqual([])
  })
})
