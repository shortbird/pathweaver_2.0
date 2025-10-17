import React, { useState, useEffect, memo } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import UserDetailsModal from './UserDetailsModal'
import BulkEmailModal from './BulkEmailModal'
import ChatLogsModal from './ChatLogsModal'
import QuestSelectionModal from './QuestSelectionModal'
import { useAdminSubscriptionTiers } from '../../hooks/useSubscriptionTiers'

const AdminUsers = () => {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
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
  const [showChatLogsModal, setShowChatLogsModal] = useState(false)
  const [showQuestSelectionModal, setShowQuestSelectionModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [chatLogsUser, setChatLogsUser] = useState(null)
  const [taskManagementUser, setTaskManagementUser] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const usersPerPage = 20

  // Fetch subscription tiers dynamically
  const { data: tiers, isLoading: tiersLoading } = useAdminSubscriptionTiers()

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

  const handleViewChatLogs = (user) => {
    setChatLogsUser(user)
    setShowChatLogsModal(true)
  }

  const handleAddTasks = (user) => {
    setTaskManagementUser(user)
    setShowQuestSelectionModal(true)
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
    // Map tier_key values to badge colors
    const badges = {
      Explore: 'bg-gray-100 text-gray-700',       // Free tier
      Accelerate: 'bg-blue-100 text-blue-700',    // Parent Support
      Achieve: 'bg-purple-100 text-purple-700',   // Weekly Support
      Excel: 'bg-pink-100 text-pink-700'          // Daily Support
    }
    return badges[tier] || badges.Explore
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

  // Get tier display name from fetched tiers (single source of truth)
  const getTierDisplayNameFromData = (tierKey) => {
    if (!tiers) return tierKey
    const tier = tiers.find(t => t.tier_key === tierKey)
    return tier?.display_name || tierKey
  }

  if (loading) {
    return <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Manage Users</h2>
        <button
          onClick={() => setShowBulkEmailModal(true)}
          disabled={selectedUsers.size === 0}
          className={`px-4 py-2 rounded ${
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
            disabled={tiersLoading}
          >
            <option value="all">All Subscriptions</option>
            {tiers?.map((tier) => (
              <option key={tier.id} value={tier.tier_key}>
                {tier.display_name}
              </option>
            ))}
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
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getSubscriptionBadge(user.subscription_tier || 'free')}`}>
                    {getTierDisplayNameFromData(user.subscription_tier || 'Explore')}
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
                      title="Edit User Profile & Role"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleAddTasks(user)}
                      className="text-green-600 hover:text-green-900"
                      title="Add Tasks to Quest"
                    >
                      Add Tasks
                    </button>
                    <button
                      onClick={() => handleViewChatLogs(user)}
                      className="text-purple-600 hover:text-purple-900"
                      title="View Chat Logs"
                    >
                      Chats
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

      {/* Chat Logs Modal */}
      {showChatLogsModal && chatLogsUser && (
        <ChatLogsModal
          user={chatLogsUser}
          onClose={() => {
            setShowChatLogsModal(false)
            setChatLogsUser(null)
          }}
        />
      )}

      {/* Quest Selection Modal */}
      {showQuestSelectionModal && taskManagementUser && (
        <QuestSelectionModal
          student={taskManagementUser}
          onClose={() => {
            setShowQuestSelectionModal(false)
            setTaskManagementUser(null)
            fetchUsers() // Refresh to show updated task counts if needed
          }}
        />
      )}
    </div>
  )
}

export default memo(AdminUsers)