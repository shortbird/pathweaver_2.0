import React, { useState, useEffect, Suspense, lazy } from 'react'
import api from '../../services/api'
import CreateUsernameStudentModal from './CreateUsernameStudentModal'

const BulkUserImport = lazy(() => import('../admin/BulkUserImport'))
const PendingInvitationsList = lazy(() => import('../admin/PendingInvitationsList'))

function EditUserModal({ orgId, user, onClose, onSuccess, onRemove }) {
  // For org_managed users, use org_role as the effective role
  const effectiveRole = user.role === 'org_managed' && user.org_role
    ? user.org_role
    : user.role

  const [formData, setFormData] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    email: user.email || '',
    org_role: effectiveRole || 'student'
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  // Check if this is a username-based account
  const isUsernameAccount = user.username && !user.email

  const handleRegeneratePassword = async () => {
    setResetLoading(true)
    setError('')
    setGeneratedPassword('')
    try {
      const response = await api.post(`/api/admin/organizations/${orgId}/users/${user.id}/reset-password`, {
        regenerate: true
      })
      // Show the new password from the response
      if (response.data.new_password) {
        setGeneratedPassword(response.data.new_password)
      }
    } catch (err) {
      const errorData = err.response?.data?.error || err.response?.data?.message || err.response?.data
      setError(typeof errorData === 'string' ? errorData : errorData?.message || 'Failed to reset password')
    } finally {
      setResetLoading(false)
    }
  }

  const copyPassword = () => {
    navigator.clipboard.writeText(generatedPassword)
    alert('Password copied to clipboard!')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await api.put(`/api/admin/users/${user.id}`, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email
      })

      // Use org-specific endpoint for setting org_role (org admins can use this)
      if (formData.org_role !== effectiveRole) {
        await api.put(`/api/admin/org/users/${user.id}/role`, {
          org_role: formData.org_role
        })
      }

      onSuccess()
    } catch (err) {
      const errorData = err.response?.data?.error || err.response?.data?.message || err.response?.data;
      setError(typeof errorData === 'string' ? errorData : errorData?.message || 'Failed to update user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 w-full h-full bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl p-6 w-full max-w-md my-auto">
        <h2 className="text-2xl font-bold mb-4">Edit User</h2>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">First Name</label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                placeholder="First name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Last Name</label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                placeholder="Last name"
              />
            </div>
          </div>

          {isUsernameAccount ? (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Username</label>
              <div className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-600">
                {user.username}
              </div>
              <p className="text-xs text-gray-500 mt-1">Username cannot be changed</p>
            </div>
          ) : (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                required
              />
            </div>
          )}

          {/* Password Reset Section for username-based accounts */}
          {isUsernameAccount && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">Password</label>
                {!generatedPassword && (
                  <button
                    type="button"
                    onClick={handleRegeneratePassword}
                    disabled={resetLoading}
                    className="text-xs text-optio-purple hover:underline disabled:opacity-50"
                  >
                    {resetLoading ? 'Generating...' : 'Generate New Password'}
                  </button>
                )}
              </div>
              {generatedPassword ? (
                <div className="space-y-2">
                  <div className="p-2 bg-green-50 border border-green-200 rounded text-sm">
                    <p className="text-green-700 font-medium mb-1">New password generated!</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white px-2 py-1 rounded border text-gray-900 font-mono">
                        {generatedPassword}
                      </code>
                      <button
                        type="button"
                        onClick={copyPassword}
                        className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Share this password with the student. It won't be shown again after closing this modal.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  Click "Generate New Password" to create a new simple password for this student.
                </p>
              )}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Organization Role</label>
            <select
              value={formData.org_role}
              onChange={(e) => setFormData({ ...formData, org_role: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
            >
              <option value="student">Student</option>
              <option value="parent">Parent</option>
              <option value="advisor">Advisor</option>
              <option value="observer">Observer</option>
              <option value="org_admin">Organization Admin</option>
            </select>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => {
                const name = user.display_name || (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name || user.last_name) || user.email
                if (confirm(`Remove ${name} from this organization?`)) {
                  onRemove()
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-full text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Remove
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function UsersTab({ orgId, orgSlug, users, onUpdate }) {
  const [showEditModal, setShowEditModal] = useState(false)
  const [showCreateUsernameModal, setShowCreateUsernameModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [userSubTab, setUserSubTab] = useState('list')
  const [selectedUsers, setSelectedUsers] = useState(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const usersPerPage = 25

  const handleRemoveUser = async (userId) => {
    try {
      await api.post(`/api/admin/organizations/${orgId}/users/remove`, {
        user_id: userId
      })
      onUpdate()
    } catch (error) {
      console.error('Failed to remove user:', error)
      alert(error.response?.data?.error || 'Failed to remove user')
    }
  }

  const handleBulkRemove = async () => {
    if (selectedUsers.size === 0) return
    if (!confirm(`Remove ${selectedUsers.size} user(s) from this organization?`)) return

    setBulkActionLoading(true)
    try {
      const response = await api.post(`/api/admin/organizations/${orgId}/users/bulk-remove`, {
        user_ids: Array.from(selectedUsers)
      })
      const { removed, failed } = response.data
      alert(`Removed ${removed} user(s)${failed > 0 ? `, ${failed} failed` : ''}`)
      setSelectedUsers(new Set())
      onUpdate()
    } catch (error) {
      console.error('Failed to bulk remove users:', error)
      alert(error.response?.data?.error || 'Failed to remove users')
    } finally {
      setBulkActionLoading(false)
    }
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

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase()
    const fullName = user.display_name || `${user.first_name || ''} ${user.last_name || ''}`.trim()
    const matchesSearch = (
      fullName.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower)
    )
    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    return matchesSearch && matchesRole
  })

  const totalPages = Math.ceil(filteredUsers.length / usersPerPage)
  const startIndex = (currentPage - 1) * usersPerPage
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + usersPerPage)

  const selectAllVisible = () => {
    if (selectedUsers.size === paginatedUsers.length) {
      setSelectedUsers(new Set())
    } else {
      setSelectedUsers(new Set(paginatedUsers.map(u => u.id)))
    }
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, roleFilter])

  return (
    <div className="space-y-4">
      {/* Subtab Navigation */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setUserSubTab('list')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            userSubTab === 'list'
              ? 'bg-white border border-b-white border-gray-200 -mb-[3px] text-optio-purple'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          User List
        </button>
        <button
          onClick={() => setUserSubTab('invite')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            userSubTab === 'invite'
              ? 'bg-white border border-b-white border-gray-200 -mb-[3px] text-optio-purple'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Invite Users
        </button>
        <button
          onClick={() => setUserSubTab('import')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            userSubTab === 'import'
              ? 'bg-white border border-b-white border-gray-200 -mb-[3px] text-optio-purple'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Bulk Import
        </button>
      </div>

      {userSubTab === 'invite' ? (
        <Suspense fallback={
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
          </div>
        }>
          <PendingInvitationsList
            organizationId={orgId}
            onUpdate={() => onUpdate()}
          />
        </Suspense>
      ) : userSubTab === 'import' ? (
        <Suspense fallback={
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
          </div>
        }>
          <BulkUserImport
            organizationId={orgId}
            onImportComplete={() => onUpdate()}
          />
        </Suspense>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-4 justify-between items-center">
            <h2 className="text-xl font-bold">Organization Users ({filteredUsers.length})</h2>
            <div className="flex gap-3 items-center flex-wrap">
              <button
                onClick={() => setShowCreateUsernameModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-medium rounded-lg hover:opacity-90 inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Create Student (No Email)
              </button>
              {selectedUsers.size > 0 && (
                <button
                  onClick={handleBulkRemove}
                  disabled={bulkActionLoading}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {bulkActionLoading ? 'Removing...' : `Remove ${selectedUsers.size} Selected`}
                </button>
              )}
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border border-gray-200 rounded-lg px-4 py-2 w-64 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              >
                <option value="all">All Roles</option>
                <option value="student">Student</option>
                <option value="parent">Parent</option>
                <option value="advisor">Advisor</option>
                <option value="org_admin">Org Admin</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-4 text-left">
                    <input
                      type="checkbox"
                      checked={selectedUsers.size === paginatedUsers.length && paginatedUsers.length > 0}
                      onChange={selectAllVisible}
                      className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                    />
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      {searchTerm ? 'No users match your search' : 'No users in this organization'}
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map(user => (
                    <tr key={user.id} className={`hover:bg-gray-50 ${selectedUsers.has(user.id) ? 'bg-optio-purple/5' : ''}`}>
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedUsers.has(user.id)}
                          onChange={() => toggleUserSelection(user.id)}
                          className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                        />
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          const name = user.display_name || (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name || user.last_name)
                          return name ? (
                            <span className="text-gray-900">{name}</span>
                          ) : (
                            <span className="text-gray-400 italic">No name set</span>
                          )
                        })()}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {user.email ? (
                          user.email
                        ) : user.username ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">username</span>
                            {user.username}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">No email</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          // In org context, always show org_role (never show "org_managed")
                          const displayRole = user.org_role || user.role;
                          const roleColors = {
                            superadmin: 'bg-purple-100 text-purple-700',
                            org_admin: 'bg-purple-100 text-purple-700',
                            advisor: 'bg-blue-100 text-blue-700',
                            parent: 'bg-green-100 text-green-700',
                            observer: 'bg-yellow-100 text-yellow-700',
                            student: 'bg-gray-100 text-gray-700'
                          };
                          const roleDisplayNames = {
                            superadmin: 'Superadmin',
                            org_admin: 'Org Admin',
                            advisor: 'Advisor',
                            parent: 'Parent',
                            observer: 'Observer',
                            student: 'Student'
                          };
                          return (
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                              roleColors[displayRole] || 'bg-gray-100 text-gray-700'
                            }`}>
                              {roleDisplayNames[displayRole] || displayRole}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedUser(user)
                            setShowEditModal(true)
                          }}
                          className="text-optio-purple hover:underline text-sm font-medium"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {startIndex + 1} to {Math.min(startIndex + usersPerPage, filteredUsers.length)} of {filteredUsers.length} users
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
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
                      onClick={() => setCurrentPage(pageNum)}
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
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {showEditModal && selectedUser && (
            <EditUserModal
              orgId={orgId}
              user={selectedUser}
              onClose={() => {
                setShowEditModal(false)
                setSelectedUser(null)
              }}
              onSuccess={() => {
                setShowEditModal(false)
                setSelectedUser(null)
                onUpdate()
              }}
              onRemove={() => {
                handleRemoveUser(selectedUser.id)
                setShowEditModal(false)
                setSelectedUser(null)
              }}
            />
          )}

          {showCreateUsernameModal && (
            <CreateUsernameStudentModal
              orgId={orgId}
              orgSlug={orgSlug}
              onClose={() => setShowCreateUsernameModal(false)}
              onSuccess={() => onUpdate()}
            />
          )}
        </>
      )}
    </div>
  )
}
