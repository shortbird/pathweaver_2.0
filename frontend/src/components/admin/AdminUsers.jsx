import React, { useState, useEffect, memo, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import toast from 'react-hot-toast'
import logger from '../../utils/logger'

// Lazy load large modals to reduce initial bundle size
const UserDetailsModal = lazy(() => import('./UserDetailsModal'))
const BulkEmailModal = lazy(() => import('./BulkEmailModal'))
// import { useAdminSubscriptionTiers } from '../../hooks/useSubscriptionTiers' // REMOVED - Phase 3 refactoring (January 2025)

const AdminUsers = () => {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [filters, setFilters] = useState({
    role: 'all',
    activity: 'all',
    organization: 'all',
    sortBy: 'last_active',
    sortOrder: 'desc'
  })
  const [organizations, setOrganizations] = useState([])
  // Default to card view on mobile (< 768px), list view on larger screens
  // Automatically switches when crossing the 768px breakpoint
  const [viewMode, setViewMode] = useState(() =>
    window.innerWidth < 768 ? 'card' : 'list'
  )
  const [manualViewMode, setManualViewMode] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = (e) => {
      if (!manualViewMode) {
        setViewMode(e.matches ? 'list' : 'card')
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [manualViewMode])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState(new Set())
  const [showUserModal, setShowUserModal] = useState(false)
  const [showBulkEmailModal, setShowBulkEmailModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const usersPerPage = 20

  // Debounce search term to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Reset to page 1 when search term changes
  useEffect(() => {
    if (debouncedSearchTerm !== searchTerm) return // Only reset when debounced value changes
    setCurrentPage(1)
  }, [debouncedSearchTerm])

  useEffect(() => {
    fetchUsers()
  }, [currentPage, filters, debouncedSearchTerm])

  useEffect(() => {
    fetchOrganizations()
  }, [])

  const fetchOrganizations = async () => {
    try {
      const response = await api.get('/api/admin/organizations')
      setOrganizations(response.data.organizations || [])
    } catch (error) {
      console.error('Failed to fetch organizations:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      const queryParams = new URLSearchParams({
        page: currentPage,
        limit: usersPerPage,
        search: debouncedSearchTerm,
        role: filters.role,
        activity: filters.activity,
        organization: filters.organization,
        sort_by: filters.sortBy,
        sort_order: filters.sortOrder,
        _t: Date.now() // Cache buster
      })

      const response = await api.get(`/api/admin/users?${queryParams}`)

      // Debug logging - check if emails are in the response
      logger.debug('API Response Sample:', response.data.users?.slice(0, 3))

      setUsers(response.data.users || [])
      setTotalPages(Math.ceil((response.data.total || 0) / usersPerPage))
    } catch (error) {
      toast.error('Failed to load users')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setCurrentPage(1)
    fetchUsers()
  }

  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({ ...prev, [filterType]: value }))
    setCurrentPage(1)
  }

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

  const selectAllUsers = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set())
    } else {
      setSelectedUsers(new Set(users.map(u => u.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedUsers.size === 0) return
    if (!confirm(`Permanently delete ${selectedUsers.size} user(s)? This cannot be undone.`)) return

    try {
      const response = await api.post('/api/admin/users/bulk-delete', {
        user_ids: Array.from(selectedUsers)
      })
      const { deleted, failed } = response.data
      toast.success(`Deleted ${deleted} user(s)${failed > 0 ? `, ${failed} failed` : ''}`)
      setSelectedUsers(new Set())
      fetchUsers()
    } catch (error) {
      console.error('Failed to bulk delete users:', error)
      toast.error(error.response?.data?.error || 'Failed to delete users')
    }
  }

  const handleEditUser = (user) => {
    setEditingUser(user)
    setShowUserModal(true)
  }

  const getRoleBadge = (role) => {
    const badges = {
      superadmin: 'bg-red-700 text-white',
      org_admin: 'bg-orange-100 text-orange-700',
      org_managed: 'bg-indigo-100 text-indigo-700',
      advisor: 'bg-purple-100 text-purple-700',
      parent: 'bg-green-100 text-green-700',
      student: 'bg-blue-100 text-blue-700',
      observer: 'bg-gray-100 text-gray-700'
    }
    return badges[role] || badges.student
  }

  const getRoleDisplayName = (role) => {
    const names = {
      superadmin: 'Superadmin',
      org_admin: 'Org Admin',
      org_managed: 'Org Managed',
      advisor: 'Advisor',
      parent: 'Parent',
      student: 'Student',
      observer: 'Observer'
    }
    return names[role] || role
  }

  const formatDate = (date) => {
    if (!date) return 'Never'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  if (loading) {
    return <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold">Manage Users</h2>
        <div className="hidden sm:flex gap-3">
          {/* View Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => { setViewMode('list'); setManualViewMode(true) }}
              className={`px-3 py-2 rounded-md transition-colors flex items-center gap-2 ${
                viewMode === 'list'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="List View"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              List
            </button>
            <button
              onClick={() => { setViewMode('card'); setManualViewMode(true) }}
              className={`px-3 py-2 rounded-md transition-colors flex items-center gap-2 ${
                viewMode === 'card'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Card View"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              Cards
            </button>
          </div>
          <button
            onClick={() => setShowBulkEmailModal(true)}
            disabled={selectedUsers.size === 0}
            className={`px-4 py-2 rounded-lg ${
              selectedUsers.size > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Email Selected ({selectedUsers.size})
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={selectedUsers.size === 0}
            className={`px-4 py-2 rounded-lg ${
              selectedUsers.size > 0
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Delete Selected ({selectedUsers.size})
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow mb-6">
        {/* Search bar + filter toggle - always visible */}
        <div className="flex items-center gap-2 p-3 sm:p-4">
          <form onSubmit={handleSearch} className="flex-1">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
              aria-label="Search users by name or email"
            />
          </form>
          <button
            onClick={() => setFiltersOpen(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg border text-sm font-medium transition-colors flex-shrink-0 ${
              filtersOpen
                ? 'bg-optio-purple/10 border-optio-purple/30 text-optio-purple'
                : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
            }`}
            aria-expanded={filtersOpen}
            aria-label="Toggle filters"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="hidden sm:inline">Filters</span>
            <svg className={`w-3.5 h-3.5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Collapsible filters */}
        {filtersOpen && (
          <div className="border-t border-gray-200 px-3 sm:px-4 pb-3 sm:pb-4 pt-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <select
                value={filters.organization}
                onChange={(e) => handleFilterChange('organization', e.target.value)}
                className="px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                aria-label="Filter by organization"
              >
                <option value="all">All Orgs</option>
                <option value="none">No Org</option>
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
              <select
                value={filters.role}
                onChange={(e) => handleFilterChange('role', e.target.value)}
                className="px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                aria-label="Filter by role"
              >
                <option value="all">All Roles</option>
                <option value="superadmin">Superadmins</option>
                <option value="org_admin">Org Admins</option>
                <option value="advisor">Advisors</option>
                <option value="parent">Parents</option>
                <option value="student">Students</option>
                <option value="observer">Observers</option>
              </select>
              <select
                value={filters.activity}
                onChange={(e) => handleFilterChange('activity', e.target.value)}
                className="px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                aria-label="Filter by activity status"
              >
                <option value="all">All Activity</option>
                <option value="active_7">Active (7 days)</option>
                <option value="active_30">Active (30 days)</option>
                <option value="inactive">Inactive</option>
              </select>
              <select
                value={filters.sortBy}
                onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                className="px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                aria-label="Sort users by"
              >
                <option value="created_at">Join Date</option>
                <option value="last_active">Last Active</option>
                <option value="total_xp">Total XP</option>
                <option value="first_name">Name</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Users Table - List View */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedUsers.size === users.length && users.length > 0}
                    onChange={selectAllUsers}
                    className="rounded"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Org
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Active
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedUsers.has(user.id)}
                      onChange={() => toggleUserSelection(user.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={`Profile picture of ${user.first_name} ${user.last_name}`}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <span className="text-gray-600 font-medium">
                              {(user.first_name?.[0] || user.email[0]).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {user.first_name} {user.last_name}
                        </div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">
                      {user.organization_name || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadge(user.role || 'student')}`}>
                      {getRoleDisplayName(user.role || 'student')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(user.last_active)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleEditUser(user)}
                      className="px-4 py-2 min-h-[44px] min-w-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors text-sm font-medium touch-manipulation"
                    >
                      View User
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

        {/* Pagination - Desktop */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing page <span className="font-medium">{currentPage}</span> of{' '}
                  <span className="font-medium">{totalPages}</span>
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
        </div>
      )}

      {/* Users Cards - Card View */}
      {viewMode === 'card' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3 hover:shadow-md transition-shadow"
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={selectedUsers.has(user.id)}
                onChange={() => toggleUserSelection(user.id)}
                className="w-5 h-5 rounded cursor-pointer touch-manipulation flex-shrink-0"
              />

              {/* Avatar */}
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={`${user.first_name} ${user.last_name}`}
                  className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">
                    {(user.first_name?.[0] || user.email[0]).toUpperCase()}
                  </span>
                </div>
              )}

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {user.first_name} {user.last_name}
                  </p>
                  <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full flex-shrink-0 ${getRoleBadge(user.role || 'student')}`}>
                    {getRoleDisplayName(user.role || 'student')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(user.last_active)}</p>
              </div>

              {/* View Button */}
              <button
                onClick={() => handleEditUser(user)}
                className="px-3 py-1.5 text-xs font-medium text-optio-purple bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors flex-shrink-0 min-h-[36px] touch-manipulation"
              >
                View
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pagination - Card View */}
      {viewMode === 'card' && totalPages > 1 && (
        <div className="flex justify-between items-center pt-6">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-700">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {/* User Details Modal */}
      {showUserModal && editingUser && (
        <Suspense fallback={<div />}>
          <UserDetailsModal
            user={editingUser}
            onClose={() => {
              setShowUserModal(false)
              setEditingUser(null)
            }}
            onSave={() => {
              setShowUserModal(false)
              setEditingUser(null)
              fetchUsers()
            }}
          />
        </Suspense>
      )}

      {/* Bulk Email Modal */}
      {showBulkEmailModal && (
        <Suspense fallback={<div />}>
          <BulkEmailModal
            selectedUserIds={Array.from(selectedUsers)}
            users={users.filter(u => selectedUsers.has(u.id))}
            onClose={() => setShowBulkEmailModal(false)}
            onSend={() => {
              setShowBulkEmailModal(false)
              setSelectedUsers(new Set())
            }}
          />
        </Suspense>
      )}
    </div>
  )
}

export default memo(AdminUsers)