import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AcademicCapIcon, BookOpenIcon, CheckCircleIcon, PaperAirplaneIcon, PlusIcon, TrophyIcon } from '@heroicons/react/24/outline';
import confetti from 'canvas-confetti';
import { getSubjectName } from '../../constants/subjects';
import { useAuth } from '../../contexts/AuthContext';

const QuestCompletionCelebration = ({
  quest,
  completedTasksCount,
  totalXP,
  onAddMoreTasks,
  onFinishQuest,
  onClose,
  isClass = false,
  onSubmitForReview,
  submitting = false
}) => {
  const navigate = useNavigate();
  const { effectiveRole } = useAuth();
  const [showDialog, setShowDialog] = useState(false);
  // A guardian finishing a quest their school set for families has no diploma
  // page of their own — /overview is a student surface. Offering the link at
  // the moment they finish would bounce them to their own home.
  const isParent = effectiveRole === 'parent';

  // Detect empty quest (no tasks remaining) vs all tasks completed
  const isEmptyQuest = !quest?.quest_tasks?.length;

  // Class quests aren't "complete" when tasks are done — they're ready to submit
  // to Optio for a final review that issues the transcript credit. Distinct copy
  // + actions from a regular quest. (Empty quests keep the generic flow.)
  const isClassReady = isClass && !isEmptyQuest;
  const subjectName = getSubjectName(quest?.transcript_subject || '') || 'this';

  useEffect(() => {
    // Skip confetti for empty quests
    if (isEmptyQuest) return;

    // Fire celebration confetti
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = {
      startVelocity: 30,
      spread: 360,
      ticks: 80,
      zIndex: 9999,
      particleCount: 100
    };

    function randomInRange(min, max) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      const particleCount = 50 * (timeLeft / duration);

      // Fire from multiple positions for more celebration
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981']
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981']
      });
    }, 250);

    return () => clearInterval(interval);
  }, [isEmptyQuest]);

  const handleFinishClick = () => {
    setShowDialog(true);
  };

  const handleConfirmFinish = () => {
    setShowDialog(false);
    onFinishQuest();
  };

  const handleAddMore = () => {
    onAddMoreTasks();
    onClose();
  };

  return (
    <>
      {/* Main Celebration Modal */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-8 relative overflow-hidden">
          {/* Gradient background decoration */}
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-br from-optio-purple/10 via-optio-pink/10 to-yellow-400/10 -z-10" />

          {/* Icon */}
          <div className="flex justify-center mb-6">
            {isEmptyQuest ? (
              <div className="w-24 h-24 bg-gradient-primary rounded-full flex items-center justify-center shadow-lg">
                <BookOpenIcon className="w-14 h-14 text-white" />
              </div>
            ) : isClassReady ? (
              <div className="w-24 h-24 bg-gradient-primary rounded-full flex items-center justify-center shadow-lg">
                <AcademicCapIcon className="w-14 h-14 text-white" />
              </div>
            ) : (
              <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-full flex items-center justify-center shadow-lg">
                <TrophyIcon className="w-14 h-14 text-white" />
              </div>
            )}
          </div>

          {/* Message */}
          <div className="text-center mb-8">
            {isEmptyQuest ? (
              <>
                <h2 className="text-3xl font-bold text-gray-900 mb-3">
                  No Tasks in Quest
                </h2>
                <p className="text-2xl font-semibold text-gray-800 mb-2">
                  {quest?.title || 'Your Quest'}
                </p>
                <p className="text-gray-600 text-lg">
                  This quest doesn't have any tasks yet. Add some tasks to get started, or finish the quest.
                </p>
              </>
            ) : isClassReady ? (
              <>
                <h2 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-3">
                  All tasks complete!
                </h2>
                <p className="text-2xl font-semibold text-gray-800 mb-2">
                  {quest?.title || 'Your Class'}
                </p>
                <p className="text-gray-600 text-lg">
                  Great work! You've finished every task in this class.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-3">
                  Quest Complete!
                </h2>
                <p className="text-2xl font-semibold text-gray-800 mb-2">
                  {quest?.title || 'Your Quest'}
                </p>
                <p className="text-gray-600 text-lg">
                  Amazing work! You've completed all tasks in this quest.
                </p>
              </>
            )}
          </div>

          {/* Stats - only show when there are completed tasks */}
          {!isEmptyQuest && (
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-gradient-to-br from-optio-purple/10 to-optio-purple/5 rounded-2xl p-6 text-center">
                <div className="text-3xl font-bold text-optio-purple mb-1">
                  {completedTasksCount}
                </div>
                <div className="text-sm text-gray-600 font-medium">
                  Tasks Completed
                </div>
              </div>
              <div className="bg-gradient-to-br from-yellow-400/10 to-yellow-400/5 rounded-2xl p-6 text-center">
                <div className="text-3xl font-bold text-yellow-600 mb-1">
                  {totalXP}
                </div>
                <div className="text-sm text-gray-600 font-medium">
                  XP Earned
                </div>
              </div>
            </div>
          )}

          {/* Question prompt */}
          <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-2xl p-6 mb-6 border-2 border-optio-purple/20">
            <p className="text-center text-lg font-semibold text-gray-800 mb-2">
              {isClassReady ? 'Ready to submit for credit?' : 'What would you like to do next?'}
            </p>
            <p className="text-center text-gray-600 text-sm">
              {isClassReady
                ? `An Optio teacher will review your work. If a task needs more evidence, they'll send it back with notes. Once it's approved, your ${subjectName} credit is added to your transcript.`
                : isEmptyQuest
                  ? 'Add tasks to personalize your quest, or finish and return to your dashboard.'
                  : 'Add more tasks to keep learning, or finish this quest and return to your dashboard.'}
            </p>
          </div>

          {/* Action buttons */}
          {isClassReady ? (
            <div className="flex gap-4">
              <button
                onClick={onSubmitForReview}
                disabled={submitting}
                className="btn-primary btn-lg flex-1"
              >
                <PaperAirplaneIcon className="w-5 h-5" />
                {submitting ? 'Submitting…' : 'Submit to Optio'}
              </button>
              <button
                onClick={onClose}
                disabled={submitting}
                className="btn-quiet btn-lg flex-1"
              >
                <PlusIcon className="w-5 h-5" />
                Continue working
              </button>
            </div>
          ) : (
            <div className="flex gap-4">
              <button
                onClick={handleAddMore}
                className="btn-primary btn-lg flex-1"
              >
                <PlusIcon className="w-5 h-5" />
                {isEmptyQuest ? 'Add Tasks' : 'Add More Tasks'}
              </button>
              <button
                onClick={handleFinishClick}
                className="btn-quiet btn-lg flex-1"
              >
                <CheckCircleIcon className="w-5 h-5" />
                Finish Quest
              </button>
            </div>
          )}

          {/* View diploma link - only for regular completed quests (not class review) */}
          {!isEmptyQuest && !isClassReady && !isParent && (
            <div className="text-center mt-6">
              <button
                onClick={() => navigate('/overview')}
                className="inline-flex items-center gap-2 text-optio-purple hover:text-optio-pink transition-colors font-medium"
              >
                <BookOpenIcon className="w-4 h-4" />
                View on Diploma
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <img src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg" alt="Optio" className="w-16 h-16" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">
                Finish This Quest?
              </h3>
              <p className="text-gray-600">
                This will save your progress and return you to your dashboard. You can always view your completed work on your diploma page.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDialog(false)}
                className="btn-quiet flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmFinish}
                className="btn-primary flex-1"
              >
                Finish Quest
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default QuestCompletionCelebration;
