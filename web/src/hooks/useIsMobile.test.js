import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useIsMobile from './useIsMobile'

/**
 * The global test setup mocks matchMedia to always return matches=false,
 * so by default the hook reports desktop. Here we override per-test to
 * simulate both sides of the 768px boundary and the resize event.
 */

function installMatchMedia(initialMatches) {
  const listeners = new Set()
  const mq = {
    matches: initialMatches,
    media: '(max-width: 767px)',
    onchange: null,
    addEventListener: (type, cb) => {
      if (type === 'change') listeners.add(cb)
    },
    removeEventListener: (type, cb) => {
      if (type === 'change') listeners.delete(cb)
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
  window.matchMedia = vi.fn().mockReturnValue(mq)
  return {
    mq,
    fire: (matches) => {
      mq.matches = matches
      listeners.forEach((cb) => cb({ matches }))
    },
  }
}

describe('useIsMobile', () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('returns true when the viewport starts below the md breakpoint', () => {
    installMatchMedia(true)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('returns false when the viewport starts at or above the md breakpoint', () => {
    installMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('flips when the viewport crosses the breakpoint at runtime', () => {
    const { fire } = installMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
    act(() => fire(true))
    expect(result.current).toBe(true)
    act(() => fire(false))
    expect(result.current).toBe(false)
  })
})
