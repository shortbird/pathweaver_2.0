import React from 'react';
import { Star } from 'lucide-react';

/**
 * HubFilters Component
 * Pillar-based filter buttons for the unified hub
 * Uses star icons and purple→pink gradient for selected state
 */
export default function HubFilters({ selectedPillar, onPillarChange }) {
  const pillars = [
    { key: 'ALL', label: 'ALL' },
    { key: 'STEM & Logic', label: 'STEM & Logic' },
    { key: 'Language & Communication', label: 'Language & Communication' },
    { key: 'Society & Culture', label: 'Society & Culture' },
    { key: 'Arts & Creativity', label: 'Arts & Creativity' }
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
                ? 'bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-sm'
              }
            `}
          >
            <Star className="w-4 h-4" fill={selectedPillar === pillar.key ? 'currentColor' : 'none'} />
            <span>{pillar.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
