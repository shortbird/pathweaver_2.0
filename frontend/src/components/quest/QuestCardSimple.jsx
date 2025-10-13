import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';

const QuestCardSimple = ({ quest }) => {
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(`/quests/${quest.id}`);
  };

  // Determine if quest is in progress
  const isInProgress = quest.user_enrollment && !quest.completed_enrollment;

  // Get progress data
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

      {/* Conditional Section: Description for Not-Started, Progress Bar for In-Progress */}
      {isInProgress ? (
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
          <div className="px-6 py-4 bg-green-500 hover:bg-green-600 transition-colors flex items-center justify-between cursor-pointer">
            <span className="font-bold text-base text-white uppercase">Continue</span>
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        </>
      ) : (
        /* Not Started: Description Section */
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
