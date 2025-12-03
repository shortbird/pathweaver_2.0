/**
 * TutorialProgress Component
 *
 * Compact tutorial progress widget for dashboard.
 * Shows current tutorial status and provides quick access.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTutorialProgress } from '../../hooks/useTutorialProgress';

const TutorialProgress = () => {
  const navigate = useNavigate();
  const { tutorialStatus, progress } = useTutorialProgress();

  // Don't render if tutorial doesn't exist or is already completed
  if (!tutorialStatus.exists || tutorialStatus.completed || tutorialStatus.loading) {
    return null;
  }

  // Not started - show start prompt
  if (!tutorialStatus.started) {
    return (
      <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg shadow-md p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg mb-1">Start Your Journey</h3>
            <p className="text-sm text-purple-100">Complete the platform tutorial</p>
          </div>
          <button
            onClick={() => navigate('/dashboard')} // Will show full tutorial card
            className="bg-white text-optio-purple px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-50 transition-colors"
          >
            Start
          </button>
        </div>
      </div>
    );
  }

  // Tutorial in progress - show progress
  return (
    <div
      onClick={() => navigate('/dashboard')} // Navigate to see full tutorial
      className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow border-2 border-purple-200"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">Platform Tutorial</h3>
        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
          In Progress
        </span>
      </div>

      {/* Progress Bar */}
      <div className="bg-gray-200 rounded-full h-2 overflow-hidden mb-2">
        <div
          className="bg-gradient-to-r from-optio-purple to-optio-pink h-full transition-all duration-500"
          style={{ width: `${progress.percentage}%` }}
        ></div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">
          {progress.completedCount} of {progress.totalCount} tasks
        </span>
        <span className="font-semibold text-optio-purple">
          {progress.percentage}%
        </span>
      </div>

      {/* Hint */}
      <p className="text-xs text-gray-500 mt-2">
        Tasks auto-verify as you explore the platform
      </p>
    </div>
  );
};

export default TutorialProgress;
