import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon, TrashIcon, UserPlusIcon, UsersIcon, CheckCircleIcon, XMarkIcon, EnvelopeIcon, LinkIcon } from '@heroicons/react/24/outline'

export default function ConnectionsTab({ orgId }) {
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Advisor-Student state
  const [advisors, setAdvisors] = useState([])
  const [selectedAdvisor, setSelectedAdvisor] = useState(null)
  const [assignedStudents, setAssignedStudents] = useState([])
  const [unassignedStudents, setUnassignedStudents] = useState([])
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignLoading, setAssignLoading] = useState(false)
  const [expandedAdvisorId, setExpandedAdvisorId] = useState(null)
  const [selectedStudentsForAdvisor, setSelectedStudentsForAdvisor] = useState([])

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

  // Parent invitation state (dual-mode modal)
  const [connectionMode, setConnectionMode] = useState('existing') // 'existing' | 'invite'
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)

  useEffect(() => {
    if (orgId) {
      loadAllData()
    }
  }, [orgId])

  const loadAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchAdvisors(),
        fetchUnassignedStudents(),
        loadParentLinks(),
        loadParentsAndStudents()
      ])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Advisor-Student functions
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
      fetchAdvisors()
    } catch (error) {
      toast.error('Failed to unassign student')
      console.error('Error unassigning student:', error)
    }
  }

  // Parent-Student functions
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

    // Basic email validation
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
          // User already had an account - they were added directly
          toast.success(response.data.message || 'Parent has been added to your organization and connected to their student(s).')
          loadParentLinks() // Refresh the links since they were created immediately
        } else {
          // New user - invitation was sent
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
      } else {
        return [...prev, studentId]
      }
    })
  }

  // Filtering
  const filteredUnassignedStudents = unassignedStudents.filter(student => {
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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink p-6 rounded-lg text-white shadow-md">
          <div className="flex items-center gap-3">
            <UsersIcon className="w-10 h-10" />
            <div>
              <p className="text-sm opacity-90">Advisor-Student</p>
              <p className="text-3xl font-bold">{advisors.length}</p>
              <p className="text-sm opacity-90">Advisors & Admins</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-optio-pink to-optio-purple p-6 rounded-lg text-white shadow-md">
          <div className="flex items-center gap-3">
            <UserPlusIcon className="w-10 h-10" />
            <div>
              <p className="text-sm opacity-90">Parent-Student</p>
              <p className="text-3xl font-bold">{parentLinks.length}</p>
              <p className="text-sm opacity-90">Active Connections</p>
            </div>
          </div>
        </div>
      </div>

      {/* Advisor-Student Connections Section */}
      <section className="bg-white rounded-lg shadow p-6">
        <div className="mb-6">
          <h3 className="text-xl font-bold mb-2">Advisor-Student Connections</h3>
          <p className="text-gray-600 text-sm">Assign students to advisors for check-ins and support</p>
        </div>

        {advisors.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
            <UsersIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p>No advisors found in this organization</p>
            <p className="text-sm mt-1">Invite users with the "advisor" role first</p>
          </div>
        ) : (
          <div className="space-y-3">
            {advisors.map(advisor => (
              <div key={advisor.id} className="border-2 border-gray-200 rounded-lg overflow-hidden hover:border-purple-300 transition-colors">
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
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium text-sm"
                      >
                        <UserPlusIcon className="w-4 h-4" />
                        Assign Student
                      </button>
                    </div>

                    {assignedStudents.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                        <p>No students assigned yet</p>
                        <p className="text-sm mt-1">Click "Assign Student" to get started</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
            ))}
          </div>
        )}
      </section>

      {/* Parent-Student Connections Section */}
      <section className="bg-white rounded-lg shadow p-6">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold mb-2">Parent-Student Connections</h3>
            <p className="text-gray-600 text-sm">Manage parent-student relationships and access</p>
          </div>
          <button
            onClick={() => setShowAddConnectionModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium"
          >
            <UserPlusIcon className="w-5 h-5" />
            Add Connection
          </button>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by parent or student name/email..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
          </div>
        </div>

        {/* Active Connections Table */}
        <div>
          {filteredParentLinks.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <UserPlusIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No active connections found</p>
            </div>
          ) : (
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Parent</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Connected</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredParentLinks.map((link) => (
                    <tr key={link.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {link.parent?.first_name} {link.parent?.last_name}
                          </div>
                          <div className="text-sm text-gray-500">{link.parent?.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {link.student?.first_name} {link.student?.last_name}
                          </div>
                          <div className="text-sm text-gray-500">{link.student?.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(link.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedLink(link)
                            setShowDisconnectModal(true)
                          }}
                          className="inline-flex items-center px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                        >
                          <TrashIcon className="w-4 h-4 mr-1" />
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
      </section>

      {/* Assign Student Modal - Multi-select */}
      {showAssignModal && (
        <Modal
          title={`Assign Students to ${selectedAdvisor?.display_name || selectedAdvisor?.first_name}`}
          onClose={() => {
            setShowAssignModal(false)
            setSelectedStudentsForAdvisor([])
            setSearchTerm('')
          }}
        >
          <div className="px-6 py-4 border-b">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search students by name or email..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            {selectedStudentsForAdvisor.length > 0 && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900 mb-2">
                  {selectedStudentsForAdvisor.length} student{selectedStudentsForAdvisor.length > 1 ? 's' : ''} selected
                </p>
                <div className="flex flex-wrap gap-2">
                  {unassignedStudents
                    .filter(s => selectedStudentsForAdvisor.includes(s.id))
                    .map(student => (
                      <span key={student.id} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-blue-300 rounded text-sm">
                        {student.display_name || `${student.first_name} ${student.last_name}`}
                        <button onClick={() => toggleStudentForAdvisor(student.id)} className="text-red-600 hover:text-red-800">
                          <XMarkIcon className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 max-h-96">
            {filteredUnassignedStudents.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>No unassigned students found</p>
                {searchTerm && <p className="text-sm mt-1">Try adjusting your search</p>}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUnassignedStudents.map(student => (
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
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t bg-gray-50 flex justify-between items-center">
            <p className="text-sm text-gray-600">
              {filteredUnassignedStudents.length} unassigned student{filteredUnassignedStudents.length !== 1 ? 's' : ''} available
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAssignModal(false)
                  setSelectedStudentsForAdvisor([])
                  setSearchTerm('')
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
          </div>
        </Modal>
      )}

      {/* Add Parent-Student Connection Modal */}
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
                    setSearchTerm('')
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    connectionMode === 'existing'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <LinkIcon className="w-4 h-4" />
                  Link Existing Parent
                </button>
                <button
                  onClick={() => {
                    setConnectionMode('invite')
                    setSelectedParent(null)
                    setSelectedStudentIds([])
                    setSearchTerm('')
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    connectionMode === 'invite'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <EnvelopeIcon className="w-4 h-4" />
                  Invite New Parent
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-6">
              {connectionMode === 'existing' ? (
                <>
                  {/* Step 1: Select Parent */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Step 1: Select Parent Account
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
                      <>
                        <div className="relative mb-3">
                          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search parents by name or email..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                          />
                        </div>
                        <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                          {filteredParents.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                              <p>No parent accounts found</p>
                              <p className="text-sm mt-1">Try inviting a new parent instead</p>
                            </div>
                          ) : (
                            <div className="divide-y divide-gray-200">
                              {filteredParents.map(parent => (
                                <button
                                  key={parent.id}
                                  onClick={() => {
                                    setSelectedParent(parent)
                                    setSearchTerm('')
                                  }}
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
                      </>
                    )}
                  </div>

                  {/* Step 2: Select Students */}
                  {selectedParent && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Step 2: Select Student(s) to Add
                      </label>
                      {selectedStudentIds.length > 0 && (
                        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm font-medium text-blue-900 mb-2">
                            {selectedStudentIds.length} student{selectedStudentIds.length > 1 ? 's' : ''} selected
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {students
                              .filter(s => selectedStudentIds.includes(s.id))
                              .map(student => (
                                <span key={student.id} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-blue-300 rounded text-sm">
                                  {student.first_name} {student.last_name}
                                  <button onClick={() => toggleStudentSelection(student.id)} className="text-red-600 hover:text-red-800">
                                    <XMarkIcon className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                          </div>
                        </div>
                      )}
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
                      <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                        {filteredAvailableStudents.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            <p>
                              {getAvailableStudents().length === 0
                                ? 'All students are already connected to this parent'
                                : 'No students found matching your search'}
                            </p>
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-200">
                            {filteredAvailableStudents.map(student => (
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

                  {/* Admin Notes */}
                  {selectedParent && selectedStudentIds.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Admin Notes (Optional)
                      </label>
                      <textarea
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                        placeholder="Add any notes about this connection..."
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Invite New Parent Mode */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      Send an email invitation to a parent who doesn't have an Optio account. When they accept and create their account, they'll automatically be connected to the selected student(s).
                    </p>
                  </div>

                  {/* Email Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Parent's Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="parent@example.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>

                  {/* Name Input */}
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

                  {/* Select Students */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Student(s) to Connect <span className="text-red-500">*</span>
                    </label>
                    {selectedStudentIds.length > 0 && (
                      <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm font-medium text-blue-900 mb-2">
                          {selectedStudentIds.length} student{selectedStudentIds.length > 1 ? 's' : ''} selected
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {students
                            .filter(s => selectedStudentIds.includes(s.id))
                            .map(student => (
                              <span key={student.id} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-blue-300 rounded text-sm">
                                {student.first_name} {student.last_name}
                                <button onClick={() => toggleStudentSelection(student.id)} className="text-red-600 hover:text-red-800">
                                  <XMarkIcon className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
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
                    <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                      {students.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <p>No students found in this organization</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-200">
                          {students
                            .filter(student => {
                              if (!searchTerm) return true
                              const search = searchTerm.toLowerCase()
                              return (
                                student.first_name?.toLowerCase().includes(search) ||
                                student.last_name?.toLowerCase().includes(search) ||
                                student.email?.toLowerCase().includes(search)
                              )
                            })
                            .map(student => (
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

          {/* Footer with Actions */}
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

      {/* Disconnect Parent Link Modal */}
      {showDisconnectModal && (
        <Modal
          title="Disconnect Parent-Student Link"
          onClose={() => {
            setShowDisconnectModal(false)
            setSelectedLink(null)
          }}
          onConfirm={handleDisconnectParentLink}
          confirmText="Disconnect"
          confirmClass="bg-red-600 hover:bg-red-700"
        >
          <p className="text-gray-700">
            Are you sure you want to disconnect <strong>{selectedLink?.parent?.first_name} {selectedLink?.parent?.last_name}</strong> from{' '}
            <strong>{selectedLink?.student?.first_name} {selectedLink?.student?.last_name}</strong>?
          </p>
          <p className="text-sm text-red-600 mt-2">
            This action cannot be undone. The parent will lose access to this student's data.
          </p>
        </Modal>
      )}
    </div>
  )
}

// Modal Component - uses Portal to render at document root with high z-index
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
