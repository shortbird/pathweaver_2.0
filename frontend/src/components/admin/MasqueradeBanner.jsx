import React, { useState } from 'react';
import { AlertTriangle, LogOut, ChevronUp, ChevronDown } from 'lucide-react';

/**
 * MasqueradeBanner - Floating badge shown during admin masquerade sessions
 *
 * Displays when admin is viewing platform as another user
 * Positioned in bottom-left corner, below sidebar navigation
 * Expandable to show full user details
 * Provides quick exit button to return to admin session
 */
const MasqueradeBanner = ({ targetUser, onExit }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="fixed bottom-4 left-4 z-[60] transition-all duration-300">
      {/* Collapsed Badge */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-4 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105"
        >
          <AlertTriangle className="w-5 h-5 animate-pulse" />
          <span className="font-semibold text-sm">
            Masquerading
          </span>
          <ChevronUp className="w-4 h-4" />
        </button>
      )}

      {/* Expanded Badge */}
      {isExpanded && (
        <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-lg shadow-lg p-4 min-w-[280px] sm:min-w-[320px]">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span className="font-semibold text-sm">
                Masquerade Mode
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
            <div className="text-xs opacity-90 mb-2">Viewing as:</div>
            <div className="flex items-center gap-2">
              {targetUser?.avatar_url && (
                <img
                  src={targetUser.avatar_url}
                  alt={targetUser.display_name}
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
            <LogOut className="w-4 h-4" />
            <span>Exit Masquerade</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default MasqueradeBanner;
