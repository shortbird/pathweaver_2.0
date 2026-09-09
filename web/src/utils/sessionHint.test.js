import { describe, it, expect, beforeEach } from 'vitest'
import { readSessionSync, hasLocalSessionHint, isDifferentAccountActiveElsewhere } from './sessionHint'

/**
 * session_sync is the localStorage record AuthContext writes on every login and
 * logout (for cross-tab conflict detection). These helpers reuse it as a fast,
 * synchronous "probably signed in" signal for routes that must decide what to
 * render before the async /api/auth/me check resolves.
 */

const writeLogin = (userId) =>
  localStorage.setItem('session_sync', JSON.stringify({ userId, displayName: 'X', action: 'login', timestamp: 1 }))
const writeLogout = () =>
  localStorage.setItem('session_sync', JSON.stringify({ userId: null, displayName: null, action: 'logout', timestamp: 1 }))

describe('readSessionSync', () => {
  beforeEach(() => localStorage.clear())

  it('returns the parsed record', () => {
    writeLogin('u1')
    expect(readSessionSync()).toMatchObject({ userId: 'u1', action: 'login' })
  })

  it('returns null when nothing was written', () => {
    expect(readSessionSync()).toBeNull()
  })

  it('returns null on garbage instead of throwing', () => {
    localStorage.setItem('session_sync', '{not json')
    expect(readSessionSync()).toBeNull()
    localStorage.setItem('session_sync', '"just a string"')
    expect(readSessionSync()).toBeNull()
  })
})

describe('hasLocalSessionHint', () => {
  beforeEach(() => localStorage.clear())

  it('is true after a login record', () => {
    writeLogin('u1')
    expect(hasLocalSessionHint()).toBe(true)
  })

  it('is false after a logout record', () => {
    writeLogout()
    expect(hasLocalSessionHint()).toBe(false)
  })

  it('is false with no record (fresh browser, crawler, cleared storage)', () => {
    expect(hasLocalSessionHint()).toBe(false)
  })
})

describe('isDifferentAccountActiveElsewhere', () => {
  beforeEach(() => localStorage.clear())

  it('is true when the latest login in this browser is a different account', () => {
    writeLogin('someone-else')
    expect(isDifferentAccountActiveElsewhere({ id: 'me' })).toBe(true)
  })

  it('is false when the latest login is this same account', () => {
    writeLogin('me')
    expect(isDifferentAccountActiveElsewhere({ id: 'me' })).toBe(false)
  })

  it('is false with no record, after a logout, or without a user', () => {
    expect(isDifferentAccountActiveElsewhere({ id: 'me' })).toBe(false)
    writeLogout()
    expect(isDifferentAccountActiveElsewhere({ id: 'me' })).toBe(false)
    writeLogin('someone-else')
    expect(isDifferentAccountActiveElsewhere(null)).toBe(false)
  })
})
