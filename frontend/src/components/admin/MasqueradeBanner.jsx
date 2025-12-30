import React, { useState } from 'react';
import { ExclamationTriangleIcon, ArrowLeftOnRectangleIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

/**
 * MasqueradeBanner - Badge shown during admin masquerade sessions
 *
 * Displays when admin is viewing platform as another user
 * Can be inline (in sidebar) or fixed position (fallback for mobile)
 * Expandable to show full user details
 * Provides quick exit button to return to admin session
 */
const MasqueradeBanner = ({ targetUser, onExit, inline = false, isExpanded: controlledExpanded, onToggleExpand }) => {
  const [internalExpanded, setInternalExpanded] = useState(false);

  // Support both controlled and uncontrolled expansion
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const handleToggleExpand = onToggleExpand || (() => setInternalExpanded(prev => !prev));

  // For inline mode (inside sidebar), use relative positioning
  const containerClass = inline
    ? "relative transition-all duration-300"
    : "fixed bottom-4 left-4 z-[60] transition-all duration-300";

  return (
    <div className={containerClass}>
      {/* Collapsed Badge */}
      {!isExpanded && (
        <button
          onClick={() => handleToggleExpand()}
          className="flex items-center gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-3 py-2 sm:px-4 sm:py-3 rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105"
        >
          <ExclamationTriangleIcon className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
          <span className="font-semibold text-xs sm:text-sm">
            Masquerading as {targetUser?.display_name?.split(' ')[0] || 'User'}
          </span>
          <ChevronUpIcon className="w-3 h-3 sm:w-4 sm:h-4" />
        </button>
      )}

      {/* Expanded Badge */}
      {isExpanded && (
        <div className={`bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-lg shadow-lg p-3 sm:p-4 ${inline ? 'w-full' : 'min-w-[260px] sm:min-w-[300px] max-w-[90vw]'}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              <span className="font-semibold text-xs sm:text-sm">
                Masquerade Mode
              </span>
            </div>
            <button
              onClick={() => handleToggleExpand()}
              className="text-white/80 hover:text-white transition-colors"
            >
              <ChevronDownIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-3 pb-3 border-b border-white/20">
            <div className="text-xs opacity-90 mb-2">Viewing as:</div>
            <div className="flex items-center gap-2">
              {targetUser?.avatar_url && (
                <img
                  src={targetUser.avatar_url}
                  alt={`Profile picture of ${targetUser.display_name}`}
                  className="w-8 h-8 rounded-full border-2 border-white"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">
                  {targetUser?.display_name || targetUser?.email}
                </div>
                <div className="text-xs opacity-90 bg-white/20 px-2 py-0.5 rounded inline-block mt-1">
                  {targetUser?.role || 'User'}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={onExit}
            className="w-full flex items-center justify-center gap-2 bg-white text-orange-600 hover:bg-orange-50 px-4 py-2 rounded-lg font-semibold transition-colors shadow-md"
          >
            <ArrowLeftOnRectangleIcon className="w-4 h-4" />
            <span>Exit Masquerade</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default MasqueradeBanner;
