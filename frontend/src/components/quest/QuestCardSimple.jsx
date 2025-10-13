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
        /* In-Progress: Green Continue Bar */
        <div className="bg-green-500 text-white">
          {/* Progress Info */}
          <div className="px-6 pt-4 pb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold line-clamp-1">
                Current Task: {currentTaskTitle}
              </p>
            </div>
            <div className="flex items-center justify-between text-xs font-medium mb-2">
              <span>{completedTasks}/{totalTasks} TASKS COMPLETED</span>
              <span>{Math.round(progressPercentage)}%</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-green-600 h-2">
            <div
              className="bg-white h-2 transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          {/* Continue Button Area */}
          <div className="px-6 py-4 bg-green-500 hover:bg-green-600 transition-colors flex items-center justify-between">
            <span className="font-bold text-base">CONTINUE</span>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
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
