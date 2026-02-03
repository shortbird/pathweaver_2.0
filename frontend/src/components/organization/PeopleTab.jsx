import React, { useState, useEffect, Suspense, lazy } from 'react'
import { createPortal } from 'react-dom'
import api from '../../services/api'
import toast from 'react-hot-toast'
import CreateUsernameStudentModal from './CreateUsernameStudentModal'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  UserPlusIcon,
  UsersIcon,
  CheckCircleIcon,
  XMarkIcon,
  EnvelopeIcon,
  LinkIcon,
  EyeIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline'

const BulkUserImport = lazy(() => import('../admin/BulkUserImport'))
const InviteUserModal = lazy(() => import('../admin/InviteUserModal'))

const VALID_ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'parent', label: 'Parent' },
  { value: 'advisor', label: 'Advisor' },
  { value: 'org_admin', label: 'Organization Admin' },
  { value: 'observer', label: 'Observer' }
]

// Modal Component
const Modal = ({ title, children, onClose, onConfirm, confirmText, confirmClass }) => {
  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
        {onConfirm && (
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium">
              Cancel
            </button>
            <button onClick={onConfirm} className={`px-4 py-2 text-white rounded-lg transition-colors font-semibold ${confirmClass}`}>
              {confirmText}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

// Edit User Modal
function EditUserModal({ orgId, user, onClose, onSuccess, onRemove }) {
  const getEffectiveRoles = () => {
    if (user.role !== 'org_managed') return [user.role]
    if (user.org_roles && Array.isArray(user.org_roles) && user.org_roles.length > 0) {
      return user.org_roles
    }
    if (user.org_role) return [user.org_role]
    return ['student']
  }

  const [formData, setFormData] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    email: user.email || '',
    org_roles: getEffectiveRoles()
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  const isUsernameAccount = user.username && !user.email

  const handleRegeneratePassword = async () => {
    setResetLoading(true)
    setError('')
    setGeneratedPassword('')
    try {
      const response = await api.post(`/api/admin/organizations/${orgId}/users/${user.id}/reset-password`, {
        regenerate: true
      })
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
    toast.success('Password copied to clipboard!')
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

      const originalRoles = getEffectiveRoles()
      const rolesChanged = JSON.stringify(formData.org_roles.sort()) !== JSON.stringify(originalRoles.sort())

      if (rolesChanged) {
        await api.put(`/api/admin/org/users/${user.id}/role`, {
          org_roles: formData.org_roles
        })
      }

      onSuccess()
    } catch (err) {
      const errorData = err.response?.data?.error || err.response?.data?.message || err.response?.data
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
            <label className="block text-sm font-medium mb-2">Organization Role(s)</label>
            <p className="text-xs text-gray-500 mb-2">Users can have multiple roles (e.g., Parent + Advisor)</p>
            <div className="space-y-2 border border-gray-200 rounded-lg p-3">
              {[
                { value: 'student', label: 'Student' },
                { value: 'parent', label: 'Parent' },
                { value: 'advisor', label: 'Advisor' },
                { value: 'observer', label: 'Observer' },
                { value: 'org_admin', label: 'Organization Admin' }
              ].map(role => (
                <label key={role.value} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                  <input
                    type="checkbox"
                    checked={formData.org_roles.includes(role.value)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        if (!formData.org_roles.includes(role.value)) {
                          setFormData({ ...formData, org_roles: [...formData.org_roles, role.value] })
                        }
                      } else {
                        const newRoles = formData.org_roles.filter(r => r !== role.value)
                        if (newRoles.length > 0) {
                          setFormData({ ...formData, org_roles: newRoles })
                        }
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                  />
                  <span className="text-sm">{role.label}</span>
                </label>
              ))}
            </div>
            {formData.org_roles.length === 0 && (
              <p className="text-xs text-red-600 mt-1">At least one role is required</p>
            )}
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
              <TrashIcon className="w-4 h-4" />
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

export default function PeopleTab({ orgId, orgSlug, users, onUpdate }) {
  // User list state
  const [showEditModal, setShowEditModal] = useState(false)
  const [showCreateUsernameModal, setShowCreateUsernameModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedUsers, setSelectedUsers] = useState(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const usersPerPage = 25

  // Quick actions dropdown
  const [showActionsDropdown, setShowActionsDropdown] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showBulkImportModal, setShowBulkImportModal] = useState(false)

  // Invitation links state
  const [invitationLinks, setInvitationLinks] = useState([])
  const [linksLoading, setLinksLoading] = useState(true)
  const [generating, setGenerating] = useState(null)
  const [copiedLinkId, setCopiedLinkId] = useState(null)
  const [showInvitationLinks, setShowInvitationLinks] = useState(true)

  // Pending invitations state
  const [pendingInvitations, setPendingInvitations] = useState([])
  const [pendingLoading, setPendingLoading] = useState(true)
  const [showPendingInvitations, setShowPendingInvitations] = useState(false)

  // Relationships state
  const [showRelationships, setShowRelationships] = useState(false)
  const [relationshipView, setRelationshipView] = useState('advisors') // 'advisors' | 'parents'
  const [loading, setLoading] = useState(false)

  // Advisor-Student state
  const [advisors, setAdvisors] = useState([])
  const [selectedAdvisor, setSelectedAdvisor] = useState(null)
  const [assignedStudents, setAssignedStudents] = useState([])
  const [unassignedStudents, setUnassignedStudents] = useState([])
  const [allStudentsWithAdvisors, setAllStudentsWithAdvisors] = useState([])
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignLoading, setAssignLoading] = useState(false)
  const [expandedAdvisorId, setExpandedAdvisorId] = useState(null)
  const [selectedStudentsForAdvisor, setSelectedStudentsForAdvisor] = useState([])
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false)

  // Parent-Student state
  const [parentLinks, setParentLinks] = useState([])
  const [parents, setParents] = useState([])
  const [students, setStudents] = useState([])
  const [showAddConnectionModal, setShowAddConnectionModal] = useState(false)
  const [selectedParent, setSelectedParent] = useState(null)
  const [selectedStudentIds, setSelectedStudentIds] = useState([])
  const [adminNotes, setAdminNotes] = useState('')
  const [addConnectionLoading, setAddConnectionLoading] = useState(false)
  const [connectionMode, setConnectionMode] = useState('existing')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)

  useEffect(() => {
    fetchInvitationLinks()
    fetchPendingInvitations()
  }, [orgId])

  // Fetch invitation links
  const fetchInvitationLinks = async () => {
    try {
      setLinksLoading(true)
      const response = await api.get(`/api/admin/organizations/${orgId}/invitations?status=pending`)
      const linkInvites = (response.data.invitations || []).filter(
        inv => inv.email?.startsWith('link-invite-') && inv.email?.endsWith('@pending.optio.local')
      )
      setInvitationLinks(linkInvites)
    } catch (err) {
      console.error('Failed to fetch invitation links:', err)
    } finally {
      setLinksLoading(false)
    }
  }

  // Fetch pending email invitations
  const fetchPendingInvitations = async () => {
    try {
      setPendingLoading(true)
      const response = await api.get(`/api/admin/organizations/${orgId}/invitations?status=pending`)
      const emailInvitations = (response.data.invitations || []).filter(
        inv => !(inv.email?.startsWith('link-invite-') && inv.email?.endsWith('@pending.optio.local'))
      )
      setPendingInvitations(emailInvitations)
    } catch (err) {
      console.error('Failed to fetch pending invitations:', err)
    } finally {
      setPendingLoading(false)
    }
  }

  const handleGenerateLink = async (role) => {
    setGenerating(role)
    try {
      const existingForRole = invitationLinks.find(l => l.role === role)
      if (existingForRole) {
        try {
          await api.delete(`/api/admin/organizations/${orgId}/invitations/${existingForRole.id}`)
        } catch (e) {
          console.warn('Failed to cancel old link:', e)
        }
      }
      await api.post(`/api/admin/organizations/${orgId}/invitations/link`, { role })
      await fetchInvitationLinks()
    } catch (err) {
      console.error('Failed to generate link:', err)
      toast.error(err.response?.data?.error || 'Failed to generate link')
    } finally {
      setGenerating(null)
    }
  }

  const handleCopyLink = async (code, id) => {
    const link = `${window.location.origin}/invitation/${code}`
    await navigator.clipboard.writeText(link)
    setCopiedLinkId(id)
    toast.success('Link copied to clipboard!')
    setTimeout(() => setCopiedLinkId(null), 2000)
  }

  const formatExpiration = (isoDate) => {
    const date = new Date(isoDate)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const getLinkForRole = (role) => invitationLinks.find(l => l.role === role)

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'org_admin': return 'bg-purple-100 text-purple-700'
      case 'advisor': return 'bg-blue-100 text-blue-700'
      case 'parent': return 'bg-green-100 text-green-700'
      case 'observer': return 'bg-yellow-100 text-yellow-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  // User management functions
  const handleRemoveUser = async (userId) => {
    try {
      await api.post(`/api/admin/organizations/${orgId}/users/remove`, {
        user_id: userId
      })
      onUpdate()
    } catch (error) {
      console.error('Failed to remove user:', error)
      toast.error(error.response?.data?.error || 'Failed to remove user')
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
      toast.success(`Removed ${removed} user(s)${failed > 0 ? `, ${failed} failed` : ''}`)
      setSelectedUsers(new Set())
      onUpdate()
    } catch (error) {
      console.error('Failed to bulk remove users:', error)
      toast.error(error.response?.data?.error || 'Failed to remove users')
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

  // Load relationships data when expanded
  useEffect(() => {
    if (showRelationships) {
      loadRelationshipsData()
    }
  }, [showRelationships, orgId])

  const loadRelationshipsData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchAdvisors(),
        fetchUnassignedStudents(),
        fetchAllStudentsWithAdvisors(),
        loadParentLinks(),
        loadParentsAndStudents()
      ])
    } catch (error) {
      console.error('Error loading relationships data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Advisor functions
  const fetchAdvisors = async () => {
    try {
      const response = await api.get(`/api/admin/organizations/${orgId}/advisors`)
      setAdvisors(response.data.advisors || [])
    } catch (error) {
      console.error('Error fetching advisors:', error)
    }
  }

  const fetchUnassignedStudents = async () => {
    try {
      const response = await api.get(`/api/admin/organizations/${orgId}/students/unassigned`)
      setUnassignedStudents(response.data.students || [])
    } catch (error) {
      console.error('Error fetching unassigned students:', error)
    }
  }

  const fetchAllStudentsWithAdvisors = async () => {
    try {
      const response = await api.get(`/api/admin/organizations/${orgId}/students/advisor-assignments`)
      setAllStudentsWithAdvisors(response.data.students || [])
    } catch (error) {
      console.error('Error fetching students with advisors:', error)
    }
  }

  const fetchAdvisorStudents = async (advisorId) => {
    try {
      const response = await api.get(`/api/admin/organizations/${orgId}/advisors/${advisorId}/students`)
      setAssignedStudents(response.data.students || [])
    } catch (error) {
      toast.error('Failed to load assigned students')
      console.error('Error fetching advisor students:', error)
    }
  }

  const handleSelectAdvisor = (advisor) => {
    setSelectedAdvisor(advisor)
    fetchAdvisorStudents(advisor.id)
    setExpandedAdvisorId(advisor.id)
  }

  const toggleStudentForAdvisor = (studentId) => {
    setSelectedStudentsForAdvisor(prev => {
      if (prev.includes(studentId)) {
        return prev.filter(id => id !== studentId)
      } else {
        return [...prev, studentId]
      }
    })
  }

  const handleAssignStudents = async () => {
    if (!selectedAdvisor || selectedStudentsForAdvisor.length === 0) return

    setAssignLoading(true)
    try {
      await Promise.all(
        selectedStudentsForAdvisor.map(studentId =>
          api.post(`/api/admin/organizations/${orgId}/advisors/${selectedAdvisor.id}/students`, {
            student_id: studentId
          })
        )
      )

      const count = selectedStudentsForAdvisor.length
      toast.success(`${count} student${count > 1 ? 's' : ''} assigned successfully`)

      fetchAdvisorStudents(selectedAdvisor.id)
      fetchUnassignedStudents()
      fetchAllStudentsWithAdvisors()
      fetchAdvisors()
      setShowAssignModal(false)
      setSelectedStudentsForAdvisor([])
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to assign students'
      toast.error(errorMessage)
    } finally {
      setAssignLoading(false)
    }
  }

  const handleUnassignStudent = async (studentId) => {
    if (!selectedAdvisor) return
    if (!window.confirm('Are you sure you want to unassign this student?')) return

    try {
      await api.delete(`/api/admin/organizations/${orgId}/advisors/${selectedAdvisor.id}/students/${studentId}`)
      toast.success('Student unassigned successfully')

      fetchAdvisorStudents(selectedAdvisor.id)
      fetchUnassignedStudents()
      fetchAllStudentsWithAdvisors()
      fetchAdvisors()
    } catch (error) {
      toast.error('Failed to unassign student')
      console.error('Error unassigning student:', error)
    }
  }

  // Parent functions
  const loadParentLinks = async () => {
    try {
      const response = await api.get(`/api/admin/organizations/${orgId}/parent-connections/links`)
      setParentLinks(response.data.links || [])
    } catch (error) {
      console.error('Error loading parent links:', error)
    }
  }

  const loadParentsAndStudents = async () => {
    try {
      const [parentsResponse, studentsResponse] = await Promise.all([
        api.get(`/api/admin/organizations/${orgId}/users?role=parent&per_page=100`),
        api.get(`/api/admin/organizations/${orgId}/users?role=student&per_page=100`)
      ])
      setParents(parentsResponse.data.users || [])
      setStudents(studentsResponse.data.users || [])
    } catch (error) {
      console.error('Error loading parents and students:', error)
    }
  }

  const handleAddConnection = async () => {
    if (!selectedParent || selectedStudentIds.length === 0) {
      toast.error('Please select a parent and at least one student')
      return
    }

    setAddConnectionLoading(true)
    try {
      await Promise.all(
        selectedStudentIds.map(studentId =>
          api.post(`/api/admin/organizations/${orgId}/parent-connections/manual-link`, {
            parent_user_id: selectedParent.id,
            student_user_id: studentId,
            admin_notes: adminNotes
          })
        )
      )

      const studentCount = selectedStudentIds.length
      toast.success(`Successfully added ${studentCount} student${studentCount > 1 ? 's' : ''} to parent`)
      setShowAddConnectionModal(false)
      setSelectedParent(null)
      setSelectedStudentIds([])
      setAdminNotes('')
      loadParentLinks()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create connection')
    } finally {
      setAddConnectionLoading(false)
    }
  }

  const handleInviteParent = async () => {
    if (!inviteEmail || selectedStudentIds.length === 0) {
      toast.error('Please enter an email and select at least one student')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(inviteEmail)) {
      toast.error('Please enter a valid email address')
      return
    }

    setInviteLoading(true)
    try {
      const response = await api.post(`/api/admin/organizations/${orgId}/invitations/parent`, {
        email: inviteEmail,
        name: inviteName,
        student_ids: selectedStudentIds,
        send_email: true
      })

      if (response.data.success) {
        if (response.data.existing_user && response.data.user_added) {
          toast.success(response.data.message || 'Parent has been added to your organization and connected to their student(s).')
          loadParentLinks()
        } else {
          const studentCount = selectedStudentIds.length
          toast.success(`Invitation sent to ${inviteEmail}! They will be connected to ${studentCount} student${studentCount > 1 ? 's' : ''} upon registration.`)
        }
        setShowAddConnectionModal(false)
        resetModalState()
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send invitation')
    } finally {
      setInviteLoading(false)
    }
  }

  const resetModalState = () => {
    setConnectionMode('existing')
    setSelectedParent(null)
    setSelectedStudentIds([])
    setAdminNotes('')
    setInviteEmail('')
    setInviteName('')
  }

  const handleDisconnectParentLink = async (linkId) => {
    if (!confirm('Disconnect this parent-student link?')) return
    try {
      await api.delete(`/api/admin/organizations/${orgId}/parent-connections/links/${linkId}`)
      toast.success('Connection disconnected')
      loadParentLinks()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to disconnect')
    }
  }

  const toggleStudentSelection = (studentId) => {
    setSelectedStudentIds(prev => {
      if (prev.includes(studentId)) {
        return prev.filter(id => id !== studentId)
      } else {
        return [...prev, studentId]
      }
    })
  }

  // Get students to show in assign modal
  const getStudentsForAssignModal = () => {
    if (showUnassignedOnly) {
      return unassignedStudents.filter(student => {
        const searchLower = searchTerm.toLowerCase()
        const displayName = student.display_name || ''
        const email = student.email || ''
        const firstName = student.first_name || ''
        const lastName = student.last_name || ''
        return (
          displayName.toLowerCase().includes(searchLower) ||
          email.toLowerCase().includes(searchLower) ||
          firstName.toLowerCase().includes(searchLower) ||
          lastName.toLowerCase().includes(searchLower)
        )
      })
    }
    const alreadyAssignedToThisAdvisor = assignedStudents.map(s => s.id)
    return allStudentsWithAdvisors.filter(student => {
      if (alreadyAssignedToThisAdvisor.includes(student.id)) return false
      const searchLower = searchTerm.toLowerCase()
      const displayName = student.display_name || ''
      const email = student.email || ''
      const firstName = student.first_name || ''
      const lastName = student.last_name || ''
      return (
        displayName.toLowerCase().includes(searchLower) ||
        email.toLowerCase().includes(searchLower) ||
        firstName.toLowerCase().includes(searchLower) ||
        lastName.toLowerCase().includes(searchLower)
      )
    })
  }

  return (
    <div className="space-y-4">
      {/* Quick Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search members..."
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
            <option value="observer">Observer</option>
          </select>
        </div>

        <div className="flex items-center gap-2 relative">
          {selectedUsers.size > 0 && (
            <button
              onClick={handleBulkRemove}
              disabled={bulkActionLoading}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {bulkActionLoading ? 'Removing...' : `Remove ${selectedUsers.size} Selected`}
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setShowActionsDropdown(!showActionsDropdown)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90"
            >
              <UserPlusIcon className="w-5 h-5" />
              Add User
              <ChevronDownIcon className="w-4 h-4" />
            </button>

            {showActionsDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowActionsDropdown(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  <button
                    onClick={() => {
                      setShowActionsDropdown(false)
                      setShowInviteModal(true)
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <EnvelopeIcon className="w-4 h-4" />
                    Invite by Email
                  </button>
                  <button
                    onClick={() => {
                      setShowActionsDropdown(false)
                      setShowCreateUsernameModal(true)
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <UserPlusIcon className="w-4 h-4" />
                    Create Student (No Email)
                  </button>
                  <button
                    onClick={() => {
                      setShowActionsDropdown(false)
                      setShowBulkImportModal(true)
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <UsersIcon className="w-4 h-4" />
                    Bulk Import CSV
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Two Column Layout: Invitation Links and Pending Invitations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Invitation Links - Collapsible */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <button
            onClick={() => setShowInvitationLinks(!showInvitationLinks)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <LinkIcon className="w-5 h-5 text-optio-purple" />
              <span className="font-semibold text-gray-900">Invitation Links</span>
            </div>
            <ChevronRightIcon className={`w-5 h-5 text-gray-400 transition-transform ${showInvitationLinks ? 'rotate-90' : ''}`} />
          </button>

          {showInvitationLinks && (
            <div className="px-6 pb-4 border-t border-gray-100">
              {linksLoading ? (
                <div className="py-4 text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple mx-auto"></div>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {VALID_ROLES.map(({ value: role, label }) => {
                    const existingLink = getLinkForRole(role)
                    const isGenerating = generating === role

                    return (
                      <div key={role} className="flex items-center justify-between py-3 gap-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium min-w-[90px] justify-center ${getRoleBadgeClass(role)}`}>
                          {label}
                        </span>

                        {existingLink ? (
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-xs text-gray-400 truncate flex-1 font-mono">
                              .../{existingLink.invitation_code.slice(0, 12)}...
                            </span>
                            <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:inline">
                              exp {formatExpiration(existingLink.expires_at)}
                            </span>
                            <button
                              onClick={() => handleCopyLink(existingLink.invitation_code, existingLink.id)}
                              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                copiedLinkId === existingLink.id
                                  ? 'bg-green-100 text-green-700'
                                  : 'text-optio-purple hover:bg-optio-purple/10'
                              }`}
                            >
                              {copiedLinkId === existingLink.id ? 'Copied!' : 'Copy'}
                            </button>
                            <button
                              onClick={() => handleGenerateLink(role)}
                              disabled={isGenerating}
                              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                              title="Refresh link"
                            >
                              {isGenerating ? '...' : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              )}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleGenerateLink(role)}
                            disabled={isGenerating}
                            className="text-xs text-gray-500 hover:text-optio-purple disabled:opacity-50 transition-colors"
                          >
                            {isGenerating ? 'Generating...' : '+ Generate'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pending Invitations - Collapsible */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <button
            onClick={() => setShowPendingInvitations(!showPendingInvitations)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <EnvelopeIcon className="w-5 h-5 text-optio-purple" />
              <span className="font-semibold text-gray-900">Pending Invitations</span>
              {pendingInvitations.length > 0 && (
                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                  {pendingInvitations.length}
                </span>
              )}
            </div>
            <ChevronRightIcon className={`w-5 h-5 text-gray-400 transition-transform ${showPendingInvitations ? 'rotate-90' : ''}`} />
          </button>

          {showPendingInvitations && (
            <div className="px-6 pb-4 border-t border-gray-100">
              {pendingLoading ? (
                <div className="py-4 text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple mx-auto"></div>
                </div>
              ) : pendingInvitations.length === 0 ? (
                <p className="py-4 text-sm text-gray-500 text-center">No pending invitations</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {pendingInvitations.map(inv => (
                    <div key={inv.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{inv.email}</p>
                        <p className="text-xs text-gray-500">
                          {inv.invited_name && `${inv.invited_name} - `}
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${getRoleBadgeClass(inv.role)}`}>
                            {inv.role === 'org_admin' ? 'Org Admin' : inv.role}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          Expires {formatExpiration(inv.expires_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Relationships - Collapsible */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <button
          onClick={() => setShowRelationships(!showRelationships)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <UsersIcon className="w-5 h-5 text-optio-purple" />
            <span className="font-semibold text-gray-900">Relationships</span>
            <span className="text-sm text-gray-500">Advisor-Student and Parent-Student connections</span>
          </div>
          <ChevronRightIcon className={`w-5 h-5 text-gray-400 transition-transform ${showRelationships ? 'rotate-90' : ''}`} />
        </button>

        {showRelationships && (
          <div className="px-6 pb-6 border-t border-gray-100">
            {loading ? (
              <div className="py-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple mx-auto"></div>
              </div>
            ) : (
              <>
                {/* Relationship Type Toggle */}
                <div className="flex gap-2 py-4">
                  <button
                    onClick={() => setRelationshipView('advisors')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      relationshipView === 'advisors'
                        ? 'bg-optio-purple text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Advisors ({advisors.length})
                  </button>
                  <button
                    onClick={() => setRelationshipView('parents')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      relationshipView === 'parents'
                        ? 'bg-optio-purple text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Parents ({parentLinks.length})
                  </button>
                </div>

                {relationshipView === 'advisors' ? (
                  /* Advisor-Student Connections */
                  <div className="space-y-3">
                    {advisors.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                        <UsersIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>No advisors found in this organization</p>
                        <p className="text-sm mt-1">Invite users with the "advisor" role first</p>
                      </div>
                    ) : (
                      advisors.map(advisor => (
                        <div key={advisor.id} className="border border-gray-200 rounded-lg overflow-hidden">
                          <button
                            onClick={() => handleSelectAdvisor(advisor)}
                            className="w-full p-4 text-left flex justify-between items-center bg-gray-50 hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-gray-900">
                                  {advisor.display_name || `${advisor.first_name} ${advisor.last_name}`}
                                </p>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  advisor.role === 'org_admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {advisor.role === 'org_admin' ? 'Admin' : 'Advisor'}
                                </span>
                              </div>
                              <p className="text-sm text-gray-500">{advisor.email}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-sm font-medium text-optio-purple">
                                {advisor.assigned_students_count || 0} students
                              </span>
                              {expandedAdvisorId === advisor.id ? (
                                <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                              ) : (
                                <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                              )}
                            </div>
                          </button>

                          {expandedAdvisorId === advisor.id && selectedAdvisor?.id === advisor.id && (
                            <div className="p-4 bg-white border-t border-gray-200">
                              <div className="flex justify-between items-center mb-4">
                                <h4 className="font-semibold text-gray-900">
                                  Assigned Students ({assignedStudents.length})
                                </h4>
                                <button
                                  onClick={() => setShowAssignModal(true)}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium text-sm"
                                >
                                  <UserPlusIcon className="w-4 h-4" />
                                  Assign
                                </button>
                              </div>

                              {assignedStudents.length === 0 ? (
                                <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg">
                                  <p>No students assigned yet</p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {assignedStudents.map(student => (
                                    <div key={student.id} className="p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1 min-w-0">
                                          <p className="font-medium text-gray-900 text-sm truncate">
                                            {student.display_name || `${student.first_name} ${student.last_name}`}
                                          </p>
                                          <p className="text-xs text-gray-500 truncate">{student.email}</p>
                                        </div>
                                        <button
                                          onClick={() => handleUnassignStudent(student.id)}
                                          className="ml-2 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  /* Parent-Student Connections */
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <button
                        onClick={() => setShowAddConnectionModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium text-sm"
                      >
                        <UserPlusIcon className="w-4 h-4" />
                        Add Connection
                      </button>
                    </div>

                    {parentLinks.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                        <UserPlusIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>No parent-student connections</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Parent</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Student</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Connected</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {parentLinks.map((link) => (
                              <tr key={link.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <p className="text-sm font-medium text-gray-900">
                                    {link.parent?.first_name} {link.parent?.last_name}
                                  </p>
                                  <p className="text-xs text-gray-500">{link.parent?.email}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <p className="text-sm font-medium text-gray-900">
                                    {link.student?.first_name} {link.student?.last_name}
                                  </p>
                                  <p className="text-xs text-gray-500">{link.student?.email}</p>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500">
                                  {new Date(link.created_at).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    onClick={() => handleDisconnectParentLink(link.id)}
                                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                                  >
                                    Disconnect
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Members Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Members ({filteredUsers.length})</h2>
        </div>
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
                      const roleColors = {
                        superadmin: 'bg-purple-100 text-purple-700',
                        org_admin: 'bg-purple-100 text-purple-700',
                        advisor: 'bg-blue-100 text-blue-700',
                        parent: 'bg-green-100 text-green-700',
                        observer: 'bg-yellow-100 text-yellow-700',
                        student: 'bg-gray-100 text-gray-700'
                      }
                      const roleDisplayNames = {
                        superadmin: 'Superadmin',
                        org_admin: 'Org Admin',
                        advisor: 'Advisor',
                        parent: 'Parent',
                        observer: 'Observer',
                        student: 'Student'
                      }

                      let displayRoles = []
                      if (user.org_roles && Array.isArray(user.org_roles) && user.org_roles.length > 0) {
                        displayRoles = user.org_roles
                      } else if (user.org_role) {
                        displayRoles = [user.org_role]
                      } else if (user.role && user.role !== 'org_managed') {
                        displayRoles = [user.role]
                      } else {
                        displayRoles = ['student']
                      }

                      return (
                        <div className="flex flex-wrap gap-1">
                          {displayRoles.map(role => (
                            <span
                              key={role}
                              className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                                roleColors[role] || 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {roleDisplayNames[role] || role}
                            </span>
                          ))}
                        </div>
                      )
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
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
      </div>

      {/* Modals */}
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

      {showInviteModal && (
        <Suspense fallback={
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        }>
          <InviteUserModal
            organizationId={orgId}
            onClose={() => setShowInviteModal(false)}
            onSuccess={() => {
              fetchPendingInvitations()
              onUpdate()
            }}
          />
        </Suspense>
      )}

      {showBulkImportModal && (
        <Modal
          title="Bulk Import Users"
          onClose={() => setShowBulkImportModal(false)}
        >
          <div className="p-6">
            <Suspense fallback={
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
              </div>
            }>
              <BulkUserImport
                organizationId={orgId}
                onImportComplete={() => {
                  setShowBulkImportModal(false)
                  onUpdate()
                }}
              />
            </Suspense>
          </div>
        </Modal>
      )}

      {/* Assign Students Modal */}
      {showAssignModal && (
        <Modal
          title={`Assign Students to ${selectedAdvisor?.display_name || selectedAdvisor?.first_name}`}
          onClose={() => {
            setShowAssignModal(false)
            setSelectedStudentsForAdvisor([])
            setShowUnassignedOnly(false)
          }}
        >
          <div className="px-6 py-4 border-b">
            <div className="relative mb-3">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search students by name or email..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUnassignedOnly}
                  onChange={(e) => setShowUnassignedOnly(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-optio-purple"></div>
              </label>
              <span className="text-sm text-gray-600">
                {showUnassignedOnly ? 'Show unassigned only' : 'Show all students'}
              </span>
            </div>
            {selectedStudentsForAdvisor.length > 0 && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900 mb-2">
                  {selectedStudentsForAdvisor.length} student{selectedStudentsForAdvisor.length > 1 ? 's' : ''} selected
                </p>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 max-h-96">
            {getStudentsForAssignModal().length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>{showUnassignedOnly ? 'No unassigned students found' : 'No students available'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {getStudentsForAssignModal().map(student => (
                  <button
                    key={student.id}
                    onClick={() => toggleStudentForAdvisor(student.id)}
                    disabled={assignLoading}
                    className={`w-full text-left p-4 rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 ${
                      selectedStudentsForAdvisor.includes(student.id)
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      selectedStudentsForAdvisor.includes(student.id)
                        ? 'bg-purple-600 border-purple-600'
                        : 'border-gray-300'
                    }`}>
                      {selectedStudentsForAdvisor.includes(student.id) && (
                        <CheckCircleIcon className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {student.display_name || `${student.first_name} ${student.last_name}`}
                      </p>
                      <p className="text-sm text-gray-500">{student.email}</p>
                      {!showUnassignedOnly && student.advisor_count > 0 && (
                        <p className="text-xs text-purple-600 mt-1">
                          Currently has {student.advisor_count} advisor{student.advisor_count > 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
            <button
              onClick={() => {
                setShowAssignModal(false)
                setSelectedStudentsForAdvisor([])
                setShowUnassignedOnly(false)
              }}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleAssignStudents}
              disabled={selectedStudentsForAdvisor.length === 0 || assignLoading}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {assignLoading ? 'Assigning...' : `Assign ${selectedStudentsForAdvisor.length > 0 ? selectedStudentsForAdvisor.length : ''} Student${selectedStudentsForAdvisor.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </Modal>
      )}

      {/* Add Parent Connection Modal */}
      {showAddConnectionModal && (
        <Modal
          title="Add Parent-Student Connection"
          onClose={() => {
            setShowAddConnectionModal(false)
            resetModalState()
          }}
        >
          <div className="flex-1 overflow-y-auto">
            {/* Mode Toggle */}
            <div className="px-6 py-4 border-b">
              <div className="flex rounded-lg bg-gray-100 p-1">
                <button
                  onClick={() => {
                    setConnectionMode('existing')
                    setSelectedStudentIds([])
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    connectionMode === 'existing'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <LinkIcon className="w-4 h-4" />
                  Link Existing
                </button>
                <button
                  onClick={() => {
                    setConnectionMode('invite')
                    setSelectedParent(null)
                    setSelectedStudentIds([])
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    connectionMode === 'invite'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <EnvelopeIcon className="w-4 h-4" />
                  Invite New
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-6">
              {connectionMode === 'existing' ? (
                <>
                  {/* Select Parent */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Parent Account
                    </label>
                    {selectedParent ? (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center">
                        <div>
                          <p className="font-medium text-gray-900">
                            {selectedParent.first_name} {selectedParent.last_name}
                          </p>
                          <p className="text-sm text-gray-500">{selectedParent.email}</p>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedParent(null)
                            setSelectedStudentIds([])
                          }}
                          className="text-sm text-red-600 hover:text-red-800 font-medium"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                        {parents.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            <p>No parent accounts found</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-200">
                            {parents.map(parent => (
                              <button
                                key={parent.id}
                                onClick={() => setSelectedParent(parent)}
                                className="w-full text-left p-3 hover:bg-purple-50 transition-colors"
                              >
                                <p className="font-medium text-gray-900">
                                  {parent.first_name} {parent.last_name}
                                </p>
                                <p className="text-sm text-gray-500">{parent.email}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Select Students */}
                  {selectedParent && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Student(s)
                      </label>
                      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                        {students.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            <p>No students found</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-200">
                            {students.map(student => (
                              <button
                                key={student.id}
                                onClick={() => toggleStudentSelection(student.id)}
                                className={`w-full text-left p-3 transition-colors flex items-center gap-3 ${
                                  selectedStudentIds.includes(student.id)
                                    ? 'bg-purple-50 border-l-4 border-purple-500'
                                    : 'hover:bg-gray-50'
                                }`}
                              >
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                  selectedStudentIds.includes(student.id)
                                    ? 'bg-purple-600 border-purple-600'
                                    : 'border-gray-300'
                                }`}>
                                  {selectedStudentIds.includes(student.id) && (
                                    <CheckCircleIcon className="w-4 h-4 text-white" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <p className="font-medium text-gray-900">
                                    {student.first_name} {student.last_name}
                                  </p>
                                  <p className="text-sm text-gray-500">{student.email}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Invite New Parent */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      Send an email invitation to a parent. When they accept, they'll be connected to the selected student(s).
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Parent's Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="parent@example.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Parent's Name <span className="text-gray-400">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Jane Smith"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Student(s) <span className="text-red-500">*</span>
                    </label>
                    <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                      {students.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <p>No students found</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-200">
                          {students.map(student => (
                            <button
                              key={student.id}
                              onClick={() => toggleStudentSelection(student.id)}
                              className={`w-full text-left p-3 transition-colors flex items-center gap-3 ${
                                selectedStudentIds.includes(student.id)
                                  ? 'bg-purple-50 border-l-4 border-purple-500'
                                  : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                selectedStudentIds.includes(student.id)
                                  ? 'bg-purple-600 border-purple-600'
                                  : 'border-gray-300'
                              }`}>
                                {selectedStudentIds.includes(student.id) && (
                                  <CheckCircleIcon className="w-4 h-4 text-white" />
                                )}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">
                                  {student.first_name} {student.last_name}
                                </p>
                                <p className="text-sm text-gray-500">{student.email}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={() => {
                setShowAddConnectionModal(false)
                resetModalState()
              }}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            {connectionMode === 'existing' ? (
              <button
                onClick={handleAddConnection}
                disabled={!selectedParent || selectedStudentIds.length === 0 || addConnectionLoading}
                className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addConnectionLoading ? 'Adding...' : `Add Connection${selectedStudentIds.length > 1 ? 's' : ''}`}
              </button>
            ) : (
              <button
                onClick={handleInviteParent}
                disabled={!inviteEmail || selectedStudentIds.length === 0 || inviteLoading}
                className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <EnvelopeIcon className="w-4 h-4" />
                {inviteLoading ? 'Sending...' : 'Send Invitation'}
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
