import React from 'react';
import {
  SparklesIcon,
  XMarkIcon,
  CheckIcon,
  LightBulbIcon
} from '@heroicons/react/24/outline';

/**
 * Reusable component for displaying AI suggestions with accept/dismiss actions.
 *
 * @param {string} title - The suggestion title or label
 * @param {React.ReactNode} children - The suggestion content
 * @param {function} onAccept - Called when user accepts the suggestion
 * @param {function} onDismiss - Called when user dismisses the suggestion
 * @param {number} confidence - Optional confidence score (0-1)
 * @param {string} reasoning - Optional explanation for the suggestion
 * @param {string} acceptLabel - Custom label for accept button
 * @param {boolean} showDontShowAgain - Show "Don't show again" option
 * @param {function} onDontShowAgain - Called when user clicks "Don't show again"
 */
const AISuggestionCard = ({
  title,
  children,
  onAccept,
  onDismiss,
  confidence,
  reasoning,
  acceptLabel = 'Apply',
  showDontShowAgain = false,
  onDontShowAgain,
  className = ''
}) => {
  return (
    <div className={`p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-200 ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-5 h-5 text-purple-600" />
          <span className="font-semibold text-purple-900">{title || 'AI Suggestion'}</span>
          {typeof confidence === 'number' && (
            <span className="text-xs px-2 py-0.5 bg-purple-200 text-purple-800 rounded-full">
              {Math.round(confidence * 100)}% confidence
            </span>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Dismiss suggestion"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="mb-3">
        {children}
      </div>

      {/* Reasoning */}
      {reasoning && (
        <p className="text-xs text-gray-600 italic flex items-start gap-1 mb-3">
          <LightBulbIcon className="w-3 h-3 mt-0.5 flex-shrink-0" />
          {reasoning}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div>
          {showDontShowAgain && onDontShowAgain && (
            <button
              onClick={onDontShowAgain}
              className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
            >
              Don't show again
            </button>
          )}
        </div>
        {onAccept && (
          <button
            onClick={onAccept}
            className="px-4 py-2 text-sm bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 flex items-center gap-2 font-medium"
          >
            <CheckIcon className="w-4 h-4" />
            {acceptLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default AISuggestionCard;
