import React, { useState } from 'react';
import PropTypes from 'prop-types';
import SuggestionChip from './SuggestionChip';

/**
 * SuggestionBox Component
 *
 * Displays AI-generated suggestions in a collapsible box.
 * Includes undo functionality when students apply suggestions.
 */
const SuggestionBox = ({
  suggestions,
  onApplySuggestion,
  lastAppliedSuggestion,
  onUndo,
  isLoading
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (isLoading) {
    return (
      <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="animate-spin h-5 w-5 border-2 border-optio-purple border-t-transparent rounded-full" />
          <span className="text-purple-900 font-medium">Getting suggestions...</span>
        </div>
      </div>
    );
  }

  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 border border-purple-200 rounded-lg overflow-hidden">
      {/* Header with collapse toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-purple-50 hover:bg-purple-100 transition-colors flex items-center justify-between"
        aria-expanded={isExpanded}
        aria-controls="suggestion-box-content"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">💡</span>
          <span className="text-purple-900 font-semibold">
            Ideas to explore ({suggestions.length})
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-optio-purple transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsible content */}
      {isExpanded && (
        <div id="suggestion-box-content" className="p-4 bg-white">
          <p className="text-sm text-gray-600 mb-3">
            Click any suggestion to add it to your description:
          </p>

          {/* Suggestions grid */}
          <div className="flex flex-wrap gap-2 mb-3">
            {suggestions.map((suggestion, index) => (
              <SuggestionChip
                key={index}
                suggestion={suggestion}
                onClick={onApplySuggestion}
              />
            ))}
          </div>

          {/* Undo button (shows when there's a last applied suggestion) */}
          {lastAppliedSuggestion && (
            <div className="pt-3 border-t border-purple-100">
              <button
                onClick={onUndo}
                className="flex items-center gap-2 px-3 py-2 text-sm text-purple-700 hover:text-purple-900 hover:bg-purple-50 rounded transition-colors"
                aria-label="Undo last suggestion"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                <span className="font-medium">Undo last addition</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

SuggestionBox.propTypes = {
  suggestions: PropTypes.arrayOf(PropTypes.string),
  onApplySuggestion: PropTypes.func.isRequired,
  lastAppliedSuggestion: PropTypes.string,
  onUndo: PropTypes.func.isRequired,
  isLoading: PropTypes.bool
};

SuggestionBox.defaultProps = {
  suggestions: [],
  lastAppliedSuggestion: null,
  isLoading: false
};

export default SuggestionBox;
