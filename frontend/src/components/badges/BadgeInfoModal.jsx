import { X, Zap, CheckCircle, Trophy, Info } from 'lucide-react';

/**
 * BadgeInfoModal - Explains badge requirements and XP system
 * Shows:
 * - Both quest completion AND XP requirements must be met
 * - XP is earned from tasks, not quests or badges
 * - Quest completion bonus (50%)
 * - Badge completion bonus (500 XP)
 */
export default function BadgeInfoModal({ isOpen, onClose, badge }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-primary-reverse p-2 rounded-lg">
              <Info className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-2xl font-bold">How to Earn This Badge</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Requirements Section */}
          <div>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-purple-600" />
              Badge Requirements
            </h3>
            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
              <p className="text-gray-700 mb-4">
                To earn <span className="font-semibold text-purple-700">{badge.name}</span>, you must meet <strong>BOTH</strong> of these requirements:
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="bg-purple-600 text-white rounded-full p-1 mt-0.5">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-purple-900">Complete {badge.min_quests} Quests</p>
                    <p className="text-sm text-gray-600">
                      Finish any {badge.min_quests} quests from this badge's quest pathway
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-purple-600 text-white rounded-full p-1 mt-0.5">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-purple-900">Earn {badge.min_xp} XP</p>
                    <p className="text-sm text-gray-600">
                      Accumulate at least {badge.min_xp} XP from completing tasks in this badge's quests
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* XP System Explanation */}
          <div>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
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
                  <div className="bg-gradient-primary-reverse text-white rounded px-2 py-1 text-sm font-bold">3</div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                      Badge Completion Bonus
                      <Trophy className="w-4 h-4 text-yellow-500" />
                    </p>
                    <p className="text-sm text-gray-700">
                      When you earn this badge, you'll receive a <strong className="text-purple-600">500 XP bonus</strong> in the {badge.pillar_primary} pillar. This is <em>in addition to</em> all the XP you earned from completing tasks!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Example Calculation */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
            <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Example
            </h4>
            <p className="text-sm text-gray-700">
              If you complete tasks worth 1,800 XP across 6 quests, and finish all tasks in each quest, you'll earn:
            </p>
            <ul className="text-sm text-gray-700 mt-2 space-y-1 ml-4">
              <li>• 1,800 XP from tasks</li>
              <li>• ~900 XP from quest completion bonuses (50% of 1,800)</li>
              <li>• 500 XP badge completion bonus</li>
              <li className="font-semibold text-blue-900 pt-1">= 3,200 XP total!</li>
            </ul>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gradient-primary-reverse text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
          >
            Got It!
          </button>
        </div>
      </div>
    </div>
  );
}
