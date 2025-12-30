import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenIcon } from '@heroicons/react/24/outline';

/**
 * CourseCard - Dashboard card for enrolled courses
 * Shows course info and progress (quests completed)
 */
const CourseCard = ({ course }) => {
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(`/courses/${course.id}`);
  };

  // Progress data
  const completedQuests = course.progress?.completed_quests || 0;
  const totalQuests = course.progress?.total_quests || 0;
  const progressPercentage = course.progress?.percentage || 0;

  // Determine if course is completed
  const isCompleted = progressPercentage === 100 && totalQuests > 0;

  return (
    <div
      className="group bg-white rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-gray-100"
      onClick={handleCardClick}
    >
      {/* Image Section with Title Overlay */}
      <div className="relative h-48 overflow-hidden">
        {/* Course Badge */}
        <div className="absolute top-4 left-4 z-10">
          <div className="flex items-center gap-1.5 bg-optio-purple text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg">
            <BookOpenIcon className="w-4 h-4" />
            Course
          </div>
        </div>

        {/* Background Image or Gradient */}
        {course.cover_image_url ? (
          <img
            src={course.cover_image_url}
            alt={`Course: ${course.title}`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-optio-purple to-optio-pink" />
        )}

        {/* Gradient Overlay for Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />

        {/* Title Overlay */}
        <div className="absolute inset-x-0 bottom-0 p-6">
          <h3 className="text-white text-lg sm:text-xl font-bold leading-tight drop-shadow-lg line-clamp-2">
            {course.title}
          </h3>
        </div>
      </div>

      {/* Content Section */}
      {isCompleted ? (
        /* Completed Course */
        <div className="bg-white px-6 pt-4 pb-3">
          <p className="text-gray-600 text-sm leading-relaxed line-clamp-2 mb-4">
            {course.description || 'Course completed!'}
          </p>
          <div className="flex items-center gap-2 text-green-600 font-semibold text-sm">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Course Completed
          </div>
        </div>
      ) : (
        /* In Progress Course */
        <div className="flex flex-col h-[200px]">
          {/* Description */}
          <div className="bg-white px-6 pt-4 flex-grow">
            <p className="text-gray-600 text-sm leading-relaxed line-clamp-2">
              {course.description || 'Continue learning in this course.'}
            </p>
          </div>

          {/* Bottom Section */}
          <div className="mt-auto">
            {/* Progress Bar Section */}
            <div className="bg-white px-6 pb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600 text-xs font-medium">
                  {completedQuests}/{totalQuests} PROJECTS COMPLETED
                </span>
                <span className="text-gray-900 text-sm font-bold">
                  {Math.round(progressPercentage)}%
                </span>
              </div>
              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>

            {/* Continue Button */}
            <div className="px-6 py-4 bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 transition-opacity flex items-center justify-center cursor-pointer gap-2">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              <span className="font-bold text-base text-white">Continue Course</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(CourseCard);
