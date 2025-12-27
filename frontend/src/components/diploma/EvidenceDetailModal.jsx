import React from 'react';
import UnifiedEvidenceDisplay from '../evidence/UnifiedEvidenceDisplay';
import { getPillarGradient, getPillarDisplayName } from '../../config/pillars';

const EvidenceDetailModal = ({ isOpen, onClose, evidenceItem }) => {
  if (!isOpen || !evidenceItem) return null;

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className={`sticky top-0 p-6 bg-gradient-to-r ${getPillarGradient(evidenceItem.pillar)} z-10`}>
          <div className="flex justify-between items-center">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-white mb-1 truncate">{evidenceItem.questTitle}</h2>
              <p className="text-white/90 text-sm truncate">{evidenceItem.taskTitle}</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-2 transition-colors flex-shrink-0 ml-4"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm font-medium">
              {getPillarDisplayName(evidenceItem.pillar)}
            </span>
            <span className="text-white/90 text-sm">
              +{evidenceItem.xpAwarded} XP
            </span>
            <span className="text-white/80 text-sm">
              {formatDate(evidenceItem.completedAt)}
            </span>
          </div>
        </div>

        <div className="p-6">
          <UnifiedEvidenceDisplay
            evidence={evidenceItem.evidence}
            displayMode="full"
          />
        </div>
      </div>
    </div>
  );
};

export default EvidenceDetailModal;
