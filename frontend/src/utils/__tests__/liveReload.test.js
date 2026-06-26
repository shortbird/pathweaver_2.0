import { describe, it, expect, vi } from 'vitest'
import { isChunkLoadError, recoverFromChunkError } from '../liveReload'

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
