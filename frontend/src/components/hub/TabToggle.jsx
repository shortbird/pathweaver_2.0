import React from 'react';

/**
 * TabToggle Component
 * Switches between BADGES and QUESTS view in the unified hub
 * Uses purple→pink gradient (left to right)
 */
export default function TabToggle({ activeTab, onTabChange }) {
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => onTabChange('badges')}
        className={`
          px-8 py-3 rounded-full font-semibold text-lg transition-all duration-300 transform
          ${activeTab === 'badges'
            ? 'bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white shadow-lg scale-105'
            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
          }
        `}
      >
        BADGES
      </button>

      <button
        onClick={() => onTabChange('quests')}
        className={`
          px-8 py-3 rounded-full font-semibold text-lg transition-all duration-300 transform
          ${activeTab === 'quests'
            ? 'bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white shadow-lg scale-105'
            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
          }
        `}
      >
        QUESTS
      </button>
    </div>
  );
}
