import { useState, useEffect } from 'react';
import { Trophy, Plus, CheckCircle, BookOpen, Home } from 'lucide-react';
import confetti from 'canvas-confetti';

const QuestCompletionCelebration = ({
  quest,
  completedTasksCount,
  totalXP,
  onAddMoreTasks,
  onFinishQuest,
  onClose
}) => {
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
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
  }, []);

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

          {/* Trophy icon */}
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-full flex items-center justify-center shadow-lg">
              <Trophy className="w-14 h-14 text-white" />
            </div>
          </div>

          {/* Celebration message */}
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-transparent mb-3" style={{ fontFamily: 'Poppins' }}>
              Quest Complete!
            </h2>
            <p className="text-2xl font-semibold text-gray-800 mb-2" style={{ fontFamily: 'Poppins' }}>
              {quest?.title || 'Your Quest'}
            </p>
            <p className="text-gray-600 text-lg" style={{ fontFamily: 'Poppins' }}>
              Amazing work! You've completed all tasks in this quest.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-gradient-to-br from-optio-purple/10 to-optio-purple/5 rounded-2xl p-6 text-center">
              <div className="text-3xl font-bold text-optio-purple mb-1" style={{ fontFamily: 'Poppins' }}>
                {completedTasksCount}
              </div>
              <div className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins' }}>
                Tasks Completed
              </div>
            </div>
            <div className="bg-gradient-to-br from-yellow-400/10 to-yellow-400/5 rounded-2xl p-6 text-center">
              <div className="text-3xl font-bold text-yellow-600 mb-1" style={{ fontFamily: 'Poppins' }}>
                {totalXP}
              </div>
              <div className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins' }}>
                XP Earned
              </div>
            </div>
          </div>

          {/* Question prompt */}
          <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-2xl p-6 mb-6 border-2 border-optio-purple/20">
            <p className="text-center text-lg font-semibold text-gray-800 mb-2" style={{ fontFamily: 'Poppins' }}>
              What would you like to do next?
            </p>
            <p className="text-center text-gray-600 text-sm" style={{ fontFamily: 'Poppins' }}>
              Add more tasks to keep learning, or finish this quest and return to your dashboard.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleAddMore}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
              style={{ fontFamily: 'Poppins' }}
            >
              <Plus className="w-5 h-5" />
              Add More Tasks
            </button>
            <button
              onClick={handleFinishClick}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-white border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all"
              style={{ fontFamily: 'Poppins' }}
            >
              <CheckCircle className="w-5 h-5" />
              Finish Quest
            </button>
          </div>

          {/* View diploma link */}
          <div className="text-center mt-6">
            <a
              href={`/diploma/${quest?.user_enrollment?.user_id || ''}`}
              className="inline-flex items-center gap-2 text-optio-purple hover:text-optio-pink transition-colors font-medium"
              style={{ fontFamily: 'Poppins' }}
            >
              <BookOpen className="w-4 h-4" />
              View on Diploma
            </a>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center mx-auto mb-4">
                <Home className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2" style={{ fontFamily: 'Poppins' }}>
                Finish This Quest?
              </h3>
              <p className="text-gray-600" style={{ fontFamily: 'Poppins' }}>
                This will save your progress and return you to your dashboard. You can always view your completed work on your diploma page.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDialog(false)}
                className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all"
                style={{ fontFamily: 'Poppins' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmFinish}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
                style={{ fontFamily: 'Poppins' }}
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
