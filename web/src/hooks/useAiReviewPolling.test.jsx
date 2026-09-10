import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useAiReviewPolling from './useAiReviewPolling'

const setup = (props = {}) => {
  const fetchDetail = vi.fn().mockResolvedValue({ ai: { status: 'running' } })
  const onUpdate = vi.fn()
  const onTimeout = vi.fn()
  const hook = renderHook(
    ({ status }) => useAiReviewPolling({
      completionId: 'comp-1', status, fetchDetail, onUpdate, onTimeout, ...props,
    }),
    { initialProps: { status: 'running' } },
  )
  return { hook, fetchDetail, onUpdate, onTimeout }
}

const tick = async (ms) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
    await Promise.resolve()
  })
}

describe('useAiReviewPolling', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not poll when nothing is running', async () => {
    const fetchDetail = vi.fn()
    renderHook(() => useAiReviewPolling({
      completionId: 'comp-1', status: 'complete', fetchDetail, onUpdate: vi.fn(),
    }))
    await tick(20000)
    expect(fetchDetail).not.toHaveBeenCalled()
  })

  it('polls while the review is running', async () => {
    const { fetchDetail } = setup()
    await tick(5000)
    expect(fetchDetail).toHaveBeenCalledTimes(1)
    await tick(5000)
    expect(fetchDetail).toHaveBeenCalledTimes(2)
  })

  it('hands each fresh detail to the caller', async () => {
    const { onUpdate } = setup()
    await tick(5000)
    expect(onUpdate).toHaveBeenCalledWith({ ai: { status: 'running' } })
  })

  it('stops as soon as the review finishes', async () => {
    const fetchDetail = vi.fn()
      .mockResolvedValueOnce({ ai: { status: 'running' } })
      .mockResolvedValueOnce({ ai: { status: 'complete' } })
    renderHook(() => useAiReviewPolling({
      completionId: 'comp-1', status: 'running', fetchDetail, onUpdate: vi.fn(),
    }))
    await tick(5000)
    await tick(5000)
    expect(fetchDetail).toHaveBeenCalledTimes(2)
    await tick(20000)
    expect(fetchDetail).toHaveBeenCalledTimes(2)
  })

  it('gives up rather than polling a dead worker forever', async () => {
    // If the server-side stale sweep has not noticed yet, an unbounded poll is
    // a request every five seconds for as long as the tab stays open.
    const { fetchDetail, onTimeout } = setup({ maxPolls: 3 })
    await tick(5000 * 5)
    expect(fetchDetail).toHaveBeenCalledTimes(3)
    expect(onTimeout).toHaveBeenCalled()
  })

  it('keeps watching through a blip', async () => {
    const fetchDetail = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ ai: { status: 'running' } })
    renderHook(() => useAiReviewPolling({
      completionId: 'comp-1', status: 'running', fetchDetail, onUpdate: vi.fn(),
    }))
    await tick(5000)
    await tick(5000)
    expect(fetchDetail).toHaveBeenCalledTimes(2)
  })

  it('stops when the reviewer moves to another item', async () => {
    const fetchDetail = vi.fn().mockResolvedValue({ ai: { status: 'running' } })
    const { rerender } = renderHook(
      ({ id }) => useAiReviewPolling({
        completionId: id, status: 'running', fetchDetail, onUpdate: vi.fn(),
      }),
      { initialProps: { id: 'comp-1' } },
    )
    await tick(5000)
    rerender({ id: null })
    await tick(20000)
    expect(fetchDetail).toHaveBeenCalledTimes(1)
  })

  it('stops on unmount', async () => {
    const { hook, fetchDetail } = setup()
    hook.unmount()
    await tick(20000)
    expect(fetchDetail).not.toHaveBeenCalled()
  })
})
