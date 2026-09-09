import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKioskIdleTimeout } from './useKioskIdleTimeout'

describe('useKioskIdleTimeout (I1)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('fires onIdle after the timeout when enabled', () => {
    const onIdle = vi.fn()
    renderHook(() => useKioskIdleTimeout({ enabled: true, timeoutMs: 1000, onIdle }))
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('does nothing when disabled', () => {
    const onIdle = vi.fn()
    renderHook(() => useKioskIdleTimeout({ enabled: false, timeoutMs: 1000, onIdle }))
    vi.advanceTimersByTime(5000)
    expect(onIdle).not.toHaveBeenCalled()
  })

  it('resets the timer on user activity', () => {
    const onIdle = vi.fn()
    renderHook(() => useKioskIdleTimeout({ enabled: true, timeoutMs: 1000, onIdle }))
    vi.advanceTimersByTime(800)
    window.dispatchEvent(new Event('keydown'))   // activity → reset
    vi.advanceTimersByTime(800)
    expect(onIdle).not.toHaveBeenCalled()         // would have fired at 1000 without reset
    vi.advanceTimersByTime(200)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })
})
