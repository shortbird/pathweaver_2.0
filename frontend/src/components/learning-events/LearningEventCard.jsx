import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import LearningEventDetailModal from './LearningEventDetailModal';

const LearningEventCard = ({ event }) => {
  const [showDetailModal, setShowDetailModal] = useState(false);
  const pillarConfig = {
    'stem_logic': { name: 'STEM & Logic', icon: '🔬', color: 'from-blue-500 to-cyan-500', bg: 'bg-blue-50', text: 'text-blue-700' },
    'life_wellness': { name: 'Life & Wellness', icon: '🌱', color: 'from-green-500 to-emerald-500', bg: 'bg-green-50', text: 'text-green-700' },
    'language_communication': { name: 'Language & Communication', icon: '💬', color: 'from-orange-500 to-yellow-500', bg: 'bg-orange-50', text: 'text-orange-700' },
    'society_culture': { name: 'Society & Culture', icon: '🌍', color: 'from-red-500 to-rose-500', bg: 'bg-red-50', text: 'text-red-700' },
    'arts_creativity': { name: 'Arts & Creativity', icon: '🎨', color: 'from-purple-500 to-pink-500', bg: 'bg-purple-50', text: 'text-purple-700' }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const hasEvidence = event.evidence_blocks && event.evidence_blocks.length > 0;

  return (
    <>
      <div
        onClick={() => setShowDetailModal(true)}
        className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all duration-200 cursor-pointer">
      {/* Date */}
      <div className="flex items-center gap-2 text-gray-500 text-sm mb-3">
        <Calendar className="w-4 h-4" />
        <span>{formatDate(event.created_at)}</span>
      </div>

      {/* Description */}
      <div className="mb-4">
        <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
          {event.description}
        </p>
      </div>

      {/* Pillars and Evidence */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Pillar Tags */}
        {event.pillars && event.pillars.length > 0 && event.pillars.map((pillar) => {
          const config = pillarConfig[pillar];
          if (!config) return null;

          return (
            <div
              key={pillar}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${config.bg} ${config.text} border border-${config.text.replace('text-', '')}/20`}
            >
              <span>{config.icon}</span>
              <span>{config.name}</span>
            </div>
          );
        })}

        {/* Evidence Indicator */}
        {hasEvidence && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
            <span>{event.evidence_blocks.length} evidence {event.evidence_blocks.length === 1 ? 'item' : 'items'}</span>
          </div>
        )}
      </div>
      </div>

      <LearningEventDetailModal
        event={event}
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
      />
    </>
  );
};

export default LearningEventCard;
