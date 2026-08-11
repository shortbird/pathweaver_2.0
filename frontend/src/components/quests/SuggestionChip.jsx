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
        bg-optio-purple/5 hover:bg-optio-purple/10
        border-2 border-optio-purple/30 hover:border-optio-purple/40
        text-optio-purple-dark text-sm font-medium
        rounded-full transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-optio-purple/5
        focus:outline-none focus:ring-2 focus:ring-optio-purple focus:ring-offset-2
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
