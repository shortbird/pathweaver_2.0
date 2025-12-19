import React from 'react';

/**
 * TabToggle Component
 * BADGES FEATURE DISABLED - Pending redesign
 * Currently only shows QUESTS tab
 */
export default function TabToggle({ activeTab, onTabChange }) {
  return (
    <div className="flex items-center gap-4">
      {/* BADGES TAB DISABLED - Feature under redesign
      <button
        onClick={() => onTabChange('badges')}
        className={`
          px-8 py-3 rounded-full font-semibold text-lg transition-all duration-300 transform
          ${activeTab === 'badges'
            ? 'bg-gradient-primary text-white shadow-lg scale-105'
            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
          }
        `}
      >
        BADGES
      </button>
      */}

      <button
        onClick={() => onTabChange('quests')}
        className={`
          px-8 py-3 rounded-full font-semibold text-lg transition-all duration-300 transform
          ${activeTab === 'quests'
            ? 'bg-gradient-primary text-white shadow-lg scale-105'
            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
          }
        `}
      >
        QUESTS
      </button>
    </div>
  );
}
