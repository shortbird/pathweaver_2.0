import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../services/api'
import QuestVisibilityManager from '../admin/QuestVisibilityManager'
import CourseVisibilityManager from '../admin/CourseVisibilityManager'
import CourseEnrollmentManager from '../admin/CourseEnrollmentManager'
import UnifiedQuestForm from '../admin/UnifiedQuestForm'
import CourseQuestForm from '../admin/CourseQuestForm'

// Visibility Policy Options
const VISIBILITY_POLICY_OPTIONS = [
  { value: 'all_optio', label: 'All Optio + Organization Content', description: 'Students see all Optio content plus your organization content' },
  { value: 'curated', label: 'Curated Library', description: 'You control which content is visible to students' },
  { value: 'private_only', label: 'Organization Only', description: 'Only content created by your organization is visible' }
]

// Course Card Component
function CourseCard({ course, onDelete, orgId }) {
  const projectCount = course.quest_count || course.project_count || 0
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showEnrollmentManager, setShowEnrollmentManager] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.delete(`/api/courses/${course.id}`)
      onDelete(course.id)
    } catch (err) {
      console.error('Failed to delete course:', err)
      alert('Failed to delete course')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 hover:border-optio-purple/30 hover:shadow-md transition-all overflow-hidden flex flex-col">
      {/* Cover Image */}
      <div className="relative h-36 bg-gradient-to-r from-optio-purple/20 to-optio-pink/20">
        {course.cover_image_url ? (
          <img
            src={course.cover_image_url}
            alt={course.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        )}
        {/* Status Badge */}
        <div className="absolute top-2 right-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shadow-sm ${
            course.status === 'published' ? 'bg-green-100 text-green-700' :
            course.status === 'archived' ? 'bg-gray-100 text-gray-600' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {course.status || 'draft'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="text-base font-semibold text-gray-900 line-clamp-1">{course.title}</h3>
        <p className="text-sm text-gray-600 mt-1 line-clamp-2 flex-1">{course.description || 'No description'}</p>

        {/* Meta Info */}
        <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
          </svg>
          <span>{projectCount} {projectCount === 1 ? 'project' : 'projects'}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <Link
            to={`/courses/${course.id}/edit`}
            className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 transition-opacity text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </Link>
          <button
            onClick={() => setShowEnrollmentManager(true)}
            className="p-1.5 text-gray-400 hover:text-optio-purple hover:bg-optio-purple/10 rounded-lg transition-colors"
            title="Manage Enrollments"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete course"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-xl p-6 max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Course?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete "{course.title}" and all its projects. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enrollment Manager Modal */}
      {showEnrollmentManager && (
        <CourseEnrollmentManager
          courseId={course.id}
          courseName={course.title}
          orgId={orgId}
          isSuperadmin={false}
          onClose={() => setShowEnrollmentManager(false)}
        />
      )}
    </div>
  )
}

// Create Course Modal
function CreateCourseModal({ orgId, navigate, onClose }) {
  const [mode, setMode] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    description: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const courseResponse = await api.post('/api/courses', {
        title: formData.title,
        description: formData.description,
        organization_id: orgId,
        status: 'draft',
        visibility: 'organization',
        navigation_mode: 'sequential'
      })
      const courseId = courseResponse.data.course?.id || courseResponse.data.id

      if (!courseId) {
        throw new Error('Failed to create course - no ID returned')
      }

      navigate(`/courses/${courseId}/edit`)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create course')
      setLoading(false)
    }
  }

  const handleAICreate = () => {
    navigate('/course-plan')
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {mode === null ? (
          <>
            <h2 className="text-2xl font-bold mb-2">Create Course</h2>
            <p className="text-gray-600 mb-6">Choose how you want to create your course.</p>

            <div className="space-y-4">
              <button
                onClick={handleAICreate}
                className="w-full p-4 border-2 border-optio-purple rounded-xl hover:bg-optio-purple/5 transition-colors text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">AI Course Planner</h3>
                      <span className="px-2 py-0.5 bg-optio-purple/10 text-optio-purple text-xs font-medium rounded-full">Recommended</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Describe your course idea and let AI help you plan the curriculum.
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setMode('manual')}
                className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-colors text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">Manual Setup</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Create a blank course and manually add projects, lessons, and tasks.
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <div className="flex justify-end mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setMode(null)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-2xl font-bold">Create Course</h2>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Course Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                  placeholder="e.g., Introduction to Photography"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                  placeholder="Brief description of what students will learn..."
                  rows={3}
                />
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !formData.title.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Course'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

export default function ContentTab({ orgId, orgData, onUpdate, siteSettings }) {
  const navigate = useNavigate()
  const [contentView, setContentView] = useState('courses') // 'courses' | 'quests' | 'availability'

  // Visibility policy state
  const [questPolicy, setQuestPolicy] = useState(orgData?.organization?.quest_visibility_policy || 'all_optio')
  const [coursePolicy, setCoursePolicy] = useState(orgData?.organization?.course_visibility_policy || 'all_optio')
  const [showPolicyOptions, setShowPolicyOptions] = useState(false)
  const [saving, setSaving] = useState(false)

  // Courses state
  const [courses, setCourses] = useState([])
  const [coursesLoading, setCoursesLoading] = useState(true)
  const [courseSearchTerm, setCourseSearchTerm] = useState('')
  const [showCreateCourseModal, setShowCreateCourseModal] = useState(false)

  // Quests state
  const [showOptioQuestForm, setShowOptioQuestForm] = useState(false)
  const [showCourseQuestForm, setShowCourseQuestForm] = useState(false)
  const [questRefreshKey, setQuestRefreshKey] = useState(0)

  useEffect(() => {
    fetchCourses()
  }, [orgId])

  useEffect(() => {
    setQuestPolicy(orgData?.organization?.quest_visibility_policy || 'all_optio')
    setCoursePolicy(orgData?.organization?.course_visibility_policy || 'all_optio')
  }, [orgData])

  const fetchCourses = async () => {
    try {
      setCoursesLoading(true)
      const response = await api.get(`/api/courses?filter=org_only`)
      const orgCourses = (response.data.courses || response.data || []).filter(
        course => course.organization_id === orgId
      )
      setCourses(orgCourses)
    } catch (error) {
      console.error('Failed to fetch courses:', error)
    } finally {
      setCoursesLoading(false)
    }
  }

  const handleSavePolicy = async (type, newPolicy) => {
    setSaving(true)
    try {
      const updateField = type === 'quest' ? 'quest_visibility_policy' : 'course_visibility_policy'
      await api.put(`/api/admin/organizations/${orgId}`, {
        [updateField]: newPolicy
      })
      if (type === 'quest') {
        setQuestPolicy(newPolicy)
      } else {
        setCoursePolicy(newPolicy)
      }
      setShowPolicyOptions(false)
      onUpdate()
    } catch (error) {
      console.error('Failed to update policy:', error)
      alert(error.response?.data?.error || 'Failed to update policy')
    } finally {
      setSaving(false)
    }
  }

  const handleQuestCreated = () => {
    setQuestRefreshKey(prev => prev + 1)
    onUpdate()
  }

  const filteredCourses = courses.filter(course =>
    course.title?.toLowerCase().includes(courseSearchTerm.toLowerCase())
  )

  const currentQuestPolicy = VISIBILITY_POLICY_OPTIONS.find(p => p.value === questPolicy)
  const currentCoursePolicy = VISIBILITY_POLICY_OPTIONS.find(p => p.value === coursePolicy)

  return (
    <div className="space-y-6">
      {/* Content Visibility Policy Card */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Content Visibility</h2>
            <p className="text-sm text-gray-500 mt-1">
              Control what content your students can see
            </p>
          </div>
          <button
            onClick={() => setShowPolicyOptions(!showPolicyOptions)}
            className="text-sm text-optio-purple hover:underline font-medium"
          >
            {showPolicyOptions ? 'Hide' : 'Change'}
          </button>
        </div>

        {!showPolicyOptions && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 font-medium mb-1">QUEST VISIBILITY</p>
              <p className="text-sm font-medium text-gray-900">{currentQuestPolicy?.label}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 font-medium mb-1">COURSE VISIBILITY</p>
              <p className="text-sm font-medium text-gray-900">{currentCoursePolicy?.label}</p>
            </div>
          </div>
        )}

        {showPolicyOptions && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-6">
            {/* Quest Policy */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Quest Visibility Policy</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {VISIBILITY_POLICY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSavePolicy('quest', option.value)}
                    disabled={saving || option.value === questPolicy}
                    className={`p-3 rounded-lg text-left transition-colors ${
                      option.value === questPolicy
                        ? 'bg-optio-purple text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    } disabled:opacity-50`}
                  >
                    <p className="font-medium text-sm">{option.label}</p>
                    <p className={`text-xs mt-1 ${option.value === questPolicy ? 'text-white/80' : 'text-gray-500'}`}>
                      {option.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Course Policy */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Course Visibility Policy</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {VISIBILITY_POLICY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSavePolicy('course', option.value)}
                    disabled={saving || option.value === coursePolicy}
                    className={`p-3 rounded-lg text-left transition-colors ${
                      option.value === coursePolicy
                        ? 'bg-optio-purple text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    } disabled:opacity-50`}
                  >
                    <p className="font-medium text-sm">{option.label}</p>
                    <p className={`text-xs mt-1 ${option.value === coursePolicy ? 'text-white/80' : 'text-gray-500'}`}>
                      {option.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content View Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setContentView('courses')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            contentView === 'courses'
              ? 'border-b-2 border-optio-purple text-optio-purple'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Courses ({courses.length})
        </button>
        <button
          onClick={() => setContentView('quests')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            contentView === 'quests'
              ? 'border-b-2 border-optio-purple text-optio-purple'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Standalone Quests
        </button>
        {(questPolicy === 'curated' || coursePolicy === 'curated') && (
          <button
            onClick={() => setContentView('availability')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              contentView === 'availability'
                ? 'border-b-2 border-optio-purple text-optio-purple'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Manage Availability
          </button>
        )}
      </div>

      {/* Courses View */}
      {contentView === 'courses' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Courses</h2>
              <p className="text-sm text-gray-600">
                Structured learning paths with projects, lessons, and tasks
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Search courses..."
                value={courseSearchTerm}
                onChange={(e) => setCourseSearchTerm(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 w-56 text-sm focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              />
              <button
                onClick={() => setShowCreateCourseModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 transition-opacity text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Course
              </button>
            </div>
          </div>

          {/* Courses Grid */}
          {coursesLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <p className="text-gray-500">
                {courseSearchTerm ? 'No courses match your search' : 'No courses yet. Click "Create Course" to get started.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredCourses.map(course => (
                <CourseCard
                  key={course.id}
                  course={course}
                  orgId={orgId}
                  onDelete={(id) => setCourses(prev => prev.filter(c => c.id !== id))}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quests View */}
      {contentView === 'quests' && (
        <div className="space-y-4">
          {/* Header with Create Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Standalone Quests</h2>
              <p className="text-sm text-gray-600">
                Independent learning experiences not part of a course
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowCourseQuestForm(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Course Quest
              </button>
              <button
                onClick={() => setShowOptioQuestForm(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity"
              >
                Create Optio Quest
              </button>
            </div>
          </div>

          {/* Info Banner */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Organization Quests:</strong> Quests you create here will only be visible to users in your organization.
            </p>
          </div>

          {/* Quest Visibility Manager */}
          <QuestVisibilityManager
            orgId={orgId}
            orgData={orgData}
            onUpdate={onUpdate}
            siteSettings={siteSettings}
            refreshKey={questRefreshKey}
          />
        </div>
      )}

      {/* Availability View (only shown for curated policies) */}
      {contentView === 'availability' && (
        <div className="space-y-6">
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Curated Mode:</strong> Toggle content on/off to control what's visible to your students.
            </p>
          </div>

          {questPolicy === 'curated' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quest Availability</h3>
              <QuestVisibilityManager
                orgId={orgId}
                orgData={orgData}
                onUpdate={onUpdate}
                siteSettings={siteSettings}
                refreshKey={questRefreshKey}
              />
            </div>
          )}

          {coursePolicy === 'curated' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Course Availability</h3>
              <CourseVisibilityManager
                orgId={orgId}
                orgData={orgData}
                onUpdate={onUpdate}
                siteSettings={siteSettings}
              />
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreateCourseModal && (
        <CreateCourseModal
          orgId={orgId}
          navigate={navigate}
          onClose={() => setShowCreateCourseModal(false)}
        />
      )}

      {showOptioQuestForm && (
        <UnifiedQuestForm
          mode="create"
          organizationId={orgId}
          onClose={() => setShowOptioQuestForm(false)}
          onSuccess={handleQuestCreated}
        />
      )}

      {showCourseQuestForm && (
        <CourseQuestForm
          mode="create"
          organizationId={orgId}
          onClose={() => setShowCourseQuestForm(false)}
          onSuccess={handleQuestCreated}
        />
      )}
    </div>
  )
}
