import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isFocusMode, getFocusConfig, setFocusMode, FOCUS_EVENT } from './focusMode'

// This project's local jsdom ships a broken localStorage (setItem/clear are not
// functions — see AuthContext.test note), so install a hermetic in-memory stub
// instead of relying on the environment. Keeps the test verifiable locally + CI.
beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear: () => store.clear(),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('focusMode (core kiosk capability)', () => {
  it('is off with an empty config by default', () => {
    expect(isFocusMode()).toBe(false)
    expect(getFocusConfig()).toEqual({})
  })

  it('stores the program-supplied return routes when entering focus mode', () => {
    // This is the inversion: the program hands core its routes; Layout reads them
    // back without naming any program.
    setFocusMode(true, { homeRoute: '/treehouse', idleLoginRoute: '/treehouse-kiosk' })
    expect(isFocusMode()).toBe(true)
    expect(getFocusConfig()).toEqual({ homeRoute: '/treehouse', idleLoginRoute: '/treehouse-kiosk' })
  })

  it('clears both state and config when leaving focus mode', () => {
    setFocusMode(true, { homeRoute: '/x', idleLoginRoute: '/y' })
    setFocusMode(false)
    expect(isFocusMode()).toBe(false)
    expect(getFocusConfig()).toEqual({})
  })

  it('fires FOCUS_EVENT so Layout reacts immediately', () => {
    const handler = vi.fn()
    window.addEventListener(FOCUS_EVENT, handler)
    setFocusMode(true, { homeRoute: '/z' })
    expect(handler).toHaveBeenCalled()
    window.removeEventListener(FOCUS_EVENT, handler)
  })

  it('returns an empty config (not a throw) when stored JSON is malformed', () => {
    localStorage.setItem('focus_mode_config', '{not valid json')
    expect(getFocusConfig()).toEqual({})
  })
})
