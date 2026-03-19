import React, { useState, useEffect, memo } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { MagnifyingGlassIcon, XMarkIcon, CheckCircleIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'

/**
 * UserEnrollmentsTab - Shows and manages course enrollments for a specific user
 * within the UserDetailsModal.
 */
const UserEnrollmentsTab = ({ user }) => {
  const [loading, setLoading] = useState(true)
  const [enrollments, setEnrollments] = useState([])
  const [allCourses, setAllCourses] = useState([])

  // Add enrollment state
  const [showAddForm, setShowAddForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCourseIds, setSelectedCourseIds] = useState([])
  const [enrollLoading, setEnrollLoading] = useState(false)

  // Unenroll state
  const [selectedUnenrollIds, setSelectedUnenrollIds] = useState([])
  const [unenrollLoading, setUnenrollLoading] = useState(false)

  useEffect(() => {
    loadData()
  }, [user.id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [enrollRes, coursesRes] = await Promise.all([
        api.get(`/api/admin/courses/user-enrollments?user_id=${user.id}`),
        api.get('/api/courses?filter=admin_all')
      ])
      setEnrollments(enrollRes.data.enrollments || [])
      setAllCourses(coursesRes.data.courses || [])
    } catch (error) {
      console.error('Error loading enrollment data:', error)
      toast.error('Failed to load enrollments')
    } finally {
      setLoading(false)
    }
  }

  const enrolledCourseIds = new Set(enrollments.map(e => e.course_id))

  const availableCourses = allCourses.filter(c =>
    !enrolledCourseIds.has(c.id) && c.status === 'published'
  )

  const filteredAvailable = availableCourses.filter(c => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      c.title?.toLowerCase().includes(search) ||
      c.description?.toLowerCase().includes(search)
    )
  })

  const handleEnroll = async () => {
    if (selectedCourseIds.length === 0) return
    setEnrollLoading(true)
    try {
      await Promise.all(
        selectedCourseIds.map(courseId =>
          api.post(`/api/admin/courses/${courseId}/bulk-enroll`, { user_ids: [user.id] })
        )
      )
      toast.success(`Enrolled in ${selectedCourseIds.length} course(s)`)
      setShowAddForm(false)
      setSelectedCourseIds([])
      setSearchTerm('')
      loadData()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to enroll')
    } finally {
      setEnrollLoading(false)
    }
  }

  const handleUnenroll = async () => {
    if (selectedUnenrollIds.length === 0) return
    const count = selectedUnenrollIds.length
    if (!window.confirm(`Remove ${user.first_name || 'this user'} from ${count} course(s)?`)) return

    setUnenrollLoading(true)
    try {
      await Promise.all(
        selectedUnenrollIds.map(courseId =>
          api.post(`/api/admin/courses/${courseId}/bulk-unenroll`, { user_ids: [user.id] })
        )
      )
      toast.success(`Unenrolled from ${count} course(s)`)
      setSelectedUnenrollIds([])
      loadData()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to unenroll')
    } finally {
      setUnenrollLoading(false)
    }
  }

  const toggleCourseSelection = (id) => {
    setSelectedCourseIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleUnenrollSelection = (id) => {
    setSelectedUnenrollIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {enrollments.length} course{enrollments.length !== 1 ? 's' : ''} enrolled
        </p>
        <button
          onClick={() => { setShowAddForm(true); setSearchTerm(''); setSelectedCourseIds([]) }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-optio-purple bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Enroll in Course
        </button>
      </div>

      {/* Current Enrollments */}
      {enrollments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="font-medium">No course enrollments</p>
          <p className="text-sm mt-1">Click "Enroll in Course" to add courses.</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
            {enrollments.map(enrollment => {
              const course = enrollment.course || {}
              const isSelected = selectedUnenrollIds.includes(enrollment.course_id)
              return (
                <div
                  key={enrollment.course_id}
                  className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-red-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => toggleUnenrollSelection(enrollment.course_id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-red-500 border-red-500' : 'border-gray-300'
                    }`}>
                      {isSelected && <CheckCircleIcon className="w-3 h-3 text-white" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {course.title || 'Unknown Course'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {enrollment.status && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                            enrollment.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {enrollment.status}
                          </span>
                        )}
                        {enrollment.enrolled_at && (
                          <span className="text-xs text-gray-400">
                            Enrolled {formatDate(enrollment.enrolled_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Unenroll action bar */}
          {selectedUnenrollIds.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
              <span className="text-sm text-red-700 font-medium">
                {selectedUnenrollIds.length} selected
              </span>
              <button
                onClick={handleUnenroll}
                disabled={unenrollLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                <TrashIcon className="w-4 h-4" />
                {unenrollLoading ? 'Removing...' : 'Unenroll'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Add Enrollment Form */}
      {showAddForm && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold text-gray-900">Enroll in Course</h4>
            <button
              onClick={() => setShowAddForm(false)}
              className="p-1 hover:bg-gray-200 rounded transition-colors"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search courses..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
          </div>

          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg bg-white">
            {filteredAvailable.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500">
                {availableCourses.length === 0 ? 'No available courses' : 'No matches found'}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredAvailable.map(course => (
                  <button
                    key={course.id}
                    onClick={() => toggleCourseSelection(course.id)}
                    className={`w-full text-left p-2.5 transition-colors flex items-center gap-2.5 ${
                      selectedCourseIds.includes(course.id) ? 'bg-purple-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedCourseIds.includes(course.id)
                        ? 'bg-optio-purple border-optio-purple'
                        : 'border-gray-300'
                    }`}>
                      {selectedCourseIds.includes(course.id) && (
                        <CheckCircleIcon className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{course.title}</p>
                      {course.description && (
                        <p className="text-xs text-gray-500 truncate">{course.description}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleEnroll}
              disabled={selectedCourseIds.length === 0 || enrollLoading}
              className="px-3 py-1.5 text-sm bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enrollLoading ? 'Enrolling...' : `Enroll (${selectedCourseIds.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(UserEnrollmentsTab)
