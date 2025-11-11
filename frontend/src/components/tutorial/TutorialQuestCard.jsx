/**
 * TutorialQuestCard Component
 *
 * Displays the tutorial quest with auto-verified task progress.
 * Shows celebratory animations when tasks are auto-completed.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTutorialProgress } from '../../hooks/useTutorialProgress';

// Pillar icons mapping
const PILLAR_ICONS = {
  stem: '🔬',
  wellness: '🧘',
  communication: '💬',
  civics: '🏛️',
  art: '🎨'
};

// Pillar colors matching brand
const PILLAR_COLORS = {
  stem: 'text-blue-600',
  wellness: 'text-green-600',
  communication: 'text-purple-600',
  civics: 'text-orange-600',
  art: 'text-pink-600'
};

const TutorialQuestCard = () => {
  const navigate = useNavigate();
  const { tutorialStatus, tasks, progress, startTutorial, checkProgress, isVerifying } = useTutorialProgress();
  const [isStarting, setIsStarting] = useState(false);
  const [newlyCompleted, setNewlyCompleted] = useState([]);

  // Handle start tutorial
  const handleStart = async () => {
    setIsStarting(true);
    try {
      await startTutorial();
    } catch (error) {
      console.error('Failed to start tutorial:', error);
      alert('Failed to start tutorial. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  // Show celebration when tasks are auto-completed
  useEffect(() => {
    const checkForNewCompletions = async () => {
      if (!tutorialStatus.started || tutorialStatus.completed) return;

      try {
        const result = await checkProgress();
        if (result.newly_completed && result.newly_completed.length > 0) {
          setNewlyCompleted(result.newly_completed);

          // Clear after 5 seconds
          setTimeout(() => {
            setNewlyCompleted([]);
          }, 5000);
        }
      } catch (error) {
        // Silent fail - progress checking is background
      }
    };

    // Initial check
    checkForNewCompletions();
  }, [tutorialStatus.started, tutorialStatus.completed, checkProgress]);

  // Don't render if tutorial doesn't exist
  if (!tutorialStatus.exists) {
    return null;
  }

  // Loading state
  if (tutorialStatus.loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/2 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
      </div>
    );
  }

  // Tutorial is auto-started on registration - no manual start button needed
  // If not started, don't show anything (tutorial should auto-start)
  if (!tutorialStatus.started) {
    return null;
  }

  // Tutorial completed - show celebration
  if (tutorialStatus.completed) {
    return (
      <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg shadow-lg p-6 text-white mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-2">Tutorial Complete! 🎉</h2>
            <p className="text-green-100 mb-4">
              Congratulations! You've explored the Optio platform and earned {progress.completedCount} XP. You're ready to start your learning journey!
            </p>
            <button
              onClick={() => navigate('/quests')}
              className="bg-white text-green-600 font-semibold px-6 py-3 rounded-lg hover:bg-green-50 transition-colors"
            >
              Browse Quests
            </button>
          </div>
          <div className="text-6xl ml-4">✨</div>
        </div>
      </div>
    );
  }

  // Tutorial in progress
  return (
    <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden border-2 border-purple-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6 text-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold">Explore the Optio Platform</h2>
          <span className="bg-white text-purple-600 px-3 py-1 rounded-full text-sm font-semibold">
            Tutorial
          </span>
        </div>
        <p className="text-purple-100 mb-4">
          Complete tasks to learn how Optio works. Tasks are auto-verified as you explore!
        </p>

        {/* Progress Bar */}
        <div className="bg-purple-900 bg-opacity-30 rounded-full h-3 overflow-hidden">
          <div
            className="bg-white h-full transition-all duration-500 ease-out"
            style={{ width: `${progress.percentage}%` }}
          ></div>
        </div>
        <div className="text-sm text-purple-100 mt-2">
          {progress.completedCount} of {progress.totalCount} tasks completed ({progress.percentage}%)
        </div>
      </div>

      {/* Newly Completed Celebration */}
      {newlyCompleted.length > 0 && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 animate-pulse">
          <div className="flex items-center">
            <span className="text-2xl mr-3">✓</span>
            <div>
              <p className="font-semibold text-green-800">Task Auto-Verified!</p>
              <p className="text-sm text-green-700">
                {newlyCompleted.map(t => t.title).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Task List */}
      <div className="p-6">
        <div className="space-y-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`flex items-start p-4 rounded-lg transition-all ${
                task.is_completed
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-gray-50 border border-gray-200 hover:border-purple-300'
              }`}
            >
              {/* Completion Checkbox */}
              <div className="flex-shrink-0 mr-3 mt-1">
                {task.is_completed ? (
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center">
                    <span className="text-xs text-gray-600">{task.order_index}</span>
                  </div>
                )}
              </div>

              {/* Task Content */}
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className={`font-semibold ${task.is_completed ? 'text-green-900 line-through' : 'text-gray-900'}`}>
                      {task.title}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                  </div>

                  {/* XP Badge */}
                  <div className="flex items-center ml-4 flex-shrink-0">
                    <span className={`text-xl mr-2 ${PILLAR_COLORS[task.pillar]}`}>
                      {PILLAR_ICONS[task.pillar]}
                    </span>
                    <span className="text-sm font-semibold text-purple-600">
                      {task.xp_value} XP
                    </span>
                  </div>
                </div>

                {/* Auto-verify badge */}
                {task.auto_complete && !task.is_completed && (
                  <div className="mt-2 inline-block">
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                      Auto-verified ✓
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Verification Status */}
        {isVerifying && (
          <div className="mt-4 text-center text-sm text-gray-500">
            <span className="inline-flex items-center">
              <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Checking for completed tasks...
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TutorialQuestCard;