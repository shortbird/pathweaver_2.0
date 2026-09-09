import React, { memo, useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { TrashIcon } from '@heroicons/react/24/outline';
import useSwipeGesture from '../../../hooks/useSwipeGesture';
import * as haptics from '../../../utils/haptics';

/**
 * SwipeableBlock - Swipe-to-delete wrapper component
 *
 * Wraps content in a swipeable container with delete action revealed on left swipe.
 * Uses framer-motion for smooth spring animations and haptic feedback for tactile response.
 *
 * @param {Object} props
 * @param {Function} props.onDelete - Called when delete action is triggered (swipe past threshold)
 * @param {number} props.deleteThreshold - Pixels to trigger delete (default: 160)
 * @param {boolean} props.disabled - Whether swipe is disabled (default: false)
 * @param {ReactNode} props.children - Content to wrap
 * @param {string} props.className - Additional classes for the container
 */
const SwipeableBlock = ({
  onDelete,
  deleteThreshold = 160,
  disabled = false,
  children,
  className = ''
}) => {
  const controls = useAnimation();

  const {
    handlers,
    offset,
    isSwiping,
    isRevealed,
    isPastAction,
    resetSwipe
  } = useSwipeGesture({
    onSwipeLeft: () => {
      // Trigger heavy haptic for delete action
      haptics.heavy();

      // Animate out before calling delete
      controls.start({
        x: -400,
        opacity: 0,
        transition: { type: 'spring', stiffness: 300, damping: 30 }
      }).then(() => {
        onDelete?.();
      });
    },
    actionThreshold: deleteThreshold,
    revealThreshold: 80,
    enabled: !disabled
  });

  // Trigger haptic at reveal threshold
  useEffect(() => {
    if (isRevealed && !isPastAction) {
      haptics.medium();
    }
  }, [isRevealed, isPastAction]);

  // Sync animation with swipe offset
  useEffect(() => {
    if (isSwiping) {
      // Immediate updates during swipe (no spring)
      controls.set({ x: offset });
    } else if (offset !== 0) {
      // Spring back animation when not swiping
      controls.start({
        x: offset,
        transition: { type: 'spring', stiffness: 400, damping: 30 }
      });
    }
  }, [offset, isSwiping, controls]);

  // Calculate delete zone width based on swipe offset
  const deleteZoneWidth = Math.abs(offset);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Delete zone - revealed behind content on left swipe */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end bg-red-600 text-white"
        style={{ width: deleteZoneWidth }}
      >
        <div className="px-6 flex items-center gap-2">
          <TrashIcon
            className={`w-6 h-6 transition-transform duration-200 ${
              isPastAction ? 'scale-125' : 'scale-100'
            }`}
          />
          {isPastAction && (
            <span className="font-semibold whitespace-nowrap">Release to delete</span>
          )}
        </div>
      </div>

      {/* Content - moves on swipe */}
      <motion.div
        {...handlers}
        animate={controls}
        initial={{ x: 0 }}
        className="relative bg-white touch-pan-y"
        style={{
          touchAction: isSwiping ? 'none' : 'pan-y'
        }}
      >
        {children}
      </motion.div>
    </div>
  );
};

export default memo(SwipeableBlock);
