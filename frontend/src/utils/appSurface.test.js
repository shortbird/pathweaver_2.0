import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getAppSurface,
  getSisFlagOverride,
  isSisHost,
  goToSisSurface,
  goToLearningSurface,
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
