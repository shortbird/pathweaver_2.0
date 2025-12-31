import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * UndoToast - Mobile-optimized toast with countdown and undo action
 * Designed to work with react-hot-toast's custom toast API
 *
 * @param {string} message - The message to display
 * @param {function} onUndo - Callback when undo is clicked
 * @param {number} duration - Toast duration in ms (default 5000)
 * @param {string} itemType - Type of item being deleted (e.g., "photo", "block")
 */
const UndoToast = ({
  message,
  onUndo,
  duration = 5000,
  itemType = 'item'
}) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 16); // ~60fps

    return () => clearInterval(interval);
  }, [duration]);

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed bottom-4 left-4 right-4 z-50 pointer-events-auto"
    >
      <div className="bg-gray-900 text-white rounded-lg shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-gray-700">
          <motion.div
            className="h-full bg-gradient-to-r from-optio-purple to-optio-pink"
            initial={{ width: '100%' }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.016, ease: 'linear' }}
          />
        </div>

        {/* Content */}
        <div className="flex items-center justify-between p-4 gap-3">
          <span className="flex-1 text-sm font-medium">
            {message}
          </span>

          <button
            onClick={onUndo}
            className="flex-shrink-0 min-w-[44px] min-h-[44px] px-4 py-2 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors duration-150 touch-manipulation focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-900"
            aria-label={`Undo delete ${itemType}`}
          >
            Undo
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default UndoToast;
