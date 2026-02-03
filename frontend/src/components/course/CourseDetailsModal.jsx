import React, { useState, useEffect } from 'react'
import { XMarkIcon, TrashIcon } from '@heroicons/react/24/outline'
import CourseCoverImage from './CourseCoverImage'

/**
 * Modal for editing course details including title, description, cover image,
 * visibility settings, and course deletion.
 */
const CourseDetailsModal = ({
  isOpen,
  onClose,
  course,
  courseId,
  onUpdate,
  onDelete,
  isSaving,
  isDeleting,
  questCount = 0
}) => {
  const [localTitle, setLocalTitle] = useState(course?.title || '')
  const [localDescription, setLocalDescription] = useState(course?.description || '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteQuests, setDeleteQuests] = useState(false)

  useEffect(() => {
    if (course) {
      setLocalTitle(course.title || '')
      setLocalDescription(course.description || '')
    }
  }, [course])

  const handleSave = () => {
    onUpdate({
      title: localTitle,
      description: localDescription
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Course Details</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Cover Image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cover Image
            </label>
            <CourseCoverImage
              coverUrl={course?.cover_image_url}
              onUpdate={(url) => onUpdate({ cover_image_url: url })}
              courseId={courseId}
              courseTitle={localTitle}
              courseDescription={localDescription}
              isSaving={isSaving}
            />
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Course Title
            </label>
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              placeholder="Enter course title"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
              placeholder="Describe what students will learn..."
            />
          </div>

          {/* Status Badge */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              course?.status === 'published' ? 'bg-green-100 text-green-700' :
              course?.status === 'archived' ? 'bg-gray-100 text-gray-600' :
              'bg-yellow-100 text-yellow-700'
            }`}>
              {course?.status || 'draft'}
            </span>
          </div>

          {/* Visibility Setting */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Visibility
            </label>
            <select
              value={course?.visibility || 'organization'}
              onChange={(e) => onUpdate({ visibility: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent bg-white"
            >
              <option value="organization">Organization Only</option>
              <option value="public">Public (All Organizations)</option>
              <option value="private">Private (Only Me)</option>
            </select>
            <p className="mt-2 text-sm text-gray-500">
              {course?.visibility === 'public'
                ? 'This course is visible to users in all organizations.'
                : course?.visibility === 'private'
                ? 'This course is only visible to you.'
                : 'This course is only visible to users in your organization.'}
            </p>
          </div>

          {/* Danger Zone */}
          <div className="border-t border-gray-200 pt-6 mt-6">
            <h3 className="text-sm font-medium text-red-600 mb-3">Danger Zone</h3>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium"
              >
                <TrashIcon className="w-4 h-4" />
                Delete Course
              </button>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800 mb-3">
                  Are you sure you want to delete this course? This will permanently remove the course and all enrollments. This action cannot be undone.
                </p>
                {questCount > 0 && (
                  <label className="flex items-start gap-2 mb-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deleteQuests}
                      onChange={(e) => setDeleteQuests(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                    />
                    <span className="text-sm text-red-800">
                      Also delete the {questCount} project{questCount !== 1 ? 's' : ''} in this course
                      <span className="block text-xs text-red-600 mt-0.5">
                        Projects shared with other courses will be kept. Only projects exclusive to this course will be deleted.
                      </span>
                    </span>
                  </label>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false)
                      setDeleteQuests(false)
                    }}
                    disabled={isDeleting}
                    className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => onDelete({ deleteQuests })}
                    disabled={isDeleting}
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <TrashIcon className="w-4 h-4" />
                        Delete Permanently
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CourseDetailsModal
