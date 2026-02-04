import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

/**
 * Custom hook managing all state and handlers for ConnectionsTab.
 */
export function useConnectionsTabState({ orgId }) {
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

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
  const [showStudentAdvisorsModal, setShowStudentAdvisorsModal] = useState(false)
  const [selectedStudentForAdvisors, setSelectedStudentForAdvisors] = useState(null)

  // Parent-Student state
  const [parentLinks, setParentLinks] = useState([])
  const [parents, setParents] = useState([])
  const [students, setStudents] = useState([])
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)
  const [showAddConnectionModal, setShowAddConnectionModal] = useState(false)
  const [selectedLink, setSelectedLink] = useState(null)
  const [selectedParent, setSelectedParent] = useState(null)
  const [selectedStudentIds, setSelectedStudentIds] = useState([])
  const [adminNotes, setAdminNotes] = useState('')
  const [addConnectionLoading, setAddConnectionLoading] = useState(false)

  // Parent invitation state
  const [connectionMode, setConnectionMode] = useState('existing')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)

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

  const loadAllData = useCallback(async () => {
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
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }, [fetchAdvisors, fetchUnassignedStudents, fetchAllStudentsWithAdvisors, loadParentLinks, loadParentsAndStudents])

  useEffect(() => {
    if (orgId) {
      loadAllData()
    }
  }, [orgId, loadAllData])

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
      }
      return [...prev, studentId]
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
      toast.error(error.response?.data?.error || 'Failed to assign students')
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

  const handleUnassignAdvisorFromStudent = async (studentId, advisorId, advisorName) => {
    if (!window.confirm(`Are you sure you want to remove ${advisorName} from this student?`)) return

    try {
      await api.delete(`/api/admin/organizations/${orgId}/students/${studentId}/advisors/${advisorId}`)
      toast.success('Advisor removed successfully')

      fetchAllStudentsWithAdvisors()
      fetchUnassignedStudents()
      fetchAdvisors()

      if (selectedStudentForAdvisors && selectedStudentForAdvisors.id === studentId) {
        const updated = allStudentsWithAdvisors.find(s => s.id === studentId)
        if (updated) {
          setSelectedStudentForAdvisors({
            ...updated,
            advisors: updated.advisors.filter(a => a.advisor_id !== advisorId)
          })
        }
      }
    } catch (error) {
      toast.error('Failed to remove advisor')
      console.error('Error removing advisor:', error)
    }
  }

  const handleViewStudentAdvisors = (student) => {
    setSelectedStudentForAdvisors(student)
    setShowStudentAdvisorsModal(true)
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
    setSearchTerm('')
  }

  const handleDisconnectParentLink = async () => {
    if (!selectedLink) return

    try {
      await api.delete(`/api/admin/organizations/${orgId}/parent-connections/links/${selectedLink.id}`)
      toast.success('Connection disconnected')
      setShowDisconnectModal(false)
      setSelectedLink(null)
      loadParentLinks()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to disconnect')
    }
  }

  const toggleStudentSelection = (studentId) => {
    setSelectedStudentIds(prev => {
      if (prev.includes(studentId)) {
        return prev.filter(id => id !== studentId)
      }
      return [...prev, studentId]
    })
  }

  // Filtering
  const getStudentsForAssignModal = () => {
    const filterBySearch = (student) => {
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
    }

    if (showUnassignedOnly) {
      return unassignedStudents.filter(filterBySearch)
    }

    const alreadyAssignedToThisAdvisor = assignedStudents.map(s => s.id)
    return allStudentsWithAdvisors.filter(student => {
      if (alreadyAssignedToThisAdvisor.includes(student.id)) return false
      return filterBySearch(student)
    })
  }

  const filteredParentLinks = parentLinks.filter(link => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      link.parent?.first_name?.toLowerCase().includes(search) ||
      link.parent?.last_name?.toLowerCase().includes(search) ||
      link.parent?.email?.toLowerCase().includes(search) ||
      link.student?.first_name?.toLowerCase().includes(search) ||
      link.student?.last_name?.toLowerCase().includes(search) ||
      link.student?.email?.toLowerCase().includes(search)
    )
  })

  const filteredParents = parents.filter(parent => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      parent.first_name?.toLowerCase().includes(search) ||
      parent.last_name?.toLowerCase().includes(search) ||
      parent.email?.toLowerCase().includes(search) ||
      parent.display_name?.toLowerCase().includes(search)
    )
  })

  const getAvailableStudents = () => {
    if (!selectedParent) return []
    const linkedStudentIds = parentLinks
      .filter(link => link.parent_user_id === selectedParent.id)
      .map(link => link.student_user_id)
    return students.filter(student => !linkedStudentIds.includes(student.id))
  }

  const filteredAvailableStudents = getAvailableStudents().filter(student => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      student.first_name?.toLowerCase().includes(search) ||
      student.last_name?.toLowerCase().includes(search) ||
      student.email?.toLowerCase().includes(search) ||
      student.display_name?.toLowerCase().includes(search)
    )
  })

  return {
    // Loading
    loading,
    searchTerm,
    setSearchTerm,

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
    showStudentAdvisorsModal,
    setShowStudentAdvisorsModal,
    selectedStudentForAdvisors,
    setSelectedStudentForAdvisors,

    // Parent-Student
    parentLinks,
    parents,
    students,
    showDisconnectModal,
    setShowDisconnectModal,
    showAddConnectionModal,
    setShowAddConnectionModal,
    selectedLink,
    setSelectedLink,
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

    // Computed
    getStudentsForAssignModal,
    filteredParentLinks,
    filteredParents,
    filteredAvailableStudents,

    // Handlers
    handleSelectAdvisor,
    toggleStudentForAdvisor,
    handleAssignStudents,
    handleUnassignStudent,
    handleUnassignAdvisorFromStudent,
    handleViewStudentAdvisors,
    handleAddConnection,
    handleInviteParent,
    resetModalState,
    handleDisconnectParentLink,
    toggleStudentSelection,
  }
}

export default useConnectionsTabState
