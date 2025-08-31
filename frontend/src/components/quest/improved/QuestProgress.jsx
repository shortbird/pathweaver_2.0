import React from 'react';

const QuestProgress = ({ 
  completedTasks, 
  totalTasks, 
  totalXP, 
  earnedXP,
  hasBonus = false,
  bonusAmount = 0 
}) => {
  const progressPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const isComplete = progressPercentage === 100;
  
  // Calculate milestone indicators
  const milestones = [25, 50, 75, 100];
  
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Quest Progress</h3>
          <p className="text-sm text-gray-600 mt-1">
            {completedTasks} of {totalTasks} tasks completed
          </p>
        </div>
        
        <div className="text-right">
          <div className="text-2xl font-bold bg-gradient-to-r from-[#6d469b] to-[#ef597b] bg-clip-text text-transparent">
            {Math.round(progressPercentage)}%
          </div>
          <p className="text-xs text-gray-500">Complete</p>
        </div>
      </div>

      {/* Progress Bar Container */}
      <div className="relative mb-6">
        {/* Background Track */}
        <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
          {/* Progress Fill */}
          <div 
            className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
            style={{ 
              width: `${progressPercentage}%`,
              background: isComplete 
                ? 'linear-gradient(to right, #10b981, #34d399)' 
                : 'linear-gradient(to right, #6d469b, #ef597b)'
            }}
          >
            {/* Animated Shimmer Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          </div>
        </div>

        {/* Milestone Markers */}
        <div className="absolute inset-0 flex items-center">
          {milestones.map(milestone => (
            <div 
              key={milestone}
              className="absolute flex flex-col items-center"
              style={{ left: `${milestone}%`, transform: 'translateX(-50%)' }}
            >
              <div 
                className={`
                  w-3 h-3 rounded-full border-2 bg-white
                  ${progressPercentage >= milestone 
                    ? 'border-green-500 bg-green-500' 
                    : 'border-gray-300'
                  }
                `}
              />
              {milestone === 100 && progressPercentage >= 100 && (
                <svg className="w-5 h-5 text-green-500 absolute -top-1" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* XP Progress */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600">XP Earned</span>
            <svg className="w-4 h-4 text-[#6d469b]" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </div>
          <div className="text-xl font-bold text-gray-900">{earnedXP}</div>
          <div className="text-xs text-gray-500">of {totalXP} total</div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600">Remaining</span>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-xl font-bold text-gray-900">{totalXP - earnedXP}</div>
          <div className="text-xs text-gray-500">XP available</div>
        </div>
      </div>

      {/* Bonus Indicator */}
      {hasBonus && !isComplete && (
        <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
              <span className="text-lg">🎯</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-700">
                Completion Bonus Available!
              </p>
              <p className="text-xs text-emerald-600">
                Complete all tasks to earn +{bonusAmount} XP ({Math.round((bonusAmount / totalXP) * 100)}% bonus)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Completion Celebration */}
      {isComplete && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-300 rounded-lg p-4 mt-4">
          <div className="flex items-center gap-3">
            <div className="text-3xl animate-bounce">🎉</div>
            <div className="flex-1">
              <p className="font-bold text-green-700">Quest Complete!</p>
              <p className="text-sm text-green-600">
                {hasBonus 
                  ? `You earned ${earnedXP} XP including the ${bonusAmount} XP completion bonus!`
                  : `You earned ${earnedXP} XP!`
                }
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Motivational Messages */}
      {!isComplete && (
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-600">
            {progressPercentage === 0 && "Ready to begin your quest? Start with any task!"}
            {progressPercentage > 0 && progressPercentage < 25 && "Great start! Keep going!"}
            {progressPercentage >= 25 && progressPercentage < 50 && "You're making excellent progress!"}
            {progressPercentage >= 50 && progressPercentage < 75 && "Halfway there! You've got this!"}
            {progressPercentage >= 75 && progressPercentage < 100 && "Almost there! Just a few more tasks!"}
          </p>
        </div>
      )}
    </div>
  );
};

export default QuestProgress;