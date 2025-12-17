import React, { useState } from 'react';
import { UserCircle, X, ChevronUp, ChevronDown } from 'lucide-react';

/**
 * ActingAsBanner - Floating badge shown when parent is managing a dependent's account
 *
 * Displays when parent is acting as a dependent child
 * Positioned in bottom-right corner (opposite of masquerade banner)
 * Mobile-responsive: compact on small screens, expandable to show details
 * Provides quick way to understand current context
 */
const ActingAsBanner = ({ dependent, onSwitchBack }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!dependent) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60] transition-all duration-300">
      {/* Collapsed Badge - Compact for mobile */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white px-3 py-2 sm:px-4 sm:py-3 rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105"
        >
          <UserCircle className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="font-semibold text-xs sm:text-sm">
            Acting as {dependent.display_name?.split(' ')[0] || 'Child'}
          </span>
          <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4" />
        </button>
      )}

      {/* Expanded Badge - Shows full details */}
      {isExpanded && (
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg shadow-lg p-3 sm:p-4 min-w-[260px] sm:min-w-[300px] max-w-[90vw]">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <UserCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              <span className="font-semibold text-xs sm:text-sm">
                Parent Mode
              </span>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-white/80 hover:text-white transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-3 pb-3 border-b border-white/20">
            <div className="text-xs opacity-90 mb-2">Managing profile for:</div>
            <div className="flex items-center gap-2">
              {dependent?.avatar_url ? (
                <img
                  src={dependent.avatar_url}
                  alt={dependent.display_name}
                  className="w-8 h-8 rounded-full border-2 border-white"
                />
              ) : (
                <div className="w-8 h-8 rounded-full border-2 border-white bg-white/20 flex items-center justify-center">
                  <UserCircle className="w-5 h-5 text-white" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">
                  {dependent?.display_name || 'Child'}
                </div>
                {dependent?.age && (
                  <div className="text-xs opacity-90 bg-white/20 px-2 py-0.5 rounded inline-block mt-1">
                    Age {dependent.age}
                  </div>
                )}
              </div>
            </div>
          </div>

          {onSwitchBack && (
            <button
              onClick={onSwitchBack}
              className="w-full flex items-center justify-center gap-2 bg-white text-optio-purple hover:bg-purple-50 px-3 py-2 rounded-lg font-semibold transition-colors shadow-md text-sm"
            >
              <X className="w-4 h-4" />
              <span>Back to Parent View</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ActingAsBanner;
