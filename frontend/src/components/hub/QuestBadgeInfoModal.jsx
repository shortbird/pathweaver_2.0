import React from 'react';
import { CheckCircleIcon, FireIcon, SparklesIcon, TrophyIcon } from '@heroicons/react/24/outline';
import { Modal } from '../ui';

/**
 * QuestBadgeInfoModal
 * Educational modal explaining the differences between badges and quests
 * Helps users understand when to pursue badges vs individual quests
 */
const QuestBadgeInfoModal = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Understanding Badges & Quests"
      size="lg"
      footer={
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-gradient-primary text-white font-semibold rounded-lg hover:shadow-lg transform hover:scale-105 transition-all duration-200"
          >
            Got It!
          </button>
        </div>
      }
      footerClassName="bg-gray-50"
    >
      <div className="space-y-6">
        {/* Badges Section */}
        <div className="bg-gradient-to-r from-[#6d469b]/10 to-[#ef597b]/10 rounded-xl p-6 border border-optio-purple/20">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-gradient-primary rounded-lg">
              <TrophyIcon className="w-6 h-6 text-white" />
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
                  <CheckCircleIcon className="w-5 h-5 text-optio-purple mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700">
                    <strong>Structured Growth:</strong> Follow a recommended sequence of quests designed to build skills progressively
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircleIcon className="w-5 h-5 text-optio-purple mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700">
                    <strong>Multiple Quests:</strong> Requires completing several related quests to earn the badge
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircleIcon className="w-5 h-5 text-optio-purple mt-0.5 flex-shrink-0" />
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
            <div className="p-3 bg-gradient-primary rounded-lg">
              <FireIcon className="w-6 h-6 text-white" />
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
                  <CheckCircleIcon className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700">
                    <strong>Flexible Exploration:</strong> Choose any quest that interests you, in any order
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircleIcon className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700">
                    <strong>Standalone Tasks:</strong> Complete a quest and move on, or pursue multiple at once
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircleIcon className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
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
            <SparklesIcon className="w-6 h-6 text-optio-purple mt-1" />
            <h4 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Choosing Your Path
            </h4>
          </div>
          <div className="space-y-3 text-gray-700">
            <p>
              <strong className="text-optio-purple">Choose Badges when:</strong> You want structured guidance,
              long-term skill development, or a clear path toward mastery in a subject area.
            </p>
            <p>
              <strong className="text-optio-pink">Choose Quests when:</strong> You prefer flexibility,
              want to explore diverse topics, or need quick wins to build momentum.
            </p>
            <p className="italic border-l-4 border-optio-purple pl-4 bg-white p-3 rounded">
              Remember: <strong>The Process Is The Goal.</strong> Whether you pursue badges or quests,
              celebrate the journey of becoming who you are through learning.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default QuestBadgeInfoModal;
