import React from 'react';
import UnifiedEvidenceDisplay from '../evidence/UnifiedEvidenceDisplay';
import { getPillarGradient, getPillarDisplayName } from '../../config/pillars';

const AchievementDetailModal = ({ isOpen, onClose, achievement }) => {
  if (!isOpen || !achievement) return null;

  // Legacy pillar name mappings for backward compatibility
  const legacyPillarMapping = {
    'Arts & Creativity': 'art',
    'STEM & Logic': 'stem',
    'Life & Wellness': 'wellness',
    'Language & Communication': 'communication',
    'Society & Culture': 'civics',
    'arts_creativity': 'art',
    'stem_logic': 'stem',
    'life_wellness': 'wellness',
    'language_communication': 'communication',
    'society_culture': 'civics',
    'creativity': 'art',
    'critical_thinking': 'stem',
    'practical_skills': 'wellness',
    'cultural_literacy': 'civics'
  };

  const normalizePillarKey = (key) => {
    if (!key) return 'art';
    const lowerKey = key.toLowerCase();
    return legacyPillarMapping[key] || legacyPillarMapping[lowerKey] || lowerKey;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const renderEvidence = (evidence) => {
    const normalizedEvidence = {
      evidence_type: evidence.evidence_type,
      evidence_blocks: evidence.evidence_blocks,
      evidence_text: evidence.evidence_text || evidence.evidence_content,
      evidence_url: evidence.evidence_url || (evidence.evidence_type === 'link' ? evidence.evidence_content : null)
    };

    return <UnifiedEvidenceDisplay evidence={normalizedEvidence} displayMode="full" />;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-full sm:max-w-3xl mx-2 sm:mx-0 w-full max-h-[90vh] overflow-y-auto" style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
        <div className="sticky top-0 p-4 sm:p-8 z-10 bg-gradient-primary">
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white leading-tight" style={{ letterSpacing: '-0.5px' }}>
                {achievement.quest.title}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-white/80 text-sm">
                  {achievement.status === 'completed'
                    ? `Completed on ${formatDate(achievement.completed_at)}`
                    : `Started on ${formatDate(achievement.started_at)}`
                  }
                </span>
                {achievement.status === 'in_progress' && achievement.progress && (
                  <span className="px-2 py-1 bg-white/20 rounded text-xs text-white font-medium">
                    {achievement.progress.completed_tasks}/{achievement.progress.total_tasks} tasks completed
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-2 transition-colors shrink-0 min-h-[44px] min-w-[44px]">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-8">
          <div className="mb-6 sm:mb-8 p-4 sm:p-6 rounded-xl bg-gradient-subtle-strong">
            <h3 className="text-base sm:text-lg font-bold mb-3 text-optio-purple">Adventure Overview</h3>
            <p className="text-sm sm:text-base text-primary" style={{ lineHeight: 1.7 }}>{achievement.quest.description || achievement.quest.big_idea || 'A journey of discovery and growth.'}</p>
          </div>

          <div>
            <h3 className="text-base sm:text-lg font-bold mb-4 text-primary">Learning Journey & Evidence</h3>
            <div className="space-y-4">
              {Object.entries(achievement.task_evidence)
                .sort(([, a], [, b]) => new Date(a.completed_at) - new Date(b.completed_at))
                .map(([taskTitle, evidence], index) => {
                const normalizedPillar = normalizePillarKey(evidence.pillar);
                const displayPillar = getPillarDisplayName(normalizedPillar);
                const gradientClass = getPillarGradient(normalizedPillar);

                return (
                  <div key={taskTitle} className="rounded-xl p-4 sm:p-5" style={{ background: 'white', border: '1px solid rgba(109,70,155,0.15)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <div className="mb-3">
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-primary text-white flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm sm:text-base leading-tight text-primary">{taskTitle}</h4>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
                            <span className={`inline-block px-2 sm:px-3 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r ${gradientClass} shadow-optio`}>
                              {displayPillar}
                            </span>
                            <span className="text-xs sm:text-sm font-medium text-green-600">
                              +{evidence.xp_awarded} Growth Points
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDate(evidence.completed_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 ml-10 sm:ml-11">
                      <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2">Learning Evidence:</p>
                      {renderEvidence(evidence)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={`mt-6 p-4 rounded-lg border ${achievement.status === 'completed' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
              <div className="flex items-center gap-2">
                <svg className={`w-5 h-5 ${achievement.status === 'completed' ? 'text-green-600' : 'text-blue-600'}`} fill="currentColor" viewBox="0 0 20 20">
                  {achievement.status === 'completed' ? (
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  ) : (
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  )}
                </svg>
                <span className={`font-semibold ${achievement.status === 'completed' ? 'text-green-800' : 'text-blue-800'}`}>
                  {achievement.status === 'completed'
                    ? `Total Growth: +${achievement.total_xp_earned} Points`
                    : `Growth So Far: +${achievement.total_xp_earned} Points`
                  }
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AchievementDetailModal;
