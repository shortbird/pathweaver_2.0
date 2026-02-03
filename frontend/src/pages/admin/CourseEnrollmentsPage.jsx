import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import CourseEnrollmentManager from '../../components/admin/CourseEnrollmentManager'

/**
 * CourseEnrollmentsPage - Superadmin page to manage course enrollments
 *
 * Two enrollment modes:
 * 1. Course-first: Select a course, then enroll users
 * 2. User-first: Select a user, then enroll in multiple courses
 */
export default function CourseEnrollmentsPage() {
  const [courses, setCourses] = useState([])
  const [organizations, setOrganizations] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCourse, setSelectedCourse] = useState(null)

  // User-first enrollment mode
  const [enrollmentMode, setEnrollmentMode] = useState('course') // 'course' | 'user'
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedCourses, setSelectedCourses] = useState(new Set())
  const [enrolling, setEnrolling] = useState(false)

  // Unenroll state
  const [userEnrollments, setUserEnrollments] = useState([])
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false)
  const [selectedUnenrollCourses, setSelectedUnenrollCourses] = useState(new Set())
  const [unenrolling, setUnenrolling] = useState(false)
  const [userCourseView, setUserCourseView] = useState('enroll') // 'enroll' | 'unenroll'

  useEffect(() => {
    fetchCourses()
    fetchOrganizations()
  }, [])

  const fetchCourses = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/api/courses?filter=admin_all')
      const coursesData = response.data.courses || response.data || []
      coursesData.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
      setCourses(coursesData)
    } catch (err) {
      console.error('Failed to fetch courses:', err)
      setError(err.response?.data?.error || 'Failed to load courses')
    } finally {
      setLoading(false)
    }
  }

  const fetchOrganizations = async () => {
    try {
      const response = await api.get('/api/admin/organizations')
      const orgsMap = {}
      for (const org of (response.data.organizations || [])) {
        orgsMap[org.id] = org.name
      }
      setOrganizations(orgsMap)
    } catch (err) {
      console.error('Failed to fetch organizations:', err)
    }
  }

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      // Fetch platform users (no organization)
      const response = await api.get('/api/admin/users?organization=none&per_page=100')
      setUsers(response.data.users || [])
    } catch (err) {
      console.error('Failed to fetch users:', err)
    } finally {
      setUsersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (enrollmentMode === 'user') {
      fetchUsers()
    }
  }, [enrollmentMode, fetchUsers])

  const filteredCourses = courses.filter(course =>
    course.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    course.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

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

  // Group courses by organization
  const groupedCourses = filteredCourses.reduce((acc, course) => {
    const key = course.organization_id ? 'org' : 'optio'
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
    setUserCourseView('enroll')
    fetchUserEnrollments(user.id)
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
  const unenrolledCourses = courses.filter(c => !enrolledCourseIds.has(c.id))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Link to="/admin" className="text-gray-500 hover:text-gray-700">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">Course Enrollments</h1>
              </div>
              <p className="text-gray-600 mt-1 ml-8">
                Enroll platform users in courses
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Mode Toggle */}
        <div className="bg-white rounded-xl border border-gray-200 p-1 inline-flex mb-6">
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
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
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

            <div className="mb-6">
              <input
                type="text"
                placeholder="Search courses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full max-w-md border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              />
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-red-600">{error}</p>
                <button onClick={fetchCourses} className="mt-4 px-4 py-2 text-optio-purple hover:underline">
                  Retry
                </button>
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <p className="text-gray-500">
                  {searchTerm ? 'No courses match your search' : 'No courses available'}
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {groupedCourses.optio.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                      Optio Courses ({groupedCourses.optio.length})
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {groupedCourses.optio.map(course => (
                        <CourseCard
                          key={course.id}
                          course={course}
                          onSelect={() => setSelectedCourse(course)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {groupedCourses.org.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                      Organization Courses ({groupedCourses.org.length})
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {groupedCourses.org.map(course => (
                        <CourseCard
                          key={course.id}
                          course={course}
                          organizationName={organizations[course.organization_id]}
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
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-blue-800">
                  <p className="font-medium">User First Mode</p>
                  <p className="mt-1">Select a user, then choose multiple courses to enroll them in.</p>
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
                      <p className="text-sm text-gray-500 text-center py-4">No platform users found</p>
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
                        {courses.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-8">No courses available</p>
                        ) : (
                          courses.map(course => {
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
                                    {course.organization_id ? organizations[course.organization_id] || 'Organization' : 'Optio'}
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
      </div>

      {/* Enrollment Manager Modal */}
      {selectedCourse && (
        <CourseEnrollmentManager
          courseId={selectedCourse.id}
          courseName={selectedCourse.title}
          isSuperadmin={true}
          onClose={() => setSelectedCourse(null)}
        />
      )}
    </div>
  )
}

function CourseCard({ course, organizationName, onSelect }) {
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
        {/* Organization Badge */}
        {organizationName && (
          <div className="absolute top-2 left-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/90 text-gray-700 shadow-sm">
              {organizationName}
            </span>
          </div>
        )}
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
