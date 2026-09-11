import { describe, it, expect, vi } from 'vitest'
import { isChunkLoadError, recoverFromChunkError, installChunkErrorRecovery } from '../liveReload'

describe('isChunkLoadError', () => {
  it('matches dynamic import failures', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module: https://x/abc.js')).toBe(true)
    expect(isChunkLoadError('error loading dynamically imported module')).toBe(true)
    expect(isChunkLoadError('Importing a module script failed.')).toBe(true)
    expect(isChunkLoadError('Loading chunk 42 failed')).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isChunkLoadError('TypeError: undefined is not a function')).toBe(false)
    expect(isChunkLoadError('')).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})

describe('recoverFromChunkError', () => {
  const fakeStorage = () => {
    const m = new Map()
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }
  }

  const T0 = 1_000_000  // realistic-ish epoch ms, well past the 10s window from 0

  it('reloads once and records the timestamp', () => {
    const storage = fakeStorage()
    const reload = vi.fn()
    expect(recoverFromChunkError(T0, storage, reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('debounces a second reload within the window', () => {
    const storage = fakeStorage()
    const reload = vi.fn()
    recoverFromChunkError(T0, storage, reload)
    // 6s later — still within the 10s debounce → no second reload
    expect(recoverFromChunkError(T0 + 6000, storage, reload)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads again after the debounce window passes', () => {
    const storage = fakeStorage()
    const reload = vi.fn()
    recoverFromChunkError(T0, storage, reload)
    expect(recoverFromChunkError(T0 + 20000, storage, reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})

describe('installChunkErrorRecovery', () => {
  /**
   * OPTIO-WEB-H (2026-09-02, iOS 16 Safari): after a deploy, an open tab's
   * stale index.html asked for chunk files that no longer existed, and Safari
   * reported each as a bare `TypeError: Load failed` -- the same words it uses
   * for any failed fetch, so the message filter above cannot match it without
   * reloading the page on every dropped request. Vite raises its own
   * `vite:preloadError` event on exactly this failure, on every browser, which
   * is the signal to reload on.
   */
  const fakeTarget = () => {
    const listeners = {}
    return {
      addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn) },
      dispatch: (type, event) => (listeners[type] || []).forEach((fn) => fn(event)),
    }
  }

  it('reloads on vite:preloadError, whatever the browser called it', () => {
    const target = fakeTarget()
    const recover = vi.fn()
    installChunkErrorRecovery(target, recover)
    target.dispatch('vite:preloadError', { payload: new TypeError('Load failed') })
    expect(recover).toHaveBeenCalledTimes(1)
  })

  it('does not reload on a bare Safari "Load failed" that is not a preload', () => {
    // Any failed fetch in Safari says this. Reloading on the words alone would
    // bounce the page on a dropped API call.
    const target = fakeTarget()
    const recover = vi.fn()
    installChunkErrorRecovery(target, recover)
    target.dispatch('unhandledrejection', { reason: new TypeError('Load failed') })
    expect(recover).not.toHaveBeenCalled()
  })

  it('still reloads on the named dynamic-import failures', () => {
    const target = fakeTarget()
    const recover = vi.fn()
    installChunkErrorRecovery(target, recover)
    target.dispatch('unhandledrejection', { reason: new Error('Failed to fetch dynamically imported module: /assets/x.js') })
    expect(recover).toHaveBeenCalledTimes(1)
  })
})
