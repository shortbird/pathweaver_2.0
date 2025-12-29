import React, { useState, useEffect } from 'react'
import api, { adminParentConnectionsAPI } from '../../services/api'
import toast from 'react-hot-toast'
import { CheckCircleIcon, ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon, TrashIcon, UserPlusIcon, UsersIcon, XCircleIcon, XMarkIcon } from '@heroicons/react/24/outline'

const AdminConnections = () => {
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

  useEffect(() => {
    loadAllData()
  }, [])

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
      const response = await api.get('/api/admin/advisors')
      setAdvisors(response.data.advisors || [])
    } catch (error) {
      toast.error('Failed to load advisors')
      console.error('Error fetching advisors:', error)
    }
  }

  const fetchUnassignedStudents = async () => {
    try {
      const response = await api.get('/api/admin/students/unassigned')
      setUnassignedStudents(response.data.students || [])
    } catch (error) {
      console.error('Error fetching unassigned students:', error)
    }
  }

  const fetchAdvisorStudents = async (advisorId) => {
    try {
      const response = await api.get(`/api/admin/advisors/${advisorId}/students`)
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

  const handleAssignStudent = async (studentId) => {
    if (!selectedAdvisor) return

    setAssignLoading(true)
    try {
      await api.post(`/api/admin/advisors/${selectedAdvisor.id}/students`, {
        student_id: studentId
      })
      toast.success('Student assigned successfully')

      fetchAdvisorStudents(selectedAdvisor.id)
      fetchUnassignedStudents()
      fetchAdvisors()
      setShowAssignModal(false)
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to assign student'
      toast.error(errorMessage)
    } finally {
      setAssignLoading(false)
    }
  }

  const handleUnassignStudent = async (studentId) => {
    if (!selectedAdvisor) return
    if (!window.confirm('Are you sure you want to unassign this student?')) return

    try {
      await api.delete(`/api/admin/advisors/${selectedAdvisor.id}/students/${studentId}`)
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
      const response = await adminParentConnectionsAPI.getActiveLinks({ admin_verified: true })
      setParentLinks(response.data.links || [])
    } catch (error) {
      console.error('Error loading parent links:', error)
    }
  }

  const loadParentsAndStudents = async () => {
    try {
      const [parentsResponse, studentsResponse] = await Promise.all([
        adminParentConnectionsAPI.getAllUsers({ role: 'parent', per_page: 100 }),
        adminParentConnectionsAPI.getAllUsers({ role: 'student', per_page: 100 })
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
      // Create connections for each selected student
      await Promise.all(
        selectedStudentIds.map(studentId =>
          adminParentConnectionsAPI.createManualLink(selectedParent.id, studentId, adminNotes)
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

  const handleDisconnectParentLink = async () => {
    if (!selectedLink) return

    try {
      await adminParentConnectionsAPI.disconnectLink(selectedLink.id)
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
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>Connections</h2>
        <p className="text-gray-600" style={{ fontFamily: 'Poppins, sans-serif' }}>Manage advisor-student assignments and parent-student connections</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink p-6 rounded-lg text-white shadow-md">
          <div className="flex items-center gap-3">
            <UsersIcon className="w-10 h-10" />
            <div>
              <p className="text-sm opacity-90" style={{ fontFamily: 'Poppins, sans-serif' }}>Advisor-Student</p>
              <p className="text-3xl font-bold" style={{ fontFamily: 'Poppins, sans-serif' }}>{advisors.length}</p>
              <p className="text-sm opacity-90" style={{ fontFamily: 'Poppins, sans-serif' }}>Advisors & Admins</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-optio-pink to-optio-purple p-6 rounded-lg text-white shadow-md">
          <div className="flex items-center gap-3">
            <UserPlusIcon className="w-10 h-10" />
            <div>
              <p className="text-sm opacity-90" style={{ fontFamily: 'Poppins, sans-serif' }}>Parent-Student</p>
              <p className="text-3xl font-bold" style={{ fontFamily: 'Poppins, sans-serif' }}>{parentLinks.length}</p>
              <p className="text-sm opacity-90" style={{ fontFamily: 'Poppins, sans-serif' }}>Active Connections</p>
            </div>
          </div>
        </div>
      </div>

      {/* Advisor-Student Connections Section */}
      <section className="bg-white rounded-lg shadow p-6">
        <div className="mb-6">
          <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>Advisor-Student Connections</h3>
          <p className="text-gray-600 text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>Assign students to advisors and admins for check-ins and support</p>
        </div>

        {advisors.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
            <UsersIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p style={{ fontFamily: 'Poppins, sans-serif' }}>No advisors or admins found</p>
            <p className="text-sm mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>Create users with the "advisor" or "admin" role first</p>
          </div>
        ) : (
          <div className="space-y-3">
            {advisors.map(advisor => (
              <div key={advisor.id} className="border-2 border-gray-200 rounded-lg overflow-hidden hover:border-purple-300 transition-colors">
                {/* Advisor Header */}
                <button
                  onClick={() => handleSelectAdvisor(advisor)}
                  className="w-full p-4 text-left flex justify-between items-center bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        {advisor.display_name || `${advisor.first_name} ${advisor.last_name}`}
                      </p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        advisor.role === 'admin' || advisor.role === 'superadmin'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`} style={{ fontFamily: 'Poppins, sans-serif' }}>
                        {advisor.role === 'admin' ? 'Admin' : advisor.role === 'superadmin' ? 'Superadmin' : 'Advisor'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>{advisor.email}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-optio-purple" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {advisor.assigned_students_count || 0} students
                    </span>
                    {expandedAdvisorId === advisor.id ? (
                      <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Student List */}
                {expandedAdvisorId === advisor.id && selectedAdvisor?.id === advisor.id && (
                  <div className="p-4 bg-white border-t border-gray-200">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        Assigned Students ({assignedStudents.length})
                      </h4>
                      <button
                        onClick={() => setShowAssignModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium text-sm"
                        style={{ fontFamily: 'Poppins, sans-serif' }}
                      >
                        <UserPlusIcon className="w-4 h-4" />
                        Assign Student
                      </button>
                    </div>

                    {assignedStudents.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                        <p style={{ fontFamily: 'Poppins, sans-serif' }}>No students assigned yet</p>
                        <p className="text-sm mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>Click "Assign Student" to get started</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {assignedStudents.map(student => (
                          <div
                            key={student.id}
                            className="p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 text-sm truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>
                                  {student.display_name || `${student.first_name} ${student.last_name}`}
                                </p>
                                <p className="text-xs text-gray-500 truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>{student.email}</p>
                                <p className="text-xs text-gray-400 mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                                  Assigned {new Date(student.assigned_at).toLocaleDateString()}
                                </p>
                              </div>
                              <button
                                onClick={() => handleUnassignStudent(student.id)}
                                className="ml-2 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                                style={{ fontFamily: 'Poppins, sans-serif' }}
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
            <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>Parent-Student Connections</h3>
            <p className="text-gray-600 text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>Manage parent-student relationships and access</p>
          </div>
          <button
            onClick={() => setShowAddConnectionModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            <UserPlusIcon className="w-5 h-5" />
            Add Parent-Student Connection
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
              style={{ fontFamily: 'Poppins, sans-serif' }}
              aria-label="Search parent-student connections by name or email"
            />
          </div>
        </div>

        {/* Active Connections Table */}
        <div>
          <h4 className="font-semibold text-gray-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>Active Connections</h4>
          {filteredParentLinks.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <UserPlusIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600" style={{ fontFamily: 'Poppins, sans-serif' }}>No active connections found</p>
            </div>
          ) : (
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>Parent</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>Student</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>Connected Since</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>Verified By</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredParentLinks.map((link) => (
                    <tr key={link.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {link.parent?.first_name} {link.parent?.last_name}
                          </div>
                          <div className="text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {link.parent?.email}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {link.student?.first_name} {link.student?.last_name}
                          </div>
                          <div className="text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {link.student?.email}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        {new Date(link.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        {link.verified_by ? `${link.verified_by.first_name} ${link.verified_by.last_name}` : 'System'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedLink(link)
                            setShowDisconnectModal(true)
                          }}
                          className="inline-flex items-center px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                          style={{ fontFamily: 'Poppins, sans-serif' }}
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

      {/* Assign Student Modal */}
      {showAssignModal && (
        <Modal
          title={`Assign Student to ${selectedAdvisor?.display_name}`}
          onClose={() => setShowAssignModal(false)}
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
                style={{ fontFamily: 'Poppins, sans-serif' }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 max-h-96">
            {filteredUnassignedStudents.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p style={{ fontFamily: 'Poppins, sans-serif' }}>No unassigned students found</p>
                {searchTerm && (
                  <p className="text-sm mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>Try adjusting your search</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUnassignedStudents.map(student => (
                  <button
                    key={student.id}
                    onClick={() => handleAssignStudent(student.id)}
                    disabled={assignLoading}
                    className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <p className="font-medium text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {student.display_name || `${student.first_name} ${student.last_name}`}
                    </p>
                    <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>{student.email}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t bg-gray-50">
            <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {filteredUnassignedStudents.length} unassigned student{filteredUnassignedStudents.length !== 1 ? 's' : ''} available
            </p>
          </div>
        </Modal>
      )}

      {/* Add Parent-Student Connection Modal */}
      {showAddConnectionModal && (
        <Modal
          title="Add Parent-Student Connection"
          onClose={() => {
            setShowAddConnectionModal(false)
            setSelectedParent(null)
            setSelectedStudentIds([])
            setAdminNotes('')
            setSearchTerm('')
          }}
        >
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-4 space-y-6">
              {/* Step 1: Select Parent */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Step 1: Select Parent Account
                </label>
                {selectedParent ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        {selectedParent.first_name} {selectedParent.last_name}
                      </p>
                      <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>{selectedParent.email}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedParent(null)
                        setSelectedStudentIds([])
                      }}
                      className="text-sm text-red-600 hover:text-red-800 font-medium"
                      style={{ fontFamily: 'Poppins, sans-serif' }}
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
                        style={{ fontFamily: 'Poppins, sans-serif' }}
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                      {filteredParents.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <p style={{ fontFamily: 'Poppins, sans-serif' }}>No parent accounts found</p>
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
                              <p className="font-medium text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                                {parent.first_name} {parent.last_name}
                              </p>
                              <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>{parent.email}</p>
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
                  <label className="block text-sm font-medium text-gray-700 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Step 2: Select Student(s) to Add
                  </label>
                  {selectedStudentIds.length > 0 && (
                    <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm font-medium text-blue-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        {selectedStudentIds.length} student{selectedStudentIds.length > 1 ? 's' : ''} selected
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {students
                          .filter(s => selectedStudentIds.includes(s.id))
                          .map(student => (
                            <span
                              key={student.id}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-blue-300 rounded text-sm"
                              style={{ fontFamily: 'Poppins, sans-serif' }}
                            >
                              {student.first_name} {student.last_name}
                              <button
                                onClick={() => toggleStudentSelection(student.id)}
                                className="text-red-600 hover:text-red-800"
                              >
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
                      style={{ fontFamily: 'Poppins, sans-serif' }}
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                    {filteredAvailableStudents.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <p style={{ fontFamily: 'Poppins, sans-serif' }}>
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
                              <p className="font-medium text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                                {student.first_name} {student.last_name}
                              </p>
                              <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>{student.email}</p>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Admin Notes (Optional)
                  </label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                    style={{ fontFamily: 'Poppins, sans-serif' }}
                    placeholder="Add any notes about this connection..."
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer with Actions */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={() => {
                setShowAddConnectionModal(false)
                setSelectedParent(null)
                setSelectedStudentIds([])
                setAdminNotes('')
                setSearchTerm('')
              }}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              Cancel
            </button>
            <button
              onClick={handleAddConnection}
              disabled={!selectedParent || selectedStudentIds.length === 0 || addConnectionLoading}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              {addConnectionLoading ? 'Adding...' : `Add Connection${selectedStudentIds.length > 1 ? 's' : ''}`}
            </button>
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
          <p className="text-gray-700" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Are you sure you want to disconnect <strong>{selectedLink?.parent?.first_name} {selectedLink?.parent?.last_name}</strong> from{' '}
            <strong>{selectedLink?.student?.first_name} {selectedLink?.student?.last_name}</strong>?
          </p>
          <p className="text-sm text-red-600 mt-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
            This action cannot be undone. The parent will lose access to this student's data.
          </p>
        </Modal>
      )}
    </div>
  )
}

// Modal Component
const Modal = ({ title, children, onClose, onConfirm, confirmText, confirmClass }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
        {onConfirm && (
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-white rounded-lg transition-colors font-semibold ${confirmClass}`}
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              {confirmText}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminConnections
