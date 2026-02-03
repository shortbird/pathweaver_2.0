import { BoltIcon, CheckCircleIcon, InformationCircleIcon, TrophyIcon } from '@heroicons/react/24/outline';
import { Modal, Alert, Card, CardTitle } from '../ui';

/**
 * BadgeInfoModal - Explains badge requirements and XP system
 * Shows:
 * - Both quest completion AND XP requirements must be met
 * - XP is earned from tasks, not quests or badges
 * - Quest completion bonus (50%)
 * - Badge completion bonus (500 XP)
 */
export default function BadgeInfoModal({ isOpen, onClose, badge }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      header={
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg">
            <InformationCircleIcon className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">How to Earn This Badge</h2>
        </div>
      }
    >

        {/* Content */}
        <div className="space-y-6">
          {/* Requirements Section */}
          <div>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <TrophyIcon className="w-5 h-5 text-optio-purple" />
              Badge Requirements
            </h3>
            <Alert variant="purple">
              <p className="mb-4">
                To earn <span className="font-semibold text-purple-700">{badge.name}</span>, you must meet <strong>BOTH</strong> of these requirements:
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="bg-optio-purple text-white rounded-full p-1 mt-0.5">
                    <CheckCircleIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-purple-900">Complete {badge.min_quests} Quests</p>
                    <p className="text-sm text-gray-600">
                      Finish any {badge.min_quests} quests from this badge's quest pathway
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-optio-purple text-white rounded-full p-1 mt-0.5">
                    <CheckCircleIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-purple-900">Earn {badge.min_xp} XP</p>
                    <p className="text-sm text-gray-600">
                      Accumulate at least {badge.min_xp} XP from completing tasks in this badge's quests
                    </p>
                  </div>
                </div>
              </div>
            </Alert>
          </div>

          {/* XP System Explanation */}
          <div>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <BoltIcon className="w-5 h-5 text-yellow-500" />
              How XP Works
            </h3>
            <div className="space-y-4">
              {/* Task XP */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-start gap-3 mb-2">
                  <div className="bg-blue-500 text-white rounded px-2 py-1 text-sm font-bold">1</div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 mb-1">XP from Tasks</p>
                    <p className="text-sm text-gray-600">
                      You earn XP by <strong>completing individual tasks</strong>. Each task has its own XP value based on difficulty and subject area.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quest Bonus */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-start gap-3 mb-2">
                  <div className="bg-blue-500 text-white rounded px-2 py-1 text-sm font-bold">2</div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 mb-1">Quest Completion Bonus</p>
                    <p className="text-sm text-gray-600">
                      When you complete <strong>all tasks</strong> in a quest, you receive a <strong className="text-green-600">50% bonus</strong> on the total XP from that quest (rounded to nearest 50 XP).
                    </p>
                  </div>
                </div>
              </div>

              {/* Badge Bonus */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg p-4">
                <div className="flex items-start gap-3 mb-2">
                  <div className="bg-gradient-primary text-white rounded px-2 py-1 text-sm font-bold">3</div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                      Badge Completion Bonus
                      <TrophyIcon className="w-4 h-4 text-yellow-500" />
                    </p>
                    <p className="text-sm text-gray-700">
                      When you earn this badge, you'll receive a <strong className="text-optio-purple">500 XP bonus</strong> in the {badge.pillar_primary} pillar. This is <em>in addition to</em> all the XP you earned from completing tasks!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Example Calculation */}
          <Alert variant="info" title="Example">
            <p className="text-sm mb-2">
              If you complete tasks worth 1,800 XP across 6 quests, and finish all tasks in each quest, you'll earn:
            </p>
            <ul className="text-sm space-y-1 ml-4">
              <li>• 1,800 XP from tasks</li>
              <li>• ~900 XP from quest completion bonuses (50% of 1,800)</li>
              <li>• 500 XP badge completion bonus</li>
              <li className="font-semibold text-blue-900 pt-1">= 3,200 XP total!</li>
            </ul>
          </Alert>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gradient-primary text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
          >
            Got It!
          </button>
        </div>
    </Modal>
  );
}
