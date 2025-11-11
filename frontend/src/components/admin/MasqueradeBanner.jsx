import React from 'react';
import { AlertTriangle, LogOut } from 'lucide-react';

/**
 * MasqueradeBanner - Sticky banner shown during admin masquerade sessions
 *
 * Displays when admin is viewing platform as another user
 * Sticks to top of screen when scrolling
 * Provides quick exit button to return to admin session
 */
const MasqueradeBanner = ({ targetUser, onExit }) => {
  return (
    <div className="sticky top-0 left-0 right-0 bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-4 py-3 shadow-lg z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            <span className="font-semibold text-sm sm:text-base">
              Masquerading as:
            </span>
            <div className="flex items-center gap-2">
              {targetUser?.avatar_url && (
                <img
                  src={targetUser.avatar_url}
                  alt={targetUser.display_name}
                  className="w-6 h-6 rounded-full border-2 border-white"
                />
              )}
              <span className="font-bold text-base sm:text-lg">
                {targetUser?.display_name || targetUser?.email}
              </span>
              <span className="text-xs sm:text-sm opacity-90 bg-white/20 px-2 py-0.5 rounded">
                {targetUser?.role || 'User'}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onExit}
          className="flex items-center gap-2 bg-white text-orange-600 hover:bg-orange-50 px-4 py-2 rounded-lg font-semibold transition-colors shadow-md flex-shrink-0"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Exit Masquerade</span>
          <span className="sm:hidden">Exit</span>
        </button>
      </div>
    </div>
  );
};

export default MasqueradeBanner;
