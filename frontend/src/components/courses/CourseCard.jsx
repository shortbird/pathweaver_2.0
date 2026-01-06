import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * CourseCard
 *
 * Displays a course card with title, description, quest count, and cover image.
 * Shows progress indicator for enrolled students.
 * Designers see edit button. Students see enrollment CTA.
 */
const CourseCard = ({ course, enrollment = null }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Designer access: superadmin, org_admin role, advisor, or users with is_org_admin flag
  const isDesigner =
    user?.role === 'superadmin' ||
    user?.role === 'org_admin' ||
    user?.role === 'advisor' ||
    user?.is_org_admin === true;
  const isEnrolled = enrollment !== null;

  const handleCardClick = () => {
    if (isDesigner) {
      navigate(`/courses/${course.id}/edit`);
    } else {
      navigate(`/courses/${course.id}`);
    }
  };

  const handleEnrollClick = (e) => {
    e.stopPropagation();
    navigate(`/courses/${course.id}`);
  };

  const getProgressPercentage = () => {
    if (!enrollment || !enrollment.total_quests || enrollment.total_quests === 0) {
      return 0;
    }
    return Math.round((enrollment.completed_quests / enrollment.total_quests) * 100);
  };

  const progressPercentage = getProgressPercentage();

  return (
    <div
      onClick={handleCardClick}
      className="bg-white rounded-lg shadow-md border-2 border-gray-100 overflow-hidden cursor-pointer hover:shadow-xl hover:border-optio-purple transition-all duration-300 flex flex-col h-full"
    >
      {/* Cover Image */}
      {course.cover_image_url ? (
        <div className="w-full h-48 bg-gray-200 overflow-hidden">
          <img
            src={course.cover_image_url}
            alt={course.title}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
          />
        </div>
      ) : (
        <div className="w-full h-48 bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center">
          <span className="text-6xl">📚</span>
        </div>
      )}

      {/* Card Content */}
      <div className="p-6 flex-1 flex flex-col">
        {/* Title */}
        <h3 className="font-bold text-xl text-gray-900 mb-2 line-clamp-2">
          {course.title}
        </h3>

        {/* Description */}
        <p className="text-sm text-gray-600 mb-4 line-clamp-3 flex-1">
          {course.description || 'No description available.'}
        </p>

        {/* Quest Count */}
        <div className="flex items-center gap-2 mb-4 text-gray-700">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <span className="text-sm font-medium">
            {course.quest_count || 0} {course.quest_count === 1 ? 'Quest' : 'Quests'}
          </span>
        </div>

        {/* Progress Bar for Enrolled Students */}
        {isEnrolled && enrollment && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Progress</span>
              <span className="text-sm font-bold text-gray-900">
                {enrollment.completed_quests || 0}/{enrollment.total_quests || 0}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-optio-purple to-optio-pink h-full transition-all duration-500 rounded-full"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            {enrollment.status === 'completed' && (
              <div className="mt-2 flex items-center gap-1 text-green-600 text-sm font-medium">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Completed!</span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {isDesigner && (
            <button
              className="flex-1 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              Edit Course
            </button>
          )}
          {!isEnrolled && !isDesigner && course.status === 'published' && (
            <button
              onClick={handleEnrollClick}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              Enroll Now
            </button>
          )}
          {!isEnrolled && !isDesigner && course.status !== 'published' && (
            <div className="flex-1 px-4 py-2 bg-gray-200 text-gray-500 font-semibold rounded-lg text-center">
              Not Available
            </div>
          )}
          {isEnrolled && !isDesigner && (
            <button
              className="flex-1 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              {enrollment.status === 'completed' ? 'Review Course' : 'Continue'}
            </button>
          )}
        </div>

        {/* Course Status Badge (for designers) */}
        {isDesigner && (
          <div className="mt-3 flex items-center gap-2">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                course.status === 'published'
                  ? 'bg-green-100 text-green-700'
                  : course.status === 'draft'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {course.status?.charAt(0).toUpperCase() + course.status?.slice(1) || 'Draft'}
            </span>
            {course.navigation_mode && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                {course.navigation_mode === 'sequential' ? '📋 Sequential' : '🔀 Freeform'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CourseCard;
