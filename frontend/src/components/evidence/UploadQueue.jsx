import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * UploadQueue - Visual upload progress tracker
 * Shows thumbnail strip with status badges, progress bars, and retry/cancel actions
 *
 * @param {Array} queue - Array of { id, file, status, progress, error, thumbnail }
 *   - status: 'uploading' | 'complete' | 'failed'
 *   - progress: 0-100
 * @param {function} onRetry - (itemId) => void
 * @param {function} onCancel - (itemId) => void
 * @param {string} position - 'top' | 'bottom' | 'inline'
 */
const UploadQueue = ({
  queue = [],
  onRetry,
  onCancel,
  position = 'bottom'
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!queue || queue.length === 0) return null;

  const uploading = queue.filter(item => item.status === 'uploading').length;
  const failed = queue.filter(item => item.status === 'failed').length;
  const complete = queue.filter(item => item.status === 'complete').length;

  const positionClasses = {
    top: 'fixed top-0 left-0 right-0 z-40',
    bottom: 'fixed bottom-0 left-0 right-0 z-40',
    inline: 'relative w-full'
  };

  return (
    <motion.div
      initial={{ y: position === 'top' ? -100 : position === 'bottom' ? 100 : 0, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: position === 'top' ? -100 : position === 'bottom' ? 100 : 0, opacity: 0 }}
      className={positionClasses[position]}
    >
      <div className="bg-white border-t border-gray-200 shadow-lg">
        {/* Offline Banner */}
        {!isOnline && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium text-yellow-800">Offline - uploads will resume when connected</span>
          </div>
        )}

        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors touch-manipulation"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-900">
              Uploading {uploading} {uploading === 1 ? 'file' : 'files'}
            </span>
            {complete > 0 && (
              <span className="text-xs text-green-600 font-medium">
                {complete} complete
              </span>
            )}
            {failed > 0 && (
              <span className="text-xs text-red-600 font-medium">
                {failed} failed
              </span>
            )}
          </div>

          <motion.svg
            animate={{ rotate: isExpanded ? 180 : 0 }}
            className="w-5 h-5 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </motion.svg>
        </button>

        {/* Queue Items */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 flex gap-2 overflow-x-auto">
                {queue.map((item) => (
                  <UploadItem
                    key={item.id}
                    item={item}
                    onRetry={() => onRetry?.(item.id)}
                    onCancel={() => onCancel?.(item.id)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

/**
 * Individual upload item with thumbnail, status badge, and actions
 */
const UploadItem = ({ item, onRetry, onCancel }) => {
  const { file, status, progress = 0, error, thumbnail } = item;

  const statusConfig = {
    uploading: {
      badge: (
        <div className="absolute top-1 right-1 bg-white rounded-full p-1 shadow-sm">
          <svg className="w-4 h-4 text-gray-600 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ),
      bgColor: 'bg-gray-100'
    },
    complete: {
      badge: (
        <div className="absolute top-1 right-1 bg-green-500 rounded-full p-1 shadow-sm">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
      ),
      bgColor: 'bg-green-50'
    },
    failed: {
      badge: (
        <div className="absolute top-1 right-1 bg-red-500 rounded-full p-1 shadow-sm">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
      ),
      bgColor: 'bg-red-50'
    }
  };

  const config = statusConfig[status] || statusConfig.uploading;

  return (
    <div className="flex-shrink-0 w-24">
      {/* Thumbnail with status badge */}
      <div className={`relative w-16 h-16 rounded-lg overflow-hidden ${config.bgColor} border border-gray-200 mx-auto`}>
        {thumbnail || file?.preview ? (
          <img
            src={thumbnail || file.preview}
            alt={file?.name || 'Upload'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>
          </div>
        )}
        {config.badge}
      </div>

      {/* Progress bar */}
      {status === 'uploading' && (
        <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-optio-purple to-optio-pink"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}

      {/* File name */}
      <p className="mt-1 text-xs text-gray-600 truncate text-center" title={file?.name}>
        {file?.name}
      </p>

      {/* Error message */}
      {status === 'failed' && error && (
        <p className="mt-1 text-xs text-red-600 truncate text-center" title={error}>
          {error}
        </p>
      )}

      {/* Actions */}
      {status === 'failed' && (
        <div className="mt-2 flex gap-1">
          <button
            onClick={onRetry}
            className="flex-1 min-h-[44px] px-2 py-1 bg-gradient-to-r from-optio-purple to-optio-pink text-white text-xs font-semibold rounded hover:opacity-90 transition-opacity touch-manipulation focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-optio-purple"
            aria-label="Retry upload"
          >
            Retry
          </button>
          <button
            onClick={onCancel}
            className="min-w-[44px] min-h-[44px] px-2 py-1 bg-gray-200 text-gray-700 text-xs font-semibold rounded hover:bg-gray-300 transition-colors touch-manipulation focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400"
            aria-label="Cancel upload"
          >
            ✕
          </button>
        </div>
      )}

      {status === 'uploading' && (
        <button
          onClick={onCancel}
          className="mt-2 w-full min-h-[44px] px-2 py-1 bg-gray-200 text-gray-700 text-xs font-semibold rounded hover:bg-gray-300 transition-colors touch-manipulation focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400"
          aria-label="Cancel upload"
        >
          Cancel
        </button>
      )}
    </div>
  );
};

export default UploadQueue;
