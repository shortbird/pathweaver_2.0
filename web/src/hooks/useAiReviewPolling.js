import { useEffect, useRef } from 'react'
import { isRunningAiStatus } from '../components/credit-dashboard/aiReview'

/**
 * Watch a running AI review until it finishes.
 *
 * A review takes seconds to a minute, and a reviewer who opened the item is
 * usually still reading the evidence while it runs. Polling means the verdict
 * appears under them rather than after a reload.
 *
 * Bounded on purpose. If the worker died in a way the server-side stale sweep
 * has not noticed yet, an unbounded poll is a request every five seconds for as
 * long as the tab stays open. Twenty-four attempts is two minutes, past which
 * the honest thing is to stop and let the reviewer press Re-run.
 *
 * The fetch is silent: it must not touch the detail pane's loading state, or the
 * evidence a reviewer is reading would flicker every five seconds.
 */
const useAiReviewPolling = ({
  completionId, status, fetchDetail, onUpdate, onTimeout,
  intervalMs = 5000, maxPolls = 24,
}) => {
  const onUpdateRef = useRef(onUpdate)
  const onTimeoutRef = useRef(onTimeout)
  const fetchRef = useRef(fetchDetail)

  useEffect(() => { onUpdateRef.current = onUpdate }, [onUpdate])
  useEffect(() => { onTimeoutRef.current = onTimeout }, [onTimeout])
  useEffect(() => { fetchRef.current = fetchDetail }, [fetchDetail])

  useEffect(() => {
    if (!completionId || !isRunningAiStatus(status)) return undefined

    let cancelled = false
    let polls = 0

    const timer = setInterval(async () => {
      polls += 1
      if (polls > maxPolls) {
        clearInterval(timer)
        if (!cancelled) onTimeoutRef.current?.()
        return
      }
      try {
        const detail = await fetchRef.current?.(completionId)
        if (cancelled || !detail) return
        onUpdateRef.current?.(detail)
        if (!isRunningAiStatus(detail?.ai?.status)) {
          clearInterval(timer)
        }
      } catch {
        // A blip is not a reason to stop watching; the attempt cap is.
      }
    }, intervalMs)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [completionId, status, intervalMs, maxPolls])
}

export default useAiReviewPolling
