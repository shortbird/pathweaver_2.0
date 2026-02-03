import React, { useState, useEffect } from 'react'
import { XMarkIcon, TrashIcon, PlusIcon, LinkIcon, ArrowTopRightOnSquareIcon, SparklesIcon } from '@heroicons/react/24/outline'
import CourseCoverImage from './CourseCoverImage'
import { generateShowcaseFields } from '../../services/courseService'

/**
 * Modal for editing course details including title, description, cover image,
 * visibility settings, showcase fields for public pages, and course deletion.
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
  // Basic fields
  const [localTitle, setLocalTitle] = useState(course?.title || '')
  const [localDescription, setLocalDescription] = useState(course?.description || '')

  // Showcase fields for public pages
  const [localSlug, setLocalSlug] = useState(course?.slug || '')
  const [localLearningOutcomes, setLocalLearningOutcomes] = useState(course?.learning_outcomes || [])
  const [localEducationalValue, setLocalEducationalValue] = useState(course?.educational_value || '')
  const [localParentGuidance, setLocalParentGuidance] = useState(course?.parent_guidance || {
    ages_5_9: '',
    ages_10_14: '',
    ages_15_18: ''
  })

  // UI state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteQuests, setDeleteQuests] = useState(false)
  const [newOutcome, setNewOutcome] = useState('')
  const [activeTab, setActiveTab] = useState('general') // 'general' | 'showcase'
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)

  useEffect(() => {
    if (course) {
      setLocalTitle(course.title || '')
      setLocalDescription(course.description || '')
      setLocalSlug(course.slug || '')
      setLocalLearningOutcomes(course.learning_outcomes || [])
      setLocalEducationalValue(course.educational_value || '')
      setLocalParentGuidance(course.parent_guidance || {
        ages_5_9: '',
        ages_10_14: '',
        ages_15_18: ''
      })
    }
  }, [course])

  // Generate slug from title
  const generateSlug = (title) => {
    if (!title) return ''
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .replace(/-+/g, '-')
  }

  // Auto-generate slug when title changes (if slug is empty)
  useEffect(() => {
    if (localTitle && !localSlug && !course?.slug) {
      setLocalSlug(generateSlug(localTitle))
    }
  }, [localTitle, localSlug, course?.slug])

  const handleAddOutcome = () => {
    if (newOutcome.trim()) {
      setLocalLearningOutcomes([...localLearningOutcomes, newOutcome.trim()])
      setNewOutcome('')
    }
  }

  const handleRemoveOutcome = (index) => {
    setLocalLearningOutcomes(localLearningOutcomes.filter((_, i) => i !== index))
  }

  const handleParentGuidanceChange = (ageGroup, value) => {
    setLocalParentGuidance(prev => ({
      ...prev,
      [ageGroup]: value
    }))
  }

  const handleGenerateWithAI = async () => {
    if (!courseId) return

    setIsGenerating(true)
    setGenerateError(null)

    try {
      const result = await generateShowcaseFields(courseId)
      if (result.success && result.showcase) {
        const showcase = result.showcase
        // Populate the fields with AI-generated content
        if (showcase.learning_outcomes?.length > 0) {
          setLocalLearningOutcomes(showcase.learning_outcomes)
        }
        if (showcase.educational_value) {
          setLocalEducationalValue(showcase.educational_value)
        }
        if (showcase.parent_guidance) {
          setLocalParentGuidance({
            ages_5_9: showcase.parent_guidance.ages_5_9 || '',
            ages_10_14: showcase.parent_guidance.ages_10_14 || '',
            ages_15_18: showcase.parent_guidance.ages_15_18 || ''
          })
        }
      }
    } catch (error) {
      console.error('Failed to generate showcase fields:', error)
      setGenerateError(error.response?.data?.error || 'Failed to generate. Add projects and lessons first.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSave = () => {
    const updates = {
      title: localTitle,
      description: localDescription,
      slug: localSlug || null,
      learning_outcomes: localLearningOutcomes,
      educational_value: localEducationalValue || null,
      parent_guidance: localParentGuidance
    }
    onUpdate(updates)
    onClose()
  }

  const publicPageUrl = localSlug ? `/course/${localSlug}` : null
  const isPublished = course?.status === 'published'
  const isPublic = course?.visibility === 'public'

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

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <nav className="flex gap-4 -mb-px">
            <button
              onClick={() => setActiveTab('general')}
              className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'general'
                  ? 'border-optio-purple text-optio-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              General
            </button>
            <button
              onClick={() => setActiveTab('showcase')}
              className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'showcase'
                  ? 'border-optio-purple text-optio-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Public Showcase
            </button>
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'general' ? (
            <>
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
                    ? 'This course is visible to users in all organizations and has a public page.'
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
            </>
          ) : (
            <>
              {/* Public Page URL Notice */}
              {isPublished && isPublic && localSlug && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <LinkIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-800">Public Page Available</p>
                      <p className="text-sm text-green-700 mt-1">
                        Your course has a public page that anyone can view.
                      </p>
                      <a
                        href={publicPageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-green-700 hover:text-green-800"
                      >
                        Preview public page
                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {!isPublic && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-sm text-amber-800">
                    Set visibility to "Public" in the General tab to enable a public course page.
                  </p>
                </div>
              )}

              {/* AI Generation Tool */}
              <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 border border-optio-purple/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <SparklesIcon className="w-5 h-5 text-optio-purple flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">Generate with AI</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Analyze your course projects and lessons to auto-generate all fields below.
                    </p>
                    {generateError && (
                      <p className="text-sm text-red-600 mt-2">{generateError}</p>
                    )}
                    <button
                      onClick={handleGenerateWithAI}
                      disabled={isGenerating || !courseId}
                      className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <SparklesIcon className="w-4 h-4" />
                          Generate Fields
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* URL Slug */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URL Slug
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-sm">/course/</span>
                  <input
                    type="text"
                    value={localSlug}
                    onChange={(e) => setLocalSlug(generateSlug(e.target.value))}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                    placeholder="my-course-name"
                  />
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  SEO-friendly URL for the public course page.
                </p>
              </div>

              {/* Learning Outcomes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What Students Will Do
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  What will students do in this course? Use action words.
                </p>
                <div className="space-y-2 mb-3">
                  {localLearningOutcomes.map((outcome, index) => (
                    <div key={index} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <span className="flex-1 text-sm text-gray-700">{outcome}</span>
                      <button
                        onClick={() => handleRemoveOutcome(index)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newOutcome}
                    onChange={(e) => setNewOutcome(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddOutcome())}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent text-sm"
                    placeholder="e.g., Write a short story with a beginning, middle, and end"
                  />
                  <button
                    onClick={handleAddOutcome}
                    disabled={!newOutcome.trim()}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    <PlusIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Educational Value */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Why This Matters
                </label>
                <textarea
                  value={localEducationalValue}
                  onChange={(e) => setLocalEducationalValue(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none text-sm"
                  placeholder="How does this help kids learn? What real-world skills will they build?"
                />
                <p className="mt-2 text-sm text-gray-500">
                  Focus on hands-on learning and real-world skills, not school subjects.
                </p>
              </div>

              {/* Parent Guidance by Age */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tips for Parents
                </label>
                <p className="text-sm text-gray-500 mb-4">
                  Help parents know what to expect based on their child's age.
                </p>

                {/* Ages 5-9 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    Ages 5-9 (High parent involvement)
                  </label>
                  <textarea
                    value={localParentGuidance.ages_5_9}
                    onChange={(e) => handleParentGuidanceChange('ages_5_9', e.target.value)}
                    rows={2}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none text-sm"
                    placeholder="What will younger kids need help with? How can parents stay involved?"
                  />
                </div>

                {/* Ages 10-14 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    Ages 10-14 (Some support needed)
                  </label>
                  <textarea
                    value={localParentGuidance.ages_10_14}
                    onChange={(e) => handleParentGuidanceChange('ages_10_14', e.target.value)}
                    rows={2}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none text-sm"
                    placeholder="Where might middle schoolers still need guidance? What can they do alone?"
                  />
                </div>

                {/* Ages 15-18 */}
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    Ages 15-18 (Mostly independent)
                  </label>
                  <textarea
                    value={localParentGuidance.ages_15_18}
                    onChange={(e) => handleParentGuidanceChange('ages_15_18', e.target.value)}
                    rows={2}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none text-sm"
                    placeholder="How can parents stay connected without hovering? What makes this good for independent learners?"
                  />
                </div>
              </div>
            </>
          )}
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
