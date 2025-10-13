import React from 'react';
import { X, Trophy, Target, Sparkles, CheckCircle } from 'lucide-react';

/**
 * QuestBadgeInfoModal
 * Educational modal explaining the differences between badges and quests
 * Helps users understand when to pursue badges vs individual quests
 */
const QuestBadgeInfoModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h3
            className="text-3xl font-bold bg-gradient-to-r from-[#6d469b] to-[#ef597b] bg-clip-text text-transparent"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            Understanding Badges & Quests
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">

          {/* Badges Section */}
          <div className="bg-gradient-to-r from-[#6d469b]/10 to-[#ef597b]/10 rounded-xl p-6 border border-[#6d469b]/20">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-gradient-to-r from-[#6d469b] to-[#ef597b] rounded-lg">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="text-2xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Badges
                </h4>
                <p className="text-gray-700 mb-4 leading-relaxed">
                  Badges are <strong>long-term learning journeys</strong> that guide you through a curated collection of quests.
                  Think of them as structured paths toward mastering a skill or concept.
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-[#6d469b] mt-0.5 flex-shrink-0" />
                    <p className="text-gray-700">
                      <strong>Structured Growth:</strong> Follow a recommended sequence of quests designed to build skills progressively
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-[#6d469b] mt-0.5 flex-shrink-0" />
                    <p className="text-gray-700">
                      <strong>Multiple Quests:</strong> Requires completing several related quests to earn the badge
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-[#6d469b] mt-0.5 flex-shrink-0" />
                    <p className="text-gray-700">
                      <strong>Achievement Recognition:</strong> Displays on your diploma as a significant accomplishment
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quests Section */}
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-gradient-to-r from-[#6d469b] to-[#ef597b] rounded-lg">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="text-2xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Quests
                </h4>
                <p className="text-gray-700 mb-4 leading-relaxed">
                  Quests are <strong>individual learning adventures</strong> that you can tackle independently.
                  Each quest is a standalone challenge that contributes to your growth.
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-[#ef597b] mt-0.5 flex-shrink-0" />
                    <p className="text-gray-700">
                      <strong>Flexible Exploration:</strong> Choose any quest that interests you, in any order
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-[#ef597b] mt-0.5 flex-shrink-0" />
                    <p className="text-gray-700">
                      <strong>Standalone Tasks:</strong> Complete a quest and move on, or pursue multiple at once
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-[#ef597b] mt-0.5 flex-shrink-0" />
                    <p className="text-gray-700">
                      <strong>Immediate Progress:</strong> See results quickly and build momentum with each completion
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Choosing Your Path Section */}
          <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
            <div className="flex items-start gap-3 mb-4">
              <Sparkles className="w-6 h-6 text-[#6d469b] mt-1" />
              <h4 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                Choosing Your Path
              </h4>
            </div>
            <div className="space-y-3 text-gray-700">
              <p>
                <strong className="text-[#6d469b]">Choose Badges when:</strong> You want structured guidance,
                long-term skill development, or a clear path toward mastery in a subject area.
              </p>
              <p>
                <strong className="text-[#ef597b]">Choose Quests when:</strong> You prefer flexibility,
                want to explore diverse topics, or need quick wins to build momentum.
              </p>
              <p className="italic border-l-4 border-[#6d469b] pl-4 bg-white p-3 rounded">
                Remember: <strong>The Process Is The Goal.</strong> Whether you pursue badges or quests,
                celebrate the journey of becoming who you are through learning.
              </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white font-semibold rounded-lg hover:shadow-lg transform hover:scale-105 transition-all duration-200"
          >
            Got It!
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuestBadgeInfoModal;
