import React from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusIcon, ChevronLeftIcon } from '@heroicons/react/24/outline'

/**
 * Form for creating a new course.
 * Extracted from CourseBuilder.jsx for better maintainability.
 */
function NewCourseForm({ course, setCourse, isCreating, onCreateCourse }) {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/courses')}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors min-h-[44px] min-w-[44px]"
              aria-label="Go back to courses"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Create New Course</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Course Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={course?.title || ''}
                onChange={(e) => setCourse(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] text-base"
                placeholder="Enter course title"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={course?.description || ''}
                onChange={(e) => setCourse(prev => ({ ...prev, description: e.target.value }))}
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[100px] text-base"
                placeholder="Describe what students will learn in this course"
              />
            </div>

            <div className="pt-4">
              <button
                onClick={onCreateCourse}
                disabled={isCreating || !course?.title?.trim()}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-medium min-h-[44px]"
              >
                {isCreating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <PlusIcon className="w-5 h-5" />
                    Create Course
                  </>
                )}
              </button>
            </div>

            <p className="text-sm text-gray-500 text-center">
              After creating the course, you can add projects and publish it.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default NewCourseForm
