import { describe, it, expect, vi, afterEach } from 'vitest'
import { safeLocal, safeSession } from './safeStorage'

// Sentry OPTIO-WEB-3D: localStorage is null in some Android WebViews, and
// blocked storage can throw on access. Neither may reach the caller.
describe('safeStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('reads and writes through when storage works', () => {
    safeLocal.setItem('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
    expect(safeLocal.getItem('k')).toBe('v')
    safeLocal.removeItem('k')
    expect(safeLocal.getItem('k')).toBeNull()

    safeSession.setItem('s', '1')
    expect(safeSession.getItem('s')).toBe('1')
  })

  it('returns null for a missing key', () => {
    expect(safeLocal.getItem('missing')).toBeNull()
  })

  it('does not throw when localStorage is null', () => {
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(null)
    expect(safeLocal.getItem('k')).toBeNull()
    expect(() => safeLocal.setItem('k', 'v')).not.toThrow()
    expect(() => safeLocal.removeItem('k')).not.toThrow()
  })

  it('does not throw when touching sessionStorage throws', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(safeSession.getItem('k')).toBeNull()
    expect(() => safeSession.setItem('k', 'v')).not.toThrow()
  })
})
