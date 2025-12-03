import React from 'react';
import PropTypes from 'prop-types';

/**
 * SuggestionChip Component
 *
 * A clickable pill-style chip that displays a suggestion text.
 * When clicked, appends the suggestion to the task description.
 */
const SuggestionChip = ({ suggestion, onClick, disabled }) => {
  return (
    <button
      onClick={() => onClick(suggestion)}
      disabled={disabled}
      className="
        inline-flex items-center gap-2 px-4 py-2
        bg-purple-50 hover:bg-purple-100
        border-2 border-purple-300 hover:border-purple-400
        text-purple-900 text-sm font-medium
        rounded-full transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-50
        focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
      "
      aria-label={`Apply suggestion: ${suggestion}`}
    >
      <span className="text-optio-purple">+</span>
      <span>{suggestion}</span>
    </button>
  );
};

SuggestionChip.propTypes = {
  suggestion: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool
};

SuggestionChip.defaultProps = {
  disabled: false
};

export default SuggestionChip;
