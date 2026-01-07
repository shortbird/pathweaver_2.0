import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../services/api'
import CourseVisibilityManager from '../admin/CourseVisibilityManager'

function CourseCard({ course, onDelete }) {
  const projectCount = course.quest_count || course.project_count || 0
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
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
      <div className="relative h-40 bg-gradient-to-r from-optio-purple/20 to-optio-pink/20">
        {course.cover_image_url ? (
          <img
            src={course.cover_image_url}
            alt={course.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        )}
        {/* Status Badge Overlay */}
        <div className="absolute top-3 right-3">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium shadow-sm ${
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
        <h3 className="text-lg font-semibold text-gray-900 line-clamp-1">{course.title}</h3>
        <p className="text-sm text-gray-600 mt-1 line-clamp-2 flex-1">{course.description || 'No description'}</p>

        {/* Meta Info */}
        <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
          </svg>
          <span>{projectCount} {projectCount === 1 ? 'project' : 'projects'}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
          <Link
            to={`/courses/${course.id}/edit`}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 transition-opacity text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </Link>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
    </div>
  )
}

function CreateCourseModal({ orgId, navigate, onClose, onSuccess }) {
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

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-2">Create Course</h2>
        <p className="text-gray-600 mb-6">
          Create a new course for your organization. You can add projects, lessons, and tasks after creation.
        </p>

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

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-medium">Draft Mode</p>
                <p className="mt-1">Your course will be saved as a draft. You can add projects, lessons, and tasks before publishing it to students.</p>
              </div>
            </div>
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
      </div>
    </div>,
    document.body
  )
}

export default function CourseTab({ orgId, orgData, onUpdate, siteSettings }) {
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [courseSubTab, setCourseSubTab] = useState('manage')
  const [policy, setPolicy] = useState(orgData?.organization?.course_visibility_policy || 'all_optio')
  const [saving, setSaving] = useState(false)
  const [showPolicyOptions, setShowPolicyOptions] = useState(false)

  const policyOptions = [
    { value: 'all_optio', label: 'All Optio + Org Courses', short: 'All courses available' },
    { value: 'curated', label: 'Curated Library', short: 'You control availability' },
    { value: 'private_only', label: 'Org Courses Only', short: 'Only your courses' }
  ]

  const currentPolicy = policyOptions.find(p => p.value === policy)

  const handleSavePolicy = async (newPolicy) => {
    setSaving(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        course_visibility_policy: newPolicy
      })
      setPolicy(newPolicy)
      setShowPolicyOptions(false)
      if (onUpdate) onUpdate()
    } catch (error) {
      console.error('Failed to update policy:', error)
      alert(error.response?.data?.error || 'Failed to update policy')
    } finally {
      setSaving(false)
    }
  }

  const fetchCourses = async () => {
    try {
      setLoading(true)
      // Fetch only org courses using filter=org_only
      const response = await api.get(`/api/courses?filter=org_only`)
      // Filter to only show courses from this org (extra safety)
      const orgCourses = (response.data.courses || response.data || []).filter(
        course => course.organization_id === orgId
      )
      setCourses(orgCourses)
    } catch (error) {
      console.error('Failed to fetch courses:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCourses()
  }, [orgId])

  useEffect(() => {
    setPolicy(orgData?.organization?.course_visibility_policy || 'all_optio')
  }, [orgData])

  const filteredCourses = courses.filter(course =>
    course.title?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Subtab Navigation */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setCourseSubTab('manage')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            courseSubTab === 'manage'
              ? 'bg-white border border-b-white border-gray-200 -mb-[3px] text-optio-purple'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Manage Courses
        </button>
        <button
          onClick={() => setCourseSubTab('availability')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            courseSubTab === 'availability'
              ? 'bg-white border border-b-white border-gray-200 -mb-[3px] text-optio-purple'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Course Availability
        </button>
      </div>

      {courseSubTab === 'manage' ? (
        <>
          {/* Header */}
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Course Builder</h2>
              <p className="text-sm text-gray-600 mt-1">
                Create and manage courses for your organization
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Search courses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border border-gray-200 rounded-lg px-4 py-2 w-64 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              />
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Course
              </button>
            </div>
          </div>

          {showCreateModal && (
            <CreateCourseModal
              orgId={orgId}
              navigate={navigate}
              onClose={() => setShowCreateModal(false)}
              onSuccess={() => {
                setShowCreateModal(false)
                fetchCourses()
              }}
            />
          )}

          {/* Courses Grid */}
          {filteredCourses.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <p className="text-gray-500">
                {searchTerm ? 'No courses match your search' : 'No courses yet. Click "Create Course" to get started.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.map(course => (
                <CourseCard
                  key={course.id}
                  course={course}
                  onDelete={(id) => setCourses(prev => prev.filter(c => c.id !== id))}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Course Visibility Policy - Compact */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-500">Visibility Policy:</span>
                <span className="ml-2 font-semibold text-gray-900">{currentPolicy?.label}</span>
                <span className="ml-2 text-sm text-gray-500">({currentPolicy?.short})</span>
              </div>
              <button
                onClick={() => setShowPolicyOptions(!showPolicyOptions)}
                className="text-sm text-optio-purple hover:underline font-medium"
              >
                {showPolicyOptions ? 'Cancel' : 'Change'}
              </button>
            </div>

            {showPolicyOptions && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex flex-wrap gap-2">
                  {policyOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleSavePolicy(option.value)}
                      disabled={saving || option.value === policy}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        option.value === policy
                          ? 'bg-optio-purple text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      } disabled:opacity-50`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {policy === 'curated' ? 'Toggle availability for each course below.' :
                   policy === 'private_only' ? 'Only courses created by your organization will be visible to students.' :
                   'All Optio courses are automatically available to students.'}
                </p>
              </div>
            )}
          </div>

          {/* Course Visibility Manager */}
          <CourseVisibilityManager
            orgId={orgId}
            orgData={orgData}
            onUpdate={onUpdate}
            siteSettings={siteSettings}
          />
        </>
      )}
    </div>
  )
}
