import React, { useState, useEffect, memo } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'
import AdminQuestManagerV3 from './AdminQuestManagerV3'
import SourcesManager from '../components/SourcesManager'
import QuestCreationForm from '../components/admin/QuestCreationForm'
import SiteSettings from '../components/admin/SiteSettings'
import AdminQuestSuggestions from '../components/admin/AdminQuestSuggestions'
import { getTierDisplayName } from '../utils/tierMapping'

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

const AdminQuests = () => {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showManager, setShowManager] = useState(false)
  const [editingQuest, setEditingQuest] = useState(null)
  const [collapsedQuests, setCollapsedQuests] = useState(new Set())
  const [showSourcesManager, setShowSourcesManager] = useState(false)
  const [showCreationForm, setShowCreationForm] = useState(false)
  const [activeTab, setActiveTab] = useState('quests')

  useEffect(() => {
    fetchQuests()
  }, [])

  const fetchQuests = async () => {
    try {
      const response = await api.get('/api/v3/admin/quests')
      setQuests(response.data.quests)
      // Set all quests as collapsed by default
      const allQuestIds = new Set(response.data.quests.map(quest => quest.id))
      setCollapsedQuests(allQuestIds)
    } catch (error) {
      toast.error('Failed to load quests')
    } finally {
      setLoading(false)
    }
  }

  const handleQuestSave = () => {
    setShowManager(false)
    setEditingQuest(null)
    fetchQuests()
  }

  const handleEdit = (quest) => {
    setEditingQuest(quest)
    setShowManager(true)
  }

  const handleDelete = async (questId) => {
    if (window.confirm('Are you sure you want to delete this quest?')) {
      try {
        await api.delete(`/api/v3/admin/quests/${questId}`)
        toast.success('Quest deleted successfully')
        fetchQuests()
      } catch (error) {
        toast.error('Failed to delete quest')
      }
    }
  }


  const getSkillCategoryName = (category) => {
    const categoryNames = {
      'reading_writing': 'Reading & Writing',
      'thinking_skills': 'Thinking Skills',
      'personal_growth': 'Personal Growth',
      'life_skills': 'Life Skills',
      'making_creating': 'Making & Creating',
      'world_understanding': 'World Understanding'
    }
    return categoryNames[category] || category
  }


  const toggleQuestCollapse = (questId) => {
    setCollapsedQuests(prev => {
      const newSet = new Set(prev)
      if (newSet.has(questId)) {
        newSet.delete(questId)
      } else {
        newSet.add(questId)
      }
      return newSet
    })
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Manage Quests</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (collapsedQuests.size === quests.length) {
                // All collapsed, so expand all
                setCollapsedQuests(new Set())
              } else {
                // Some or all expanded, so collapse all
                const allQuestIds = new Set(quests.map(quest => quest.id))
                setCollapsedQuests(allQuestIds)
              }
            }}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
          >
            {collapsedQuests.size === quests.length ? 'Expand All' : 'Collapse All'}
          </button>
          <button
            onClick={() => setShowCreationForm(true)}
            className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-4 py-2 rounded hover:opacity-90"
          >
            Create New Quest
          </button>
          <button
            onClick={() => setShowSourcesManager(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
          >
            Manage Source Images
          </button>
        </div>
      </div>

      {showManager && (
        <AdminQuestManagerV3
          quest={editingQuest}
          onClose={() => {
            setShowManager(false)
            setEditingQuest(null)
          }}
          onSave={handleQuestSave}
        />
      )}

      {showSourcesManager && (
        <SourcesManager
          onClose={() => setShowSourcesManager(false)}
        />
      )}

      {showCreationForm && (
        <QuestCreationForm
          onClose={() => setShowCreationForm(false)}
          onSuccess={(newQuest) => {
            fetchQuests() // Refresh quest list
            // Success toast is already shown by QuestCreationForm
          }}
        />
      )}

      {loading ? (
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
      ) : (
        <div>
          {quests.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
              <p className="text-lg">No quests found</p>
              <p className="text-sm mt-2">Create your first quest using the button above</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {quests.map(quest => {
                // Calculate total XP from tasks for V3 or fallback to old system
                const totalXP = quest.quest_tasks?.reduce((sum, task) => sum + (task.xp_amount || 0), 0) ||
                               quest.quest_skill_xp?.reduce((sum, award) => sum + award.xp_amount, 0) || 
                               quest.quest_xp_awards?.reduce((sum, award) => sum + award.xp_amount, 0) || 
                               quest.total_xp || 0;
                
                const isCollapsed = collapsedQuests.has(quest.id);
                
                return (
                  <div key={quest.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
                    {/* Header Row */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1 cursor-pointer" onClick={() => toggleQuestCollapse(quest.id)}>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">
                            {isCollapsed ? '▶' : '▼'}
                          </span>
                          <h3 className="text-lg font-semibold text-gray-900">{quest.title}</h3>
                        </div>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2 ml-6">
                          {quest.big_idea || quest.description || 'No description'}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button 
                          onClick={() => handleEdit(quest)}
                          className="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => handleDelete(quest.id)}
                          className="px-3 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Content */}
                    {!isCollapsed && (
                      <>
                    {/* Tasks Section for V3 Quests */}
                    {quest.quest_tasks && quest.quest_tasks.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-500 mb-2">TASKS ({quest.quest_tasks.length}):</p>
                        <div className="space-y-2">
                          {quest.quest_tasks
                            .sort((a, b) => (a.task_order || 0) - (b.task_order || 0))
                            .map((task, idx) => (
                            <div key={task.id || idx} className="bg-gray-50 p-3 rounded-lg">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <span className="font-medium text-sm">{idx + 1}. {task.title}</span>
                                  {task.description && (
                                    <p className="text-xs text-gray-600 mt-1">{task.description}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 ml-2">
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                    {task.xp_amount} XP
                                  </span>
                                  <span className={`text-xs px-2 py-1 rounded ${
                                    task.pillar === 'creativity' ? 'bg-purple-100 text-purple-700' :
                                    task.pillar === 'critical_thinking' ? 'bg-blue-100 text-blue-700' :
                                    task.pillar === 'practical_skills' ? 'bg-green-100 text-green-700' :
                                    task.pillar === 'communication' ? 'bg-orange-100 text-orange-700' :
                                    task.pillar === 'cultural_literacy' ? 'bg-red-100 text-red-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {task.pillar?.replace('_', ' ')}
                                  </span>
                                  {task.is_collaboration_eligible && (
                                    <span className="text-xs text-purple-600">Team-up eligible</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}


                    {/* Skills or Subjects XP */}
                    {(quest.quest_skill_xp?.length > 0 || quest.quest_xp_awards?.length > 0) && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-500 mb-2">XP AWARDS:</p>
                        <div className="flex flex-wrap gap-2">
                          {quest.quest_skill_xp?.map((award, idx) => (
                            <div key={`skill-${idx}`} className="bg-gradient-to-r from-blue-50 to-purple-50 px-3 py-1 rounded-full border border-gray-200">
                              <span className="text-xs font-medium text-gray-700">
                                {getSkillCategoryName(award.skill_category)}: 
                              </span>
                              <span className="text-xs font-bold text-primary ml-1">{award.xp_amount} XP</span>
                            </div>
                          ))}
                          {quest.quest_xp_awards?.map((award, idx) => (
                            <div key={`subject-${idx}`} className="bg-gradient-to-r from-green-50 to-blue-50 px-3 py-1 rounded-full border border-gray-200">
                              <span className="text-xs font-medium text-gray-700">
                                {award.subject?.replace(/_/g, ' ')}: 
                              </span>
                              <span className="text-xs font-bold text-primary ml-1">{award.xp_amount} XP</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Core Skills */}
                    {quest.core_skills?.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-500 mb-2">CORE SKILLS:</p>
                        <div className="flex flex-wrap gap-1">
                          {quest.core_skills.map((skill, idx) => (
                            <span key={idx} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                              {skill.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}


                    {/* Additional Info */}
                    <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-gray-500">
                      {quest.location_requirements && (
                        <div>
                          <span className="font-semibold">Location:</span> {quest.location_requirements}
                        </div>
                      )}
                      {quest.resources_needed && (
                        <div>
                          <span className="font-semibold">Resources:</span> {quest.resources_needed}
                        </div>
                      )}
                      {quest.optional_challenges?.length > 0 && (
                        <div>
                          <span className="font-semibold">Optional Challenges:</span> {quest.optional_challenges.length}
                        </div>
                      )}
                      <div>
                        <span className="font-semibold">Quest ID:</span> {quest.id.slice(0, 8)}...
                      </div>
                    </div>
                    </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

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
  const [editingUser, setEditingUser] = useState(null)
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [roleChangeUser, setRoleChangeUser] = useState(null)
  const [newRole, setNewRole] = useState('')
  const [roleChangeReason, setRoleChangeReason] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const usersPerPage = 20

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
      fetchUsers() // Refresh the user list
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
                    {(user.subscription_tier || 'free').charAt(0).toUpperCase() + (user.subscription_tier || 'free').slice(1)}
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

            {/* Role Descriptions */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs font-semibold text-gray-700 mb-1">Role Descriptions:</p>
              <ul className="text-xs text-gray-600 space-y-1">
                <li><span className="font-semibold">Student:</span> Can complete quests and build diploma</li>
                <li><span className="font-semibold">Parent:</span> Can view linked children's progress</li>
                <li><span className="font-semibold">Advisor:</span> Can manage student groups</li>
                <li><span className="font-semibold">Admin:</span> Full system access</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowRoleModal(false)
                  setRoleChangeUser(null)
                  setNewRole('')
                  setRoleChangeReason('')
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitRoleChange}
                disabled={newRole === (roleChangeUser.role || 'student')}
                className={`px-4 py-2 rounded-lg ${
                  newRole === (roleChangeUser.role || 'student')
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
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

const UserDetailsModal = ({ user, onClose, onSave }) => {
  const [activeTab, setActiveTab] = useState('profile')
  const [formData, setFormData] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    email: user.email || '',
    subscription_tier: user.subscription_tier || 'free',
    subscription_expires: user.subscription_expires || ''
  })
  const [loading, setLoading] = useState(false)
  const [userActivity, setUserActivity] = useState(null)

  useEffect(() => {
    fetchUserDetails()
  }, [user.id])

  const fetchUserDetails = async () => {
    try {
      const response = await api.get(`/api/v3/admin/users/${user.id}`)
      setUserActivity(response.data)
    } catch (error) {
      toast.error('Failed to load user details')
    }
  }

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSaveProfile = async () => {
    setLoading(true)
    try {
      await api.put(`/api/v3/admin/users/${user.id}`, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email
      })
      toast.success('Profile updated successfully')
      onSave()
    } catch (error) {
      toast.error('Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateSubscription = async () => {
    const tierDisplayNames = { 
      free: 'Free', 
      supported: 'Supported', 
      academy: 'Academy'
    };
    const displayName = tierDisplayNames[formData.subscription_tier] || formData.subscription_tier;
    if (window.confirm(`Change subscription to ${displayName}?`)) {
      setLoading(true)
      try {
        await api.post(`/api/v3/admin/users/${user.id}/subscription`, {
          tier: formData.subscription_tier,
          expires: formData.subscription_expires
        })
        toast.success('Subscription updated successfully')
        onSave()
      } catch (error) {
        toast.error('Failed to update subscription')
      } finally {
        setLoading(false)
      }
    }
  }

  const getPillarColor = (pillar) => {
    const colors = {
      creativity: 'bg-purple-100 text-purple-700',
      critical_thinking: 'bg-blue-100 text-blue-700',
      practical_skills: 'bg-green-100 text-green-700',
      communication: 'bg-orange-100 text-orange-700',
      cultural_literacy: 'bg-red-100 text-red-700'
    }
    return colors[pillar] || 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">User Details</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {['profile', 'subscription', 'activity'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 font-medium capitalize ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    User ID
                  </label>
                  <input
                    type="text"
                    value={user.id}
                    disabled
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Created At
                  </label>
                  <input
                    type="text"
                    value={new Date(user.created_at).toLocaleString()}
                    disabled
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveProfile}
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          )}

          {activeTab === 'subscription' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subscription Tier
                </label>
                <select
                  name="subscription_tier"
                  value={formData.subscription_tier}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="free">Free</option>
                  <option value="supported">Supported ($39.99/month)</option>
                  <option value="academy">Academy ($499.99/month)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subscription Expires
                </label>
                <input
                  type="datetime-local"
                  name="subscription_expires"
                  value={formData.subscription_expires}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Leave empty for free tier or lifetime access
                </p>
              </div>
              <button
                onClick={handleUpdateSubscription}
                disabled={loading}
                className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
              >
                {loading ? 'Updating...' : 'Update Subscription'}
              </button>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-6">
              {/* XP by Pillar */}
              <div>
                <h3 className="text-lg font-semibold mb-3">XP by Pillar</h3>
                {userActivity?.xp_by_pillar ? (
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(userActivity.xp_by_pillar).map(([pillar, xp]) => (
                      <div key={pillar} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className={`px-2 py-1 rounded text-sm font-medium ${getPillarColor(pillar)}`}>
                          {pillar.replace('_', ' ')}
                        </span>
                        <span className="font-bold text-gray-700">{xp} XP</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No XP data available</p>
                )}
              </div>

              {/* Recent Completed Quests */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Recent Completed Quests</h3>
                {userActivity?.completed_quests?.length > 0 ? (
                  <div className="space-y-2">
                    {userActivity.completed_quests.slice(0, 5).map((quest) => (
                      <div key={quest.id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-900">{quest.title}</p>
                            <p className="text-sm text-gray-500">
                              Completed: {new Date(quest.completed_at).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="text-sm font-bold text-green-600">
                            +{quest.xp_earned} XP
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No completed quests</p>
                )}
              </div>

              {/* Statistics */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Statistics</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Total XP</p>
                    <p className="text-xl font-bold text-gray-900">{userActivity?.total_xp || 0}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Quests Completed</p>
                    <p className="text-xl font-bold text-gray-900">{userActivity?.quests_completed || 0}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Last Active</p>
                    <p className="text-sm font-medium text-gray-900">
                      {userActivity?.last_active 
                        ? new Date(userActivity.last_active).toLocaleDateString()
                        : 'Never'}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Streak</p>
                    <p className="text-xl font-bold text-gray-900">{userActivity?.current_streak || 0} days</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const BulkEmailModal = ({ selectedUserIds, users, onClose, onSend }) => {
  const [emailData, setEmailData] = useState({
    subject: '',
    message: '',
    template: 'custom'
  })
  const [sending, setSending] = useState(false)

  const emailTemplates = {
    custom: { subject: '', message: '' },
    welcome_back: {
      subject: 'We miss you at OptioQuest!',
      message: `Hi {{first_name}},

We noticed you haven't been active recently. Your learning journey is waiting for you!

Check out our latest quests and continue building your skills.

Best regards,
The OptioQuest Team`
    },
    new_feature: {
      subject: 'Exciting New Features at OptioQuest',
      message: `Hi {{first_name}},

We've added some amazing new features to enhance your learning experience:
- New quest categories
- Improved XP tracking
- Collaboration features

Log in to explore what's new!

The OptioQuest Team`
    },
    achievement: {
      subject: 'Congratulations on Your Progress!',
      message: `Hi {{first_name}},

You're making incredible progress on your learning journey! Keep up the great work.

Your current XP: {{total_xp}}
Quests completed: {{quests_completed}}

Ready for your next challenge?

The OptioQuest Team`
    }
  }

  const handleTemplateChange = (template) => {
    setEmailData({
      ...emailData,
      template,
      subject: emailTemplates[template].subject,
      message: emailTemplates[template].message
    })
  }

  const handleSendEmails = async () => {
    if (!emailData.subject || !emailData.message) {
      toast.error('Please provide both subject and message')
      return
    }

    if (window.confirm(`Send email to ${selectedUserIds.length} users?`)) {
      setSending(true)
      try {
        await api.post('/api/v3/admin/users/bulk-email', {
          user_ids: selectedUserIds,
          subject: emailData.subject,
          message: emailData.message
        })
        toast.success(`Email sent to ${selectedUserIds.length} users`)
        onSend()
      } catch (error) {
        toast.error('Failed to send emails')
      } finally {
        setSending(false)
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">Send Bulk Email</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Recipients Preview */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-900 mb-2">
              Sending to {selectedUserIds.length} users:
            </p>
            <div className="flex flex-wrap gap-2">
              {users.slice(0, 5).map(user => (
                <span key={user.id} className="px-2 py-1 bg-white rounded text-sm">
                  {user.first_name} {user.last_name}
                </span>
              ))}
              {users.length > 5 && (
                <span className="px-2 py-1 bg-white rounded text-sm text-gray-500">
                  +{users.length - 5} more
                </span>
              )}
            </div>
          </div>

          {/* Template Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Template
            </label>
            <select
              value={emailData.template}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="custom">Custom Message</option>
              <option value="welcome_back">Welcome Back</option>
              <option value="new_feature">New Feature Announcement</option>
              <option value="achievement">Achievement Celebration</option>
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subject
            </label>
            <input
              type="text"
              value={emailData.subject}
              onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
              placeholder="Enter email subject..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              value={emailData.message}
              onChange={(e) => setEmailData({ ...emailData, message: e.target.value })}
              rows={10}
              placeholder="Enter your message..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              Available variables: {`{{first_name}}, {{last_name}}, {{email}}, {{total_xp}}`}
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSendEmails}
              disabled={sending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {sending ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const AdminPage = () => {
  const location = useLocation()
  const currentPath = location.pathname.split('/').pop()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Panel</h1>
      
      <div className="flex gap-4 mb-8 border-b">
        <Link
          to="/admin"
          className={`pb-2 px-1 ${currentPath === 'admin' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Dashboard
        </Link>
        <Link
          to="/admin/quests"
          className={`pb-2 px-1 ${currentPath === 'quests' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Quests
        </Link>
        <Link
          to="/admin/quest-suggestions"
          className={`pb-2 px-1 ${currentPath === 'quest-suggestions' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Quest Suggestions
        </Link>
        <Link
          to="/admin/settings"
          className={`pb-2 px-1 ${currentPath === 'settings' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Site Settings
        </Link>
      </div>

      <Routes>
        <Route index element={<AdminDashboard />} />
        <Route path="quests" element={<AdminQuests />} />
        <Route path="quest-suggestions" element={<AdminQuestSuggestions />} />
        <Route path="settings" element={<SiteSettings />} />
      </Routes>
    </div>
  )
}

export default memo(AdminPage)