import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../services/api'
import CourseVisibilityManager from '../admin/CourseVisibilityManager'
import CourseEnrollmentManager from '../admin/CourseEnrollmentManager'

function CourseCard({ course, onDelete }) {
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
            onClick={() => setShowEnrollmentManager(true)}
            className="p-2 text-gray-400 hover:text-optio-purple hover:bg-optio-purple/10 rounded-lg transition-colors"
            title="Manage Enrollments"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </button>
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

      {/* Enrollment Manager Modal */}
      {showEnrollmentManager && (
        <CourseEnrollmentManager
          courseId={course.id}
          courseName={course.title}
          orgId={course.organization_id}
          isSuperadmin={false}
          onClose={() => setShowEnrollmentManager(false)}
        />
      )}
    </div>
  )
}

function CreateCourseModal({ orgId, navigate, onClose, onSuccess }) {
  const [mode, setMode] = useState(null) // null = choose, 'manual' = form, 'ai' = redirect
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
          // Choose creation method
          <>
            <h2 className="text-2xl font-bold mb-2">Create Course</h2>
            <p className="text-gray-600 mb-6">
              Choose how you want to create your course.
            </p>

            <div className="space-y-4">
              {/* AI-Assisted Option */}
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
                      Describe your course idea and let AI help you plan the curriculum, projects, lessons, and tasks through an interactive conversation.
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-optio-purple transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* Manual Option */}
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
                      Create a blank course and manually add projects, lessons, and tasks using the course builder.
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
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
          // Manual creation form
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
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

function EnrollmentCourseCard({ course, onSelect }) {
  return (
    <div
      onClick={onSelect}
      className="bg-white rounded-xl border border-gray-100 hover:border-optio-purple/30 hover:shadow-md transition-all cursor-pointer overflow-hidden"
    >
      {/* Cover Image */}
      <div className="relative h-32 bg-gradient-to-r from-optio-purple/20 to-optio-pink/20">
        {course.cover_image_url ? (
          <img src={course.cover_image_url} alt={course.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        )}
        {/* Status Badge */}
        <div className="absolute top-2 right-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            course.status === 'published' ? 'bg-green-100 text-green-700' :
            course.status === 'archived' ? 'bg-gray-100 text-gray-600' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {course.status || 'draft'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 line-clamp-1">{course.title}</h3>
        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
          {course.description || 'No description'}
        </p>

        {/* Meta */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            {course.quest_count || 0} projects
          </span>
          <span className="text-xs font-medium text-optio-purple">
            Manage Enrollments
          </span>
        </div>
      </div>
    </div>
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

  // Enrollment tab state
  const [enrollmentMode, setEnrollmentMode] = useState('course') // 'course' | 'user'
  const [allCourses, setAllCourses] = useState([])
  const [accessibleCourseIds, setAccessibleCourseIds] = useState(new Set())
  const [allCoursesLoading, setAllCoursesLoading] = useState(false)
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedCourses, setSelectedCourses] = useState(new Set())
  const [enrolling, setEnrolling] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [enrollmentSearchTerm, setEnrollmentSearchTerm] = useState('')
  // Unenroll state
  const [userEnrollments, setUserEnrollments] = useState([])
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false)
  const [selectedUnenrollCourses, setSelectedUnenrollCourses] = useState(new Set())
  const [unenrolling, setUnenrolling] = useState(false)
  const [userCourseView, setUserCourseView] = useState('enroll') // 'enroll' | 'unenroll'

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

  // Fetch all available courses for enrollment (org + available Optio)
  const fetchAllCourses = useCallback(async () => {
    setAllCoursesLoading(true)
    try {
      // Fetch all courses for admin visibility
      const { data } = await api.get('/api/courses?filter=admin_all')
      setAllCourses(data.courses || [])

      // Fetch accessible courses for curated policy
      const orgData = await api.get(`/api/admin/organizations/${orgId}`)
      const ids = new Set((orgData.data.curated_courses || []).map(c => c.course_id))
      setAccessibleCourseIds(ids)
    } catch (error) {
      console.error('Failed to fetch courses:', error)
    } finally {
      setAllCoursesLoading(false)
    }
  }, [orgId])

  // Fetch organization users
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      const response = await api.get(`/api/admin/organizations/${orgId}/users?per_page=200`)
      setUsers(response.data.users || [])
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setUsersLoading(false)
    }
  }, [orgId])

  // Check if a course is available based on policy
  const isCourseAvailable = useCallback((course) => {
    const isOrgCourse = course.organization_id === orgId
    if (isOrgCourse) return true

    if (policy === 'all_optio') return true
    if (policy === 'curated') return accessibleCourseIds.has(course.id)
    return false // private_only
  }, [orgId, policy, accessibleCourseIds])

  // Get available courses for enrollment
  const availableCourses = allCourses.filter(isCourseAvailable)

  useEffect(() => {
    fetchCourses()
  }, [orgId])

  useEffect(() => {
    setPolicy(orgData?.organization?.course_visibility_policy || 'all_optio')
  }, [orgData])

  // Fetch data when enrollments tab is active
  useEffect(() => {
    if (courseSubTab === 'enrollments') {
      fetchAllCourses()
      fetchUsers()
    }
  }, [courseSubTab, fetchAllCourses, fetchUsers])

  const filteredCourses = courses.filter(course =>
    course.title?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Filter available courses for enrollment search
  const filteredAvailableCourses = availableCourses.filter(course =>
    course.title?.toLowerCase().includes(enrollmentSearchTerm.toLowerCase()) ||
    course.description?.toLowerCase().includes(enrollmentSearchTerm.toLowerCase())
  )

  // Filter users for enrollment search
  const filteredUsers = users.filter(user => {
    if (!userSearchTerm) return true
    const search = userSearchTerm.toLowerCase()
    return (
      user.email?.toLowerCase().includes(search) ||
      user.display_name?.toLowerCase().includes(search) ||
      user.first_name?.toLowerCase().includes(search) ||
      user.last_name?.toLowerCase().includes(search)
    )
  })

  // Group courses by type for enrollment view
  const groupedAvailableCourses = filteredAvailableCourses.reduce((acc, course) => {
    const key = course.organization_id === orgId ? 'org' : 'optio'
    if (!acc[key]) acc[key] = []
    acc[key].push(course)
    return acc
  }, { optio: [], org: [] })

  const getDisplayName = (user) => {
    if (user.display_name) return user.display_name
    if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`
    if (user.first_name) return user.first_name
    return user.email?.split('@')[0] || 'Unknown'
  }

  const toggleCourseSelection = (courseId) => {
    setSelectedCourses(prev => {
      const newSet = new Set(prev)
      if (newSet.has(courseId)) {
        newSet.delete(courseId)
      } else {
        newSet.add(courseId)
      }
      return newSet
    })
  }

  const handleBulkEnrollInCourses = async () => {
    if (!selectedUser || selectedCourses.size === 0) return
    setEnrolling(true)

    let enrolled = 0
    let failed = 0

    for (const courseId of selectedCourses) {
      try {
        await api.post(`/api/admin/courses/${courseId}/bulk-enroll`, {
          user_ids: [selectedUser.id]
        })
        enrolled++
      } catch (err) {
        console.error(`Failed to enroll in course ${courseId}:`, err)
        failed++
      }
    }

    alert(`Enrolled ${getDisplayName(selectedUser)} in ${enrolled} course(s)${failed > 0 ? `, ${failed} failed` : ''}`)
    setSelectedCourses(new Set())
    setEnrolling(false)
    // Refresh user enrollments
    if (selectedUser) fetchUserEnrollments(selectedUser.id)
  }

  // Fetch a user's current course enrollments
  const fetchUserEnrollments = async (userId) => {
    setEnrollmentsLoading(true)
    try {
      const response = await api.get(`/api/admin/courses/user-enrollments?user_id=${userId}`)
      setUserEnrollments(response.data.enrollments || [])
    } catch (err) {
      console.error('Failed to fetch user enrollments:', err)
      setUserEnrollments([])
    } finally {
      setEnrollmentsLoading(false)
    }
  }

  // Handle user selection - also fetch their enrollments
  const handleSelectUser = (user) => {
    setSelectedUser(user)
    setSelectedCourses(new Set())
    setSelectedUnenrollCourses(new Set())
    fetchUserEnrollments(user.id)
  }

  const toggleUnenrollCourseSelection = (courseId) => {
    setSelectedUnenrollCourses(prev => {
      const newSet = new Set(prev)
      if (newSet.has(courseId)) {
        newSet.delete(courseId)
      } else {
        newSet.add(courseId)
      }
      return newSet
    })
  }

  const handleBulkUnenrollFromCourses = async () => {
    if (!selectedUser || selectedUnenrollCourses.size === 0) return
    if (!confirm(`Unenroll ${getDisplayName(selectedUser)} from ${selectedUnenrollCourses.size} course(s)? This will remove their progress.`)) return

    setUnenrolling(true)
    let unenrolled = 0
    let failed = 0

    for (const courseId of selectedUnenrollCourses) {
      try {
        await api.post(`/api/admin/courses/${courseId}/bulk-unenroll`, {
          user_ids: [selectedUser.id]
        })
        unenrolled++
      } catch (err) {
        console.error(`Failed to unenroll from course ${courseId}:`, err)
        failed++
      }
    }

    alert(`Unenrolled ${getDisplayName(selectedUser)} from ${unenrolled} course(s)${failed > 0 ? `, ${failed} failed` : ''}`)
    setSelectedUnenrollCourses(new Set())
    setUnenrolling(false)
    // Refresh user enrollments
    fetchUserEnrollments(selectedUser.id)
  }

  // Get enrolled course IDs for filtering
  const enrolledCourseIds = new Set(userEnrollments.map(e => e.course_id))

  // Filter available courses to exclude already enrolled ones
  const unenrolledCourses = availableCourses.filter(c => !enrolledCourseIds.has(c.id))

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
          onClick={() => setCourseSubTab('enrollments')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            courseSubTab === 'enrollments'
              ? 'bg-white border border-b-white border-gray-200 -mb-[3px] text-optio-purple'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Enrollments
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

      {courseSubTab === 'manage' && (
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
      )}

      {courseSubTab === 'enrollments' && (
        <>
          {/* Mode Toggle */}
          <div className="bg-white rounded-xl border border-gray-200 p-1 inline-flex">
            <button
              onClick={() => setEnrollmentMode('course')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                enrollmentMode === 'course'
                  ? 'bg-optio-purple text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Course First
            </button>
            <button
              onClick={() => setEnrollmentMode('user')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                enrollmentMode === 'user'
                  ? 'bg-optio-purple text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              User First
            </button>
          </div>

          {enrollmentMode === 'course' ? (
            <>
              {/* Course-first mode */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <div className="flex gap-3">
                  <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">Course First Mode</p>
                    <p className="mt-1">Select a course to manage its enrollments.</p>
                  </div>
                </div>
              </div>

              <input
                type="text"
                placeholder="Search courses..."
                value={enrollmentSearchTerm}
                onChange={(e) => setEnrollmentSearchTerm(e.target.value)}
                className="w-full max-w-md border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              />

              {allCoursesLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
                </div>
              ) : filteredAvailableCourses.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                  <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <p className="text-gray-500">
                    {enrollmentSearchTerm ? 'No courses match your search' : 'No courses available'}
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {groupedAvailableCourses.org.length > 0 && (
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 mb-4">
                        Organization Courses ({groupedAvailableCourses.org.length})
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {groupedAvailableCourses.org.map(course => (
                          <EnrollmentCourseCard
                            key={course.id}
                            course={course}
                            onSelect={() => setSelectedCourse(course)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {groupedAvailableCourses.optio.length > 0 && (
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 mb-4">
                        Optio Courses ({groupedAvailableCourses.optio.length})
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {groupedAvailableCourses.optio.map(course => (
                          <EnrollmentCourseCard
                            key={course.id}
                            course={course}
                            onSelect={() => setSelectedCourse(course)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {/* User-first mode */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <div className="flex gap-3">
                  <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">User First Mode</p>
                    <p className="mt-1">Select a user, then enroll or unenroll them from courses.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* User Selection */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-900 mb-4">1. Select User</h3>
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mb-4 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none text-sm"
                  />

                  {usersLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple"></div>
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto space-y-1">
                      {filteredUsers.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">No users found</p>
                      ) : (
                        filteredUsers.map(user => (
                          <div
                            key={user.id}
                            onClick={() => handleSelectUser(user)}
                            className={`p-3 rounded-lg cursor-pointer transition-colors ${
                              selectedUser?.id === user.id
                                ? 'bg-optio-purple text-white'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <p className={`font-medium text-sm ${selectedUser?.id === user.id ? 'text-white' : 'text-gray-900'}`}>
                              {getDisplayName(user)}
                            </p>
                            <p className={`text-xs ${selectedUser?.id === user.id ? 'text-white/80' : 'text-gray-500'}`}>
                              {user.email}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Course Selection */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
                  {!selectedUser ? (
                    <div className="text-center py-12 text-gray-500">
                      <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <p>Select a user first</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-sm text-gray-600">
                            Managing: <span className="font-medium text-gray-900">{getDisplayName(selectedUser)}</span>
                          </p>
                          {/* Toggle between enroll and unenroll views */}
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => setUserCourseView('enroll')}
                              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                                userCourseView === 'enroll'
                                  ? 'bg-optio-purple text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              Enroll ({unenrolledCourses.length})
                            </button>
                            <button
                              onClick={() => setUserCourseView('unenroll')}
                              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                                userCourseView === 'unenroll'
                                  ? 'bg-red-600 text-white'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              Enrolled ({userEnrollments.length})
                            </button>
                          </div>
                        </div>
                        {userCourseView === 'enroll' && selectedCourses.size > 0 && (
                          <button
                            onClick={handleBulkEnrollInCourses}
                            disabled={enrolling}
                            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
                          >
                            {enrolling ? 'Enrolling...' : `Enroll in ${selectedCourses.size} Course(s)`}
                          </button>
                        )}
                        {userCourseView === 'unenroll' && selectedUnenrollCourses.size > 0 && (
                          <button
                            onClick={handleBulkUnenrollFromCourses}
                            disabled={unenrolling}
                            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                          >
                            {unenrolling ? 'Unenrolling...' : `Unenroll from ${selectedUnenrollCourses.size} Course(s)`}
                          </button>
                        )}
                      </div>

                      {enrollmentsLoading ? (
                        <div className="flex justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple"></div>
                        </div>
                      ) : userCourseView === 'enroll' ? (
                        <div className="max-h-96 overflow-y-auto space-y-2">
                          {availableCourses.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-8">No courses available</p>
                          ) : (
                            availableCourses.map(course => {
                              const isEnrolled = enrolledCourseIds.has(course.id)
                              return (
                                <div
                                  key={course.id}
                                  onClick={() => !isEnrolled && toggleCourseSelection(course.id)}
                                  className={`p-3 rounded-lg border transition-colors flex items-center gap-3 ${
                                    isEnrolled
                                      ? 'border-gray-200 bg-gray-50 cursor-default'
                                      : selectedCourses.has(course.id)
                                        ? 'border-optio-purple bg-optio-purple/5 cursor-pointer'
                                        : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedCourses.has(course.id)}
                                    onChange={() => {}}
                                    disabled={isEnrolled}
                                    className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple disabled:opacity-50"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className={`font-medium text-sm truncate ${isEnrolled ? 'text-gray-400' : 'text-gray-900'}`}>{course.title}</p>
                                    <p className="text-xs text-gray-500">
                                      {course.organization_id === orgId ? 'Organization' : 'Optio'}
                                      {' · '}
                                      {course.quest_count || 0} projects
                                    </p>
                                  </div>
                                  {isEnrolled ? (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                      Already Enrolled
                                    </span>
                                  ) : (
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                      course.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                    }`}>
                                      {course.status || 'draft'}
                                    </span>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>
                      ) : (
                        <div className="max-h-96 overflow-y-auto space-y-2">
                          {userEnrollments.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-8">User is not enrolled in any courses</p>
                          ) : (
                            userEnrollments.map(enrollment => (
                              <div
                                key={enrollment.course_id}
                                onClick={() => toggleUnenrollCourseSelection(enrollment.course_id)}
                                className={`p-3 rounded-lg border cursor-pointer transition-colors flex items-center gap-3 ${
                                  selectedUnenrollCourses.has(enrollment.course_id)
                                    ? 'border-red-500 bg-red-50'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedUnenrollCourses.has(enrollment.course_id)}
                                  onChange={() => {}}
                                  className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm text-gray-900 truncate">{enrollment.course?.title || 'Unknown Course'}</p>
                                  <p className="text-xs text-gray-500">
                                    Enrolled {enrollment.enrolled_at ? new Date(enrollment.enrolled_at).toLocaleDateString() : ''}
                                    {enrollment.progress?.percentage !== undefined && ` · ${enrollment.progress.percentage}% complete`}
                                  </p>
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  enrollment.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {enrollment.status || 'active'}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Enrollment Manager Modal */}
          {selectedCourse && (
            <CourseEnrollmentManager
              courseId={selectedCourse.id}
              courseName={selectedCourse.title}
              orgId={orgId}
              isSuperadmin={false}
              onClose={() => setSelectedCourse(null)}
            />
          )}
        </>
      )}

      {courseSubTab === 'availability' && (
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
