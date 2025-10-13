import React from 'react';

/**
 * HubFilters Component
 * Pillar-based filter buttons for the unified hub
 * Matches the mockup design with clean filter badges
 */
export default function HubFilters({ selectedPillar, onPillarChange }) {
  const pillars = [
    { key: 'ALL', label: 'ALL', icon: '⚡' },
    { key: 'STEM & Logic', label: 'STEM & Logic', icon: '🧪' },
    { key: 'Language & Communication', label: 'Language & Communication', icon: '💬' },
    { key: 'Society & Culture', label: 'Society & Culture', icon: '🌍' },
    { key: 'Arts & Creativity', label: 'Arts & Creativity', icon: '🎨' }
  ];

  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-semibold text-gray-700">
        Filter by Pillar
      </label>
      <div className="flex flex-wrap gap-2">
        {pillars.map((pillar) => (
          <button
            key={pillar.key}
            onClick={() => onPillarChange(pillar.key)}
            className={`
              px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2
              ${selectedPillar === pillar.key
                ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-sm'
              }
            `}
          >
            <span>{pillar.icon}</span>
            <span>{pillar.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
