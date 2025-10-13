import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';

const QuestCardSimple = ({ quest }) => {
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(`/quests/${quest.id}`);
  };

  // Determine quest state
  const isCompleted = quest.completed_enrollment || (quest.progress && quest.progress.percentage === 100);
  const isInProgress = quest.user_enrollment && !isCompleted;
  const isNotStarted = !quest.user_enrollment;

  // Get progress data (for in-progress quests)
  const completedTasks = quest.progress?.completed_tasks || 0;
  const totalTasks = quest.progress?.total_tasks || 0;
  const progressPercentage = quest.progress?.percentage || 0;

  // Get current task (next one to be completed)
  const currentTask = quest.quest_tasks?.find(task => !task.is_completed);
  const currentTaskTitle = currentTask?.title || 'Continue your quest';

  return (
    <div
      className="group bg-white rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-gray-100"
      onClick={handleCardClick}
    >
      {/* Image Section with Title Overlay */}
      <div className="relative h-48 overflow-hidden">
        {/* Background Image */}
        {quest.image_url || quest.header_image_url ? (
          <img
            src={quest.image_url || quest.header_image_url}
            alt={quest.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          /* Fallback gradient if no image */
          <div className="w-full h-full bg-gradient-to-br from-[#6d469b] to-[#ef597b]" />
        )}

        {/* Gradient Overlay for Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />

        {/* Title Overlay */}
        <div className="absolute inset-x-0 bottom-0 p-6">
          <h3 className="text-white text-xl font-bold leading-tight drop-shadow-lg line-clamp-2">
            {quest.title}
          </h3>
        </div>
      </div>

      {/* Conditional Section: Three states - Not Started, In Progress, Completed */}
      {isCompleted ? (
        /* Completed: View on Diploma Button */
        <div className="bg-white px-6 pt-4 pb-3">
          <p className="text-gray-600 text-sm leading-relaxed line-clamp-3 mb-4">
            {quest.description || quest.big_idea || 'Quest completed!'}
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate('/diploma');
            }}
            className="w-full px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            View on Diploma
          </button>
        </div>
      ) : isInProgress ? (
        /* In-Progress: Progress Info + Green Continue Bar */
        <>
          {/* Progress Info Section - White background */}
          <div className="bg-white px-6 pt-4 pb-3">
            <p className="text-gray-900 text-sm font-semibold mb-3 line-clamp-2">
              Current Task: {currentTaskTitle}
            </p>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-xs font-medium">{completedTasks}/{totalTasks} TASKS COMPLETED</span>
              <span className="text-gray-900 text-sm font-bold">{Math.round(progressPercentage)}%</span>
            </div>
            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-[#6d469b] to-[#ef597b] h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Continue Button - Green background */}
          <div className="px-6 py-4 bg-green-600 hover:bg-green-700 transition-colors flex items-center justify-center cursor-pointer gap-2">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            <span className="font-bold text-base text-white">Continue</span>
          </div>
        </>
      ) : (
        /* Not Started: Description Only - No Buttons */
        <div className="bg-white p-6">
          <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
            {quest.description || quest.big_idea || 'Explore this quest to learn more.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default memo(QuestCardSimple);
