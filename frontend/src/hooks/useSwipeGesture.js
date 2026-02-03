import { useRef, useState, useCallback } from 'react';

/**
 * Hook for detecting horizontal swipe gestures with direction locking
 * Designed to work alongside vertical scrolling without conflicts
 *
 * @param {Object} options
 * @param {Function} options.onSwipeLeft - Called when swiped left past threshold
 * @param {Function} options.onSwipeRight - Called when swiped right past threshold
 * @param {number} options.revealThreshold - Pixels to reveal action zone (default: 80)
 * @param {number} options.actionThreshold - Pixels to trigger action (default: 160)
 * @param {boolean} options.enabled - Whether swipe is enabled (default: true)
 * @param {Function} options.onSwipeStart - Called when swipe starts
 * @param {Function} options.onSwipeEnd - Called when swipe ends
 * @returns {Object} { handlers, offset, isSwiping, isRevealed, resetSwipe }
 */
export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  revealThreshold = 80,
  actionThreshold = 160,
  enabled = true,
  onSwipeStart,
  onSwipeEnd
} = {}) {
  const [offset, setOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const touchStartRef = useRef(null);
  const directionLockedRef = useRef(null);
  const hasTriggeredHapticRef = useRef(false);

  const resetSwipe = useCallback(() => {
    setOffset(0);
    setIsSwiping(false);
    touchStartRef.current = null;
    directionLockedRef.current = null;
    hasTriggeredHapticRef.current = false;
  }, []);

  const handleTouchStart = useCallback((e) => {
    if (!enabled) return;

    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    };
    directionLockedRef.current = null;
    hasTriggeredHapticRef.current = false;
  }, [enabled]);

  const handleTouchMove = useCallback((e) => {
    if (!enabled || !touchStartRef.current) return;

    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    // Lock direction after 10px of movement
    if (!directionLockedRef.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      // If vertical movement is greater, this is a scroll - don't intercept
      if (Math.abs(dy) > Math.abs(dx)) {
        directionLockedRef.current = 'vertical';
        resetSwipe();
        return;
      }
      directionLockedRef.current = 'horizontal';
      setIsSwiping(true);
      onSwipeStart?.();
    }

    // If locked to horizontal, handle swipe
    if (directionLockedRef.current === 'horizontal') {
      // Prevent scrolling while swiping
      e.preventDefault();

      // Apply resistance when swiping right (past 0) or far left (past threshold)
      let newOffset = dx;
      if (dx > 0) {
        // Resistance when swiping right (optional right swipe)
        newOffset = dx * 0.3;
      } else if (dx < -actionThreshold) {
        // Resistance past action threshold
        const overshoot = -dx - actionThreshold;
        newOffset = -(actionThreshold + overshoot * 0.3);
      }

      setOffset(newOffset);

      // Trigger haptic at reveal threshold (once)
      if (!hasTriggeredHapticRef.current && Math.abs(newOffset) >= revealThreshold) {
        hasTriggeredHapticRef.current = true;
        // Haptic will be triggered by parent component
      }
    }
  }, [enabled, actionThreshold, revealThreshold, resetSwipe, onSwipeStart]);

  const handleTouchEnd = useCallback((e) => {
    if (!enabled || !touchStartRef.current) return;

    const wasHorizontal = directionLockedRef.current === 'horizontal';

    if (wasHorizontal) {
      onSwipeEnd?.();

      // Check if past action threshold
      if (offset <= -actionThreshold) {
        onSwipeLeft?.();
        // Keep offset for animation, parent will handle reset
      } else if (offset >= actionThreshold && onSwipeRight) {
        onSwipeRight?.();
      } else {
        // Spring back to origin or reveal position
        if (offset <= -revealThreshold) {
          // Snap to reveal position
          setOffset(-revealThreshold);
        } else {
          // Spring back to origin
          resetSwipe();
        }
      }
    }

    setIsSwiping(false);
    touchStartRef.current = null;
    directionLockedRef.current = null;
  }, [enabled, offset, actionThreshold, revealThreshold, onSwipeLeft, onSwipeRight, resetSwipe, onSwipeEnd]);

  const handlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: resetSwipe
  };

  return {
    handlers,
    offset,
    isSwiping,
    isRevealed: offset <= -revealThreshold,
    isPastAction: offset <= -actionThreshold,
    resetSwipe
  };
}

/**
 * Hook for detecting if viewport matches a media query
 * @param {string} query - CSS media query string
 * @returns {boolean} Whether the query matches
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useCallback(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);

    // Set initial value
    setMatches(mediaQuery.matches);

    // Listen for changes
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, [query]);

  return matches;
}

/**
 * Hook for checking if user prefers reduced motion
 * @returns {boolean} Whether reduced motion is preferred
 */
export function usePrefersReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * Convenience hook for mobile detection
 * @returns {boolean} Whether viewport is mobile (<640px)
 */
export function useIsMobile() {
  return useMediaQuery('(max-width: 639px)');
}

export default useSwipeGesture;
