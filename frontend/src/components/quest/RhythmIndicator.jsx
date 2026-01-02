import React from 'react';
import {
  SparklesIcon,
  ArrowTrendingUpIcon,
  PauseCircleIcon,
  SunIcon,
  PlayCircleIcon
} from '@heroicons/react/24/outline';

/**
 * RhythmIndicator - Displays current learning rhythm state
 *
 * Replaces progress bars with a process-focused indicator
 * that celebrates sustainable learning patterns.
 * All states are framed positively - breaks are healthy.
 * Clickable to open explainer modal.
 */
const RhythmIndicator = ({
  state,
  stateDisplay,
  message,
  patternDescription,
  compact = false,
  onClick
}) => {
  // State-specific styling and icons
  const stateConfig = {
    in_flow: {
      icon: SparklesIcon,
      bgClass: 'bg-gradient-to-r from-optio-purple/10 to-optio-pink/10',
      borderClass: 'border-optio-purple/30',
      iconClass: 'text-optio-purple',
      textClass: 'text-optio-purple'
    },
    building: {
      icon: ArrowTrendingUpIcon,
      bgClass: 'bg-blue-50',
      borderClass: 'border-blue-200',
      iconClass: 'text-blue-600',
      textClass: 'text-blue-700'
    },
    resting: {
      icon: PauseCircleIcon,
      bgClass: 'bg-green-50',
      borderClass: 'border-green-200',
      iconClass: 'text-green-600',
      textClass: 'text-green-700'
    },
    fresh_return: {
      icon: SunIcon,
      bgClass: 'bg-amber-50',
      borderClass: 'border-amber-200',
      iconClass: 'text-amber-600',
      textClass: 'text-amber-700'
    },
    ready_to_begin: {
      icon: PlayCircleIcon,
      bgClass: 'bg-gray-50',
      borderClass: 'border-gray-200',
      iconClass: 'text-gray-500',
      textClass: 'text-gray-600'
    },
    ready_when_you_are: {
      icon: PlayCircleIcon,
      bgClass: 'bg-gray-50',
      borderClass: 'border-gray-200',
      iconClass: 'text-gray-500',
      textClass: 'text-gray-600'
    },
    finding_rhythm: {
      icon: ArrowTrendingUpIcon,
      bgClass: 'bg-blue-50',
      borderClass: 'border-blue-200',
      iconClass: 'text-blue-600',
      textClass: 'text-blue-700'
    }
  };

  const config = stateConfig[state] || stateConfig.finding_rhythm;
  const Icon = config.icon;

  if (compact) {
    // Compact version for mobile or tight spaces
    return (
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${config.bgClass} ${config.borderClass} cursor-pointer hover:shadow-md transition-all`}
        title={`${stateDisplay}: ${message} (Click to learn more)`}
      >
        <Icon className={`w-4 h-4 ${config.iconClass}`} />
        <span
          className={`text-xs font-medium ${config.textClass}`}
          style={{ fontFamily: 'Poppins' }}
        >
          {stateDisplay}
        </span>
      </button>
    );
  }

  // Full version with message
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${config.bgClass} ${config.borderClass} cursor-pointer hover:shadow-md transition-all`}
      title="Click to learn more about rhythm tracking"
    >
      <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${config.iconClass}`} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
        <span
          className={`text-xs sm:text-sm font-semibold ${config.textClass}`}
          style={{ fontFamily: 'Poppins' }}
        >
          {stateDisplay}
        </span>
        <span
          className="hidden sm:inline text-xs text-gray-500"
          style={{ fontFamily: 'Poppins' }}
        >
          {message}
        </span>
      </div>
    </button>
  );
};

export default RhythmIndicator;
