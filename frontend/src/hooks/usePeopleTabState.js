import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

// Roles available for invitation link generation (not org_admin or observer)
const VALID_ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'parent', label: 'Parent' },
  { value: 'advisor', label: 'Advisor' }
]

/**
 * Custom hook managing all state and handlers for PeopleTab.
 */
export function usePeopleTabState({ orgId, orgSlug, users, onUpdate }) {
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
  const [refreshConfirmRole, setRefreshConfirmRole] = useState(null) // Role pending refresh confirmation

  // Pending invitations state
  const [pendingInvitations, setPendingInvitations] = useState([])
  const [pendingLoading, setPendingLoading] = useState(true)
  const [showPendingInvitations, setShowPendingInvitations] = useState(true)

  // Relationships state
  const [showRelationships, setShowRelationships] = useState(false)
  const [relationshipView, setRelationshipView] = useState('advisors')
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

  // Fetch invitation links
  const fetchInvitationLinks = useCallback(async () => {
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
  }, [orgId])

  // Fetch pending email invitations
  const fetchPendingInvitations = useCallback(async () => {
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
  }, [orgId])

  useEffect(() => {
    fetchInvitationLinks()
    fetchPendingInvitations()
  }, [fetchInvitationLinks, fetchPendingInvitations])

  // Request to refresh a link (shows confirmation if link already exists)
  const handleRefreshLinkRequest = (role) => {
    const existingForRole = invitationLinks.find(l => l.role === role)
    if (existingForRole) {
      // Link exists - show confirmation
      setRefreshConfirmRole(role)
    } else {
      // No existing link - generate directly
      handleGenerateLink(role)
    }
  }

  // Cancel refresh confirmation
  const handleCancelRefresh = () => {
    setRefreshConfirmRole(null)
  }

  // Confirm and execute the refresh
  const handleConfirmRefresh = async () => {
    if (!refreshConfirmRole) return
    await handleGenerateLink(refreshConfirmRole)
    setRefreshConfirmRole(null)
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

  // Advisor functions
  const fetchAdvisors = useCallback(async () => {
    try {
      const response = await api.get(`/api/admin/organizations/${orgId}/advisors`)
      setAdvisors(response.data.advisors || [])
    } catch (error) {
      console.error('Error fetching advisors:', error)
    }
  }, [orgId])

  const fetchUnassignedStudents = useCallback(async () => {
    try {
      const response = await api.get(`/api/admin/organizations/${orgId}/students/unassigned`)
      setUnassignedStudents(response.data.students || [])
    } catch (error) {
      console.error('Error fetching unassigned students:', error)
    }
  }, [orgId])

  const fetchAllStudentsWithAdvisors = useCallback(async () => {
    try {
      const response = await api.get(`/api/admin/organizations/${orgId}/students/advisor-assignments`)
      setAllStudentsWithAdvisors(response.data.students || [])
    } catch (error) {
      console.error('Error fetching students with advisors:', error)
    }
  }, [orgId])

  const loadParentLinks = useCallback(async () => {
    try {
      const response = await api.get(`/api/admin/organizations/${orgId}/parent-connections/links`)
      setParentLinks(response.data.links || [])
    } catch (error) {
      console.error('Error loading parent links:', error)
    }
  }, [orgId])

  const loadParentsAndStudents = useCallback(async () => {
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
  }, [orgId])

  // Load relationships data when expanded
  const loadRelationshipsData = useCallback(async () => {
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
  }, [fetchAdvisors, fetchUnassignedStudents, fetchAllStudentsWithAdvisors, loadParentLinks, loadParentsAndStudents])

  useEffect(() => {
    if (showRelationships) {
      loadRelationshipsData()
    }
  }, [showRelationships, loadRelationshipsData])

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

  return {
    // Constants
    VALID_ROLES,
    usersPerPage,

    // User list state
    showEditModal,
    setShowEditModal,
    showCreateUsernameModal,
    setShowCreateUsernameModal,
    selectedUser,
    setSelectedUser,
    searchTerm,
    setSearchTerm,
    roleFilter,
    setRoleFilter,
    currentPage,
    setCurrentPage,
    selectedUsers,
    setSelectedUsers,
    bulkActionLoading,

    // Quick actions
    showActionsDropdown,
    setShowActionsDropdown,
    showInviteModal,
    setShowInviteModal,
    showBulkImportModal,
    setShowBulkImportModal,

    // Invitation links
    invitationLinks,
    linksLoading,
    generating,
    copiedLinkId,
    showInvitationLinks,
    setShowInvitationLinks,
    refreshConfirmRole,
    handleRefreshLinkRequest,
    handleCancelRefresh,
    handleConfirmRefresh,

    // Pending invitations
    pendingInvitations,
    pendingLoading,
    showPendingInvitations,
    setShowPendingInvitations,

    // Relationships
    showRelationships,
    setShowRelationships,
    relationshipView,
    setRelationshipView,
    loading,

    // Advisor-Student
    advisors,
    selectedAdvisor,
    assignedStudents,
    unassignedStudents,
    allStudentsWithAdvisors,
    showAssignModal,
    setShowAssignModal,
    assignLoading,
    expandedAdvisorId,
    selectedStudentsForAdvisor,
    setSelectedStudentsForAdvisor,
    showUnassignedOnly,
    setShowUnassignedOnly,

    // Parent-Student
    parentLinks,
    parents,
    students,
    showAddConnectionModal,
    setShowAddConnectionModal,
    selectedParent,
    setSelectedParent,
    selectedStudentIds,
    setSelectedStudentIds,
    adminNotes,
    setAdminNotes,
    addConnectionLoading,
    connectionMode,
    setConnectionMode,
    inviteEmail,
    setInviteEmail,
    inviteName,
    setInviteName,
    inviteLoading,

    // Computed values
    filteredUsers,
    totalPages,
    startIndex,
    paginatedUsers,

    // Handlers
    handleGenerateLink,
    handleCopyLink,
    formatExpiration,
    getLinkForRole,
    getRoleBadgeClass,
    handleRemoveUser,
    handleBulkRemove,
    toggleUserSelection,
    selectAllVisible,
    handleSelectAdvisor,
    toggleStudentForAdvisor,
    handleAssignStudents,
    handleUnassignStudent,
    handleAddConnection,
    handleInviteParent,
    resetModalState,
    handleDisconnectParentLink,
    toggleStudentSelection,
    getStudentsForAssignModal,
    fetchPendingInvitations,
  }
}

export default usePeopleTabState
