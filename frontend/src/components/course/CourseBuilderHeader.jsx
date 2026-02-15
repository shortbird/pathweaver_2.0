import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChevronLeftIcon,
  RocketLaunchIcon,
  EyeIcon,
  Cog6ToothIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'

/**
 * Header component for the Course Builder.
 * Displays course title, status, and action buttons.
 * Extracted from CourseBuilder.jsx for better maintainability.
 */
function CourseBuilderHeader({
  course,
  quests,
  saveStatus,
  isPublishing,
  onShowCourseDetails,
  onShowAITools,
  onShowPreview,
  onPublishToggle,
  isSuperadmin = false,
}) {
  const navigate = useNavigate()

  const SaveStatusIndicator = () => {
    if (saveStatus === 'saving') {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-4 h-4 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
          <span>Saving...</span>
        </div>
      )
    }
    if (saveStatus === 'saved') {
      return (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircleIcon className="w-4 h-4" />
          <span>Saved</span>
        </div>
      )
    }
    if (saveStatus === 'error') {
      return (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <ExclamationCircleIcon className="w-4 h-4" />
          <span>Save failed</span>
        </div>
      )
    }
    return null
  }

  return (
    <div className="bg-white border-b border-gray-200 flex-shrink-0">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/courses')}
              className="flex items-center gap-2 p-2 -m-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              aria-label="Go back to courses"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">
                {course?.title || 'Course Builder'}
              </h1>
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                  course?.status === 'published' ? 'bg-green-100 text-green-700' :
                  course?.status === 'archived' ? 'bg-gray-100 text-gray-600' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {course?.status || 'draft'}
                </span>
                <SaveStatusIndicator />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onShowCourseDetails}
              className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm min-h-[40px]"
              aria-label="Edit course details"
            >
              <Cog6ToothIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Details</span>
            </button>

            {isSuperadmin && (
              <button
                onClick={onShowAITools}
                disabled={quests.length === 0}
                className="flex items-center gap-2 px-3 py-2 text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 rounded-lg transition-opacity text-sm min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="AI Tools"
              >
                <SparklesIcon className="w-4 h-4" />
                <span className="hidden sm:inline font-medium">AI</span>
              </button>
            )}

            <button
              onClick={onShowPreview}
              disabled={!course || quests.length === 0}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium min-h-[40px]"
              aria-label="Preview course"
            >
              <EyeIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Preview</span>
            </button>

            <button
              onClick={onPublishToggle}
              disabled={isPublishing || !course || (course?.status !== 'published' && quests.length === 0)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium min-h-[40px] ${
                course?.status === 'published'
                  ? 'bg-gray-600 text-white hover:bg-gray-700'
                  : 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
              }`}
            >
              <RocketLaunchIcon className="w-4 h-4" />
              <span className="hidden sm:inline">
                {isPublishing ? '...' : course?.status === 'published' ? 'Unpublish' : 'Publish'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CourseBuilderHeader
