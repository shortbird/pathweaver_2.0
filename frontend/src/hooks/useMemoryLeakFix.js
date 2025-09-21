/**
 * Custom hooks to prevent memory leaks in React components
 *
 * These hooks provide utilities to handle common memory leak scenarios:
 * - Async operations that continue after component unmount
 * - Event listeners that aren't cleaned up
 * - Timers and intervals that persist
 * - Observers that aren't disconnected
 */

import { useEffect, useRef, useCallback, useState } from 'react'

/**
 * Hook to track if component is mounted to prevent state updates after unmount
 */
export function useIsMounted() {
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  return useCallback(() => isMountedRef.current, [])
}

/**
 * Hook to create an abort controller for canceling async operations
 */
export function useAbortController() {
  const abortControllerRef = useRef(null)

  useEffect(() => {
    abortControllerRef.current = new AbortController()

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return abortControllerRef.current
}

/**
 * Hook to safely update state only if component is still mounted
 */
export function useSafeState(initialState) {
  const [state, setState] = useState(initialState)
  const isMounted = useIsMounted()

  const safeSetState = useCallback((newState) => {
    if (isMounted()) {
      setState(newState)
    }
  }, [isMounted])

  return [state, safeSetState]
}

/**
 * Hook to create a cleanup function that runs on unmount
 */
export function useCleanup(cleanupFn) {
  const cleanupRef = useRef(cleanupFn)
  cleanupRef.current = cleanupFn

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
      }
    }
  }, [])
}

/**
 * Hook to automatically clean up observers
 */
export function useObserver(createObserver) {
  const observerRef = useRef(null)

  const setupObserver = useCallback((...args) => {
    // Clean up existing observer
    if (observerRef.current) {
      if (typeof observerRef.current.disconnect === 'function') {
        observerRef.current.disconnect()
      }
    }

    // Create new observer
    observerRef.current = createObserver(...args)
    return observerRef.current
  }, [createObserver])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        if (typeof observerRef.current.disconnect === 'function') {
          observerRef.current.disconnect()
        }
      }
    }
  }, [])

  return setupObserver
}

/**
 * Hook to create a debounced function with automatic cleanup
 */
export function useDebounceWithCleanup(callback, delay) {
  const timeoutRef = useRef(null)
  const callbackRef = useRef(callback)

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  const debouncedFn = useCallback((...args) => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args)
    }, delay)
  }, [delay])

  // Cancel function
  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancel()
    }
  }, [cancel])

  return { debouncedFn, cancel }
}

/**
 * Hook for safe async operations with abort signal
 */
export function useSafeAsync() {
  const isMounted = useIsMounted()
  const abortController = useAbortController()

  const safeAsync = useCallback(async (asyncFn) => {
    try {
      const result = await asyncFn(abortController.signal)

      // Only return result if component is still mounted
      if (isMounted()) {
        return { success: true, data: result }
      }

      return { success: false, aborted: true }
    } catch (error) {
      // Don't throw if operation was aborted due to unmount
      if (error.name === 'AbortError' || !isMounted()) {
        return { success: false, aborted: true }
      }

      return { success: false, error }
    }
  }, [isMounted, abortController])

  return safeAsync
}