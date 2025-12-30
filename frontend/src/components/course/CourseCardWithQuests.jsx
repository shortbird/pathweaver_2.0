import React, { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenIcon, ChevronDownIcon, ChevronUpIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';

/**
 * CourseCardWithQuests - Dashboard card for enrolled courses with nested quests
 * Shows course info, progress, and expandable list of quests/projects
 */
const CourseCardWithQuests = ({ course }) => {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(true);

  const handleCourseClick = () => {
    navigate(`/courses/${course.id}`);
  };

  const handleQuestClick = (e, questId) => {
    e.stopPropagation();
    navigate(`/courses/${course.id}?quest=${questId}`);
  };

  // Progress data
  const completedQuests = course.progress?.completed_quests || 0;
  const totalQuests = course.progress?.total_quests || 0;
  const progressPercentage = course.progress?.percentage || 0;
  const quests = course.quests || [];

  // Determine if course is completed
  const isCompleted = progressPercentage === 100 && totalQuests > 0;

  return (
    <div className="bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      {/* Course Header - Clickable */}
      <div
        className="cursor-pointer"
        onClick={handleCourseClick}
      >
        {/* Image Section with Title Overlay */}
        <div className="relative h-36 overflow-hidden">
          {/* Course Badge */}
          <div className="absolute top-3 left-3 z-10">
            <div className="flex items-center gap-1.5 bg-optio-purple text-white px-2.5 py-1 rounded-full text-xs font-semibold shadow-lg">
              <BookOpenIcon className="w-3.5 h-3.5" />
              Course
            </div>
          </div>

          {/* Background Image or Gradient */}
          {course.cover_image_url ? (
            <img
              src={course.cover_image_url}
              alt={`Course: ${course.title}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-optio-purple to-optio-pink" />
          )}

          {/* Gradient Overlay for Text Readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

          {/* Title Overlay */}
          <div className="absolute inset-x-0 bottom-0 p-4">
            <h3 className="text-white text-lg font-bold leading-tight drop-shadow-lg line-clamp-2">
              {course.title}
            </h3>
          </div>
        </div>

        {/* Progress Bar Section */}
        <div className="px-4 pt-3 pb-2 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-gray-600 text-xs font-medium">
              {completedQuests}/{totalQuests} PROJECTS
            </span>
            {isCompleted ? (
              <span className="flex items-center gap-1 text-green-600 text-xs font-semibold">
                <CheckCircleSolidIcon className="w-4 h-4" />
                Complete
              </span>
            ) : (
              <span className="text-gray-900 text-sm font-bold">
                {Math.round(progressPercentage)}%
              </span>
            )}
          </div>
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                isCompleted ? 'bg-green-500' : 'bg-gradient-to-r from-optio-purple to-optio-pink'
              }`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Expand/Collapse Toggle */}
      {quests.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="w-full px-4 py-2 flex items-center justify-between text-sm text-gray-600 hover:bg-gray-50 transition-colors border-b border-gray-100"
        >
          <span className="font-medium">Projects ({quests.length})</span>
          {isExpanded ? (
            <ChevronUpIcon className="w-4 h-4" />
          ) : (
            <ChevronDownIcon className="w-4 h-4" />
          )}
        </button>
      )}

      {/* Nested Quests List */}
      {isExpanded && quests.length > 0 && (
        <div className="divide-y divide-gray-100">
          {quests.map((quest, index) => {
            const questProgress = quest.progress || {};
            const taskPercentage = questProgress.percentage || 0;
            const isQuestCompleted = quest.is_completed;
            const isQuestEnrolled = quest.is_enrolled;

            return (
              <div
                key={quest.id}
                onClick={(e) => handleQuestClick(e, quest.id)}
                className="px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors group"
              >
                <div className="flex items-start gap-3">
                  {/* Quest Number/Status */}
                  <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    isQuestCompleted
                      ? 'bg-green-100 text-green-600'
                      : isQuestEnrolled
                        ? 'bg-optio-purple/10 text-optio-purple'
                        : 'bg-gray-100 text-gray-400'
                  }`}>
                    {isQuestCompleted ? (
                      <CheckCircleSolidIcon className="w-5 h-5" />
                    ) : (
                      index + 1
                    )}
                  </div>

                  {/* Quest Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-medium leading-tight group-hover:text-optio-purple transition-colors ${
                      isQuestCompleted ? 'text-gray-500' : 'text-gray-900'
                    }`}>
                      {quest.title}
                    </h4>

                    {/* Progress indicator for enrolled quests */}
                    {isQuestEnrolled && !isQuestCompleted && questProgress.total_tasks > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-1">
                          <div
                            className="bg-optio-purple h-1 rounded-full transition-all"
                            style={{ width: `${taskPercentage}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {questProgress.completed_tasks}/{questProgress.total_tasks}
                        </span>
                      </div>
                    )}

                    {/* Not started indicator */}
                    {!isQuestEnrolled && (
                      <span className="text-xs text-gray-400 mt-0.5 block">Not started</span>
                    )}
                  </div>

                  {/* Arrow indicator */}
                  <div className="flex-shrink-0 text-gray-300 group-hover:text-optio-purple transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Continue Course Button */}
      <div
        onClick={handleCourseClick}
        className="px-4 py-3 bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 transition-opacity flex items-center justify-center cursor-pointer gap-2"
      >
        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
        </svg>
        <span className="font-bold text-sm text-white">
          {isCompleted ? 'View Course' : 'Continue Course'}
        </span>
      </div>
    </div>
  );
};

export default memo(CourseCardWithQuests);
