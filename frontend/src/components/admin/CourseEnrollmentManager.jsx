import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import api from '../../services/api'

/**
 * CourseEnrollmentManager - Manage course enrollments for admins
 *
 * Used in two contexts:
 * - Superadmin: Enroll platform users (no organization) in any course
 * - Org_admin: Enroll their organization's users in their org's courses
 *
 * Props:
 *   courseId - Required course ID
 *   courseName - Optional course name for display
 *   orgId - Optional org ID (for org_admin context)
 *   isSuperadmin - Whether the user is a superadmin
 *   onClose - Close handler
 */
export default function CourseEnrollmentManager({
  courseId,
  courseName = 'Course',
  orgId,
  isSuperadmin = false,
  onClose
}) {
  const [activeTab, setActiveTab] = useState('enroll') // 'enroll' | 'enrolled'

  // Enroll tab state
  const [users, setUsers] = useState([])
  const [selectedUsers, setSelectedUsers] = useState(new Set())
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)
  const [enrolling, setEnrolling] = useState(false)

  // Enrolled tab state
  const [enrollments, setEnrollments] = useState([])
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false)
  const [enrollmentsError, setEnrollmentsError] = useState('')
  const [enrolledSearchTerm, setEnrolledSearchTerm] = useState('')
  const [enrolledPage, setEnrolledPage] = useState(1)
  const [enrolledTotalPages, setEnrolledTotalPages] = useState(1)
  const [enrolledTotal, setEnrolledTotal] = useState(0)
  const [selectedEnrollments, setSelectedEnrollments] = useState(new Set())
  const [unenrolling, setUnenrolling] = useState(false)

  const perPage = 25

  // Fetch enrollable users
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true)
    setUsersError('')
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        per_page: perPage.toString()
      })
      if (searchTerm) params.append('search', searchTerm)

      const response = await api.get(`/api/admin/courses/${courseId}/enrollable-users?${params}`)
      setUsers(response.data.users || [])
      setTotalPages(response.data.total_pages || 1)
      setTotalUsers(response.data.total || 0)
    } catch (err) {
      console.error('Failed to fetch enrollable users:', err)
      setUsersError(err.response?.data?.error || 'Failed to load users')
    } finally {
      setUsersLoading(false)
    }
  }, [courseId, currentPage, searchTerm])

  // Fetch enrolled users
  const fetchEnrollments = useCallback(async () => {
    setEnrollmentsLoading(true)
    setEnrollmentsError('')
    try {
      const params = new URLSearchParams({
        page: enrolledPage.toString(),
        per_page: perPage.toString()
      })
      if (enrolledSearchTerm) params.append('search', enrolledSearchTerm)

      const response = await api.get(`/api/admin/courses/${courseId}/enrollments?${params}`)
      setEnrollments(response.data.enrollments || [])
      setEnrolledTotalPages(response.data.total_pages || 1)
      setEnrolledTotal(response.data.total || 0)
    } catch (err) {
      console.error('Failed to fetch enrollments:', err)
      setEnrollmentsError(err.response?.data?.error || 'Failed to load enrollments')
    } finally {
      setEnrollmentsLoading(false)
    }
  }, [courseId, enrolledPage, enrolledSearchTerm])

  // Load data when tab changes or search/page changes
  useEffect(() => {
    if (activeTab === 'enroll') {
      fetchUsers()
    } else {
      fetchEnrollments()
    }
  }, [activeTab, fetchUsers, fetchEnrollments])

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  useEffect(() => {
    setEnrolledPage(1)
  }, [enrolledSearchTerm])

  // Toggle user selection
  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(userId)) {
        newSet.delete(userId)
      } else {
        newSet.add(userId)
      }
      return newSet
    })
  }

  // Select all visible users (that are not already enrolled)
  const selectAllVisible = () => {
    const enrollableUsers = users.filter(u => !u.is_enrolled)
    if (selectedUsers.size === enrollableUsers.length && enrollableUsers.length > 0) {
      setSelectedUsers(new Set())
    } else {
      setSelectedUsers(new Set(enrollableUsers.map(u => u.id)))
    }
  }

  // Toggle enrollment selection
  const toggleEnrollmentSelection = (userId) => {
    setSelectedEnrollments(prev => {
      const newSet = new Set(prev)
      if (newSet.has(userId)) {
        newSet.delete(userId)
      } else {
        newSet.add(userId)
      }
      return newSet
    })
  }

  // Select all visible enrollments
  const selectAllEnrollments = () => {
    if (selectedEnrollments.size === enrollments.length && enrollments.length > 0) {
      setSelectedEnrollments(new Set())
    } else {
      setSelectedEnrollments(new Set(enrollments.map(e => e.user_id)))
    }
  }

  // Bulk enroll selected users
  const handleBulkEnroll = async () => {
    if (selectedUsers.size === 0) return
    setEnrolling(true)

    try {
      const response = await api.post(`/api/admin/courses/${courseId}/bulk-enroll`, {
        user_ids: Array.from(selectedUsers)
      })

      const { enrolled, failed, skipped } = response.data
      let message = `Enrolled ${enrolled} user(s)`
      if (skipped > 0) message += `, ${skipped} already enrolled`
      if (failed > 0) message += `, ${failed} failed`

      alert(message)
      setSelectedUsers(new Set())
      fetchUsers() // Refresh to update is_enrolled status
      fetchEnrollments() // Refresh enrollment list
    } catch (err) {
      console.error('Failed to bulk enroll:', err)
      alert(err.response?.data?.error || 'Failed to enroll users')
    } finally {
      setEnrolling(false)
    }
  }

  // Bulk unenroll selected users
  const handleBulkUnenroll = async () => {
    if (selectedEnrollments.size === 0) return
    if (!confirm(`Unenroll ${selectedEnrollments.size} user(s) from this course? This will remove their progress.`)) return

    setUnenrolling(true)
    try {
      const response = await api.post(`/api/admin/courses/${courseId}/bulk-unenroll`, {
        user_ids: Array.from(selectedEnrollments)
      })

      const { unenrolled, failed } = response.data
      let message = `Unenrolled ${unenrolled} user(s)`
      if (failed > 0) message += `, ${failed} failed`

      alert(message)
      setSelectedEnrollments(new Set())
      fetchEnrollments() // Refresh
      fetchUsers() // Refresh to update is_enrolled status
    } catch (err) {
      console.error('Failed to bulk unenroll:', err)
      alert(err.response?.data?.error || 'Failed to unenroll users')
    } finally {
      setUnenrolling(false)
    }
  }

  // Get display name for a user
  const getDisplayName = (user) => {
    if (user.display_name) return user.display_name
    if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`
    if (user.first_name) return user.first_name
    if (user.last_name) return user.last_name
    return user.email?.split('@')[0] || 'Unknown'
  }

  // Pagination component
  const Pagination = ({ currentPage, totalPages, total, perPage, onPageChange, label = 'items' }) => {
    if (totalPages <= 1) return null
    const startIndex = (currentPage - 1) * perPage
    return (
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Showing {startIndex + 1} to {Math.min(startIndex + perPage, total)} of {total} {label}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Previous
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum
            if (totalPages <= 5) {
              pageNum = i + 1
            } else if (currentPage <= 3) {
              pageNum = i + 1
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i
            } else {
              pageNum = currentPage - 2 + i
            }
            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`px-3 py-1.5 border rounded-lg text-sm font-medium ${
                  currentPage === pageNum
                    ? 'bg-optio-purple text-white border-optio-purple'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                {pageNum}
              </button>
            )
          })}
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      </div>
    )
  }

  // Progress bar component
  const ProgressBar = ({ progress }) => {
    const percentage = progress?.percentage || 0
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-optio-purple to-optio-pink transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 w-12 text-right">{percentage}%</span>
      </div>
    )
  }

  const enrollableUsers = users.filter(u => !u.is_enrolled)

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Manage Enrollments</h2>
            <p className="text-sm text-gray-600 mt-0.5">{courseName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-4 border-b border-gray-100">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('enroll')}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'enroll'
                  ? 'border-optio-purple text-optio-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Enroll Users
            </button>
            <button
              onClick={() => setActiveTab('enrolled')}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'enrolled'
                  ? 'border-optio-purple text-optio-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Enrolled ({enrolledTotal})
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'enroll' ? (
            <div className="space-y-4">
              {/* Search and Bulk Actions */}
              <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="border border-gray-200 rounded-lg px-4 py-2 w-64 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                  />
                  <span className="text-sm text-gray-500">
                    {totalUsers} {isSuperadmin ? 'platform' : 'organization'} users
                  </span>
                </div>
                {selectedUsers.size > 0 && (
                  <button
                    onClick={handleBulkEnroll}
                    disabled={enrolling}
                    className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    {enrolling ? 'Enrolling...' : `Enroll ${selectedUsers.size} Selected`}
                  </button>
                )}
              </div>

              {/* Users Table */}
              {usersLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
                </div>
              ) : usersError ? (
                <div className="text-center py-12 text-red-600">{usersError}</div>
              ) : users.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  {searchTerm ? 'No users match your search' : 'No users available'}
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-4 text-left">
                            <input
                              type="checkbox"
                              checked={selectedUsers.size === enrollableUsers.length && enrollableUsers.length > 0}
                              onChange={selectAllVisible}
                              disabled={enrollableUsers.length === 0}
                              className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple disabled:opacity-50"
                            />
                          </th>
                          <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                          <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                          <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                          <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {users.map(user => (
                          <tr
                            key={user.id}
                            onClick={() => !user.is_enrolled && toggleUserSelection(user.id)}
                            className={`${
                              user.is_enrolled
                                ? 'bg-gray-50 text-gray-400'
                                : selectedUsers.has(user.id)
                                  ? 'bg-optio-purple/5 cursor-pointer'
                                  : 'hover:bg-gray-50 cursor-pointer'
                            }`}
                          >
                            <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedUsers.has(user.id)}
                                onChange={() => toggleUserSelection(user.id)}
                                disabled={user.is_enrolled}
                                className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple disabled:opacity-50"
                              />
                            </td>
                            <td className="px-4 py-4 font-medium">{getDisplayName(user)}</td>
                            <td className="px-4 py-4 text-gray-600">{user.email}</td>
                            <td className="px-4 py-4">
                              <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                {user.org_role || user.role}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              {user.is_enrolled ? (
                                <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                  Enrolled
                                </span>
                              ) : (
                                <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                                  Not Enrolled
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    total={totalUsers}
                    perPage={perPage}
                    onPageChange={setCurrentPage}
                    label="users"
                  />
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Search and Bulk Actions */}
              <div className="flex flex-wrap gap-4 items-center justify-between">
                <input
                  type="text"
                  placeholder="Search enrolled users..."
                  value={enrolledSearchTerm}
                  onChange={(e) => setEnrolledSearchTerm(e.target.value)}
                  className="border border-gray-200 rounded-lg px-4 py-2 w-64 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                />
                {selectedEnrollments.size > 0 && (
                  <button
                    onClick={handleBulkUnenroll}
                    disabled={unenrolling}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {unenrolling ? 'Unenrolling...' : `Unenroll ${selectedEnrollments.size} Selected`}
                  </button>
                )}
              </div>

              {/* Enrollments Table */}
              {enrollmentsLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
                </div>
              ) : enrollmentsError ? (
                <div className="text-center py-12 text-red-600">{enrollmentsError}</div>
              ) : enrollments.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  {enrolledSearchTerm ? 'No enrollments match your search' : 'No users enrolled yet'}
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-4 text-left">
                            <input
                              type="checkbox"
                              checked={selectedEnrollments.size === enrollments.length && enrollments.length > 0}
                              onChange={selectAllEnrollments}
                              className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                            />
                          </th>
                          <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                          <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                          <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Progress</th>
                          <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Enrolled</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {enrollments.map(enrollment => (
                          <tr
                            key={enrollment.id}
                            onClick={() => toggleEnrollmentSelection(enrollment.user_id)}
                            className={`cursor-pointer ${
                              selectedEnrollments.has(enrollment.user_id)
                                ? 'bg-optio-purple/5'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedEnrollments.has(enrollment.user_id)}
                                onChange={() => toggleEnrollmentSelection(enrollment.user_id)}
                                className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                              />
                            </td>
                            <td className="px-4 py-4 font-medium">{getDisplayName(enrollment.user)}</td>
                            <td className="px-4 py-4 text-gray-600">{enrollment.user?.email}</td>
                            <td className="px-4 py-4 w-48">
                              <ProgressBar progress={enrollment.progress} />
                            </td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                                enrollment.status === 'completed'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                {enrollment.status}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-500">
                              {enrollment.enrolled_at
                                ? new Date(enrollment.enrolled_at).toLocaleDateString()
                                : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Pagination
                    currentPage={enrolledPage}
                    totalPages={enrolledTotalPages}
                    total={enrolledTotal}
                    perPage={perPage}
                    onPageChange={setEnrolledPage}
                    label="enrollments"
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
