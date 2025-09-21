import React, { useState, useEffect, memo } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { getTierDisplayName } from '../../utils/tierMapping'
import UserDetailsModal from './UserDetailsModal'
import BulkEmailModal from './BulkEmailModal'

const AdminDashboard = () => {
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filters, setFilters] = useState({
    subscription: 'all',
    role: 'all',
    activity: 'all',
    sortBy: 'created_at',
    sortOrder: 'desc'
  })
  const [selectedUsers, setSelectedUsers] = useState(new Set())
  const [showUserModal, setShowUserModal] = useState(false)
  const [showBulkEmailModal, setShowBulkEmailModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [roleChangeUser, setRoleChangeUser] = useState(null)
  const [newRole, setNewRole] = useState('')
  const [roleChangeReason, setRoleChangeReason] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const usersPerPage = 10 // Reduced for dashboard view

  useEffect(() => {
    fetchUsers()
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [currentPage, filters])

  const fetchUsers = async () => {
    try {
      const queryParams = new URLSearchParams({
        page: currentPage,
        limit: usersPerPage,
        search: searchTerm,
        subscription: filters.subscription,
        role: filters.role,
        activity: filters.activity,
        sort_by: filters.sortBy,
        sort_order: filters.sortOrder
      })

      const response = await api.get(`/api/v3/admin/users?${queryParams}`)
      setUsers(response.data.users || [])
      setTotalPages(Math.ceil((response.data.total || 0) / usersPerPage))
    } catch (error) {
      toast.error('Failed to load users')
      setUsers([])
    } finally {
      setUsersLoading(false)
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

  const handleEditUser = (user) => {
    setEditingUser(user)
    setShowUserModal(true)
  }

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      try {
        await api.delete(`/api/v3/admin/users/${userId}`)
        toast.success('User deleted successfully')
        fetchUsers()
      } catch (error) {
        toast.error('Failed to delete user')
      }
    }
  }

  const handleToggleUserStatus = async (userId, currentStatus) => {
    const action = currentStatus === 'active' ? 'disable' : 'enable'
    if (window.confirm(`Are you sure you want to ${action} this user account?`)) {
      try {
        await api.post(`/api/v3/admin/users/${userId}/toggle-status`)
        toast.success(`User account ${action}d successfully`)
        fetchUsers()
      } catch (error) {
        toast.error(`Failed to ${action} user account`)
      }
    }
  }

  const handleChangeRole = (user) => {
    setRoleChangeUser(user)
    setNewRole(user.role || 'student')
    setRoleChangeReason('')
    setShowRoleModal(true)
  }

  const handleSubmitRoleChange = async () => {
    if (!roleChangeUser || !newRole) return

    try {
      const response = await api.put(`/api/v3/admin/users/${roleChangeUser.id}/role`, {
        role: newRole,
        reason: roleChangeReason || 'Role change requested by admin'
      })

      toast.success(`Role updated to ${response.data.display_name}`)
      setShowRoleModal(false)
      setRoleChangeUser(null)
      setNewRole('')
      setRoleChangeReason('')
      fetchUsers()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update role')
    }
  }

  const handleResetPassword = async (userId, userEmail) => {
    if (window.confirm(`Send password reset email to ${userEmail}?`)) {
      try {
        await api.post(`/api/v3/admin/users/${userId}/reset-password`)
        toast.success('Password reset email sent')
      } catch (error) {
        toast.error('Failed to send password reset email')
      }
    }
  }

  const getSubscriptionBadge = (tier) => {
    const badges = {
      free: 'bg-gray-100 text-gray-700',
      explorer: 'bg-gray-100 text-gray-700',
      supported: 'bg-blue-100 text-blue-700',
      academy: 'bg-purple-100 text-purple-700'
    }
    return badges[tier] || badges.free
  }

  const getRoleBadge = (role) => {
    const badges = {
      student: 'bg-blue-100 text-blue-700',
      parent: 'bg-green-100 text-green-700',
      advisor: 'bg-purple-100 text-purple-700',
      admin: 'bg-red-100 text-red-700'
    }
    return badges[role] || badges.student
  }

  const getRoleDisplayName = (role) => {
    const names = {
      student: 'Student',
      parent: 'Parent',
      advisor: 'Advisor',
      admin: 'Admin'
    }
    return names[role] || 'Student'
  }

  const formatDate = (date) => {
    if (!date) return 'Never'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard Overview</h2>

      {/* Users Section */}
      <div className="mt-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">Recent Users</h3>
          <button
            onClick={() => setShowBulkEmailModal(true)}
            disabled={selectedUsers.size === 0}
            className={`px-4 py-2 rounded text-sm ${
              selectedUsers.size > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Email Selected ({selectedUsers.size})
          </button>
        </div>

        {/* Search and Filters */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="md:col-span-2">
              <form onSubmit={handleSearch}>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </form>
            </div>
            <select
              value={filters.role}
              onChange={(e) => handleFilterChange('role', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Roles</option>
              <option value="student">Students</option>
              <option value="parent">Parents</option>
              <option value="advisor">Advisors</option>
              <option value="admin">Admins</option>
            </select>
            <select
              value={filters.subscription}
              onChange={(e) => handleFilterChange('subscription', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Subscriptions</option>
              <option value="free">Free</option>
              <option value="supported">Supported</option>
              <option value="academy">Academy</option>
            </select>
            <select
              value={filters.activity}
              onChange={(e) => handleFilterChange('activity', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Activity</option>
              <option value="active_7">Active (7 days)</option>
              <option value="active_30">Active (30 days)</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              value={filters.sortBy}
              onChange={(e) => handleFilterChange('sortBy', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="created_at">Join Date</option>
              <option value="last_active">Last Active</option>
              <option value="total_xp">Total XP</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        {usersLoading ? (
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        ) : (
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
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subscription
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
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <span className="text-gray-600 font-medium">
                              {(user.first_name?.[0] || user.email[0]).toUpperCase()}
                            </span>
                          </div>
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
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadge(user.role || 'student')}`}>
                        {getRoleDisplayName(user.role || 'student')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getSubscriptionBadge(user.subscription_tier || 'explorer')}`}>
                        {getTierDisplayName(user.subscription_tier || 'explorer')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {formatDate(user.last_active)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEditUser(user)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Edit User"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleChangeRole(user)}
                          className="text-purple-600 hover:text-purple-900"
                          title="Change Role"
                        >
                          Role
                        </button>
                        <button
                          onClick={() => handleResetPassword(user.id, user.email)}
                          className="text-yellow-600 hover:text-yellow-900"
                          title="Reset Password"
                        >
                          Reset
                        </button>
                        <button
                          onClick={() => handleToggleUserStatus(user.id, user.status || 'active')}
                          className="text-orange-600 hover:text-orange-900"
                          title={user.status === 'active' ? 'Disable Account' : 'Enable Account'}
                        >
                          {user.status === 'active' ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete User"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
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
      </div>

      {/* User Details Modal */}
      {showUserModal && editingUser && (
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
      )}

      {/* Bulk Email Modal */}
      {showBulkEmailModal && (
        <BulkEmailModal
          selectedUserIds={Array.from(selectedUsers)}
          users={users.filter(u => selectedUsers.has(u.id))}
          onClose={() => setShowBulkEmailModal(false)}
          onSend={() => {
            setShowBulkEmailModal(false)
            setSelectedUsers(new Set())
          }}
        />
      )}

      {/* Role Change Modal */}
      {showRoleModal && roleChangeUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Change User Role</h3>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                Changing role for: <span className="font-semibold">{roleChangeUser.first_name} {roleChangeUser.last_name}</span>
              </p>
              <p className="text-sm text-gray-600">
                Current role: <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getRoleBadge(roleChangeUser.role || 'student')}`}>
                  {getRoleDisplayName(roleChangeUser.role || 'student')}
                </span>
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Role
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="student">Student</option>
                <option value="parent">Parent</option>
                <option value="advisor">Advisor</option>
                <option value="admin">Administrator</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Change (Optional)
              </label>
              <textarea
                value={roleChangeReason}
                onChange={(e) => setRoleChangeReason(e.target.value)}
                placeholder="Enter reason for role change..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows="3"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowRoleModal(false)
                  setRoleChangeUser(null)
                  setNewRole('')
                  setRoleChangeReason('')
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitRoleChange}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Update Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(AdminDashboard)