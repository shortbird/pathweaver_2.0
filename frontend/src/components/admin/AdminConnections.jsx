import React, { useState, useEffect, memo } from 'react'
import api, { adminParentConnectionsAPI } from '../../services/api'
import toast from 'react-hot-toast'
import { MagnifyingGlassIcon, TrashIcon, UserPlusIcon, XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import ModalOverlay from '../ui/ModalOverlay'

/**
 * AdminConnections - Unified view for managing advisor-student and parent-student connections
 *
 * Simplified from the previous two-section layout into a single unified list with type filters.
 */

const AdminConnections = () => {
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all') // 'all', 'advisor', 'parent'

  // All connections unified
  const [connections, setConnections] = useState([])

  // For adding new connections
  const [showAddModal, setShowAddModal] = useState(false)
  const [addConnectionType, setAddConnectionType] = useState('advisor') // 'advisor' or 'parent'
  const [advisors, setAdvisors] = useState([])
  const [parents, setParents] = useState([])
  const [students, setStudents] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [selectedStudentIds, setSelectedStudentIds] = useState([])
  const [addLoading, setAddLoading] = useState(false)
  const [modalSearchTerm, setModalSearchTerm] = useState('')

  // For disconnect confirmation
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)
  const [selectedConnection, setSelectedConnection] = useState(null)

  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadConnections(),
        loadAdvisorsAndParents(),
        loadStudents()
      ])
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Failed to load connections')
    } finally {
      setLoading(false)
    }
  }

  const loadConnections = async () => {
    try {
      // Load both advisor-student and parent-student connections
      const [advisorRes, parentRes] = await Promise.all([
        api.get('/api/admin/advisors'),
        adminParentConnectionsAPI.getActiveLinks({ admin_verified: true })
      ])

      const allConnections = []

      // Process advisor connections
      const advisorList = advisorRes.data.advisors || []
      for (const advisor of advisorList) {
        // Fetch students for each advisor
        try {
          const studentsRes = await api.get(`/api/admin/advisors/${advisor.id}/students`)
          const assignedStudents = studentsRes.data.students || []
          for (const student of assignedStudents) {
            allConnections.push({
              id: `advisor-${advisor.id}-${student.id}`,
              type: 'advisor',
              person: {
                id: advisor.id,
                name: advisor.display_name || `${advisor.first_name} ${advisor.last_name}`,
                email: advisor.email,
                role: advisor.role
              },
              student: {
                id: student.id,
                name: student.display_name || `${student.first_name} ${student.last_name}`,
                email: student.email
              },
              created_at: student.assigned_at
            })
          }
        } catch (e) {
          console.error(`Failed to load students for advisor ${advisor.id}`)
        }
      }

      // Process parent connections
      const parentLinks = parentRes.data.links || []
      for (const link of parentLinks) {
        allConnections.push({
          id: `parent-${link.id}`,
          originalId: link.id,
          type: 'parent',
          person: {
            id: link.parent?.id || link.parent_user_id,
            name: `${link.parent?.first_name || ''} ${link.parent?.last_name || ''}`.trim(),
            email: link.parent?.email
          },
          student: {
            id: link.student?.id || link.student_user_id,
            name: `${link.student?.first_name || ''} ${link.student?.last_name || ''}`.trim(),
            email: link.student?.email
          },
          created_at: link.created_at
        })
      }

      setConnections(allConnections)
    } catch (error) {
      console.error('Error loading connections:', error)
    }
  }

  const loadAdvisorsAndParents = async () => {
    try {
      const [advisorRes, parentRes] = await Promise.all([
        api.get('/api/admin/advisors'),
        adminParentConnectionsAPI.getAllUsers({ role: 'parent', per_page: 100 })
      ])
      setAdvisors(advisorRes.data.advisors || [])
      setParents(parentRes.data.users || [])
    } catch (error) {
      console.error('Error loading advisors and parents:', error)
    }
  }

  const loadStudents = async () => {
    try {
      const response = await adminParentConnectionsAPI.getAllUsers({ role: 'student', per_page: 100 })
      setStudents(response.data.users || [])
    } catch (error) {
      console.error('Error loading students:', error)
    }
  }

  // Filter connections based on search and type
  const filteredConnections = connections.filter(conn => {
    // Type filter
    if (filterType !== 'all' && conn.type !== filterType) return false

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      return (
        conn.person.name?.toLowerCase().includes(search) ||
        conn.person.email?.toLowerCase().includes(search) ||
        conn.student.name?.toLowerCase().includes(search) ||
        conn.student.email?.toLowerCase().includes(search)
      )
    }
    return true
  })

  // Add connection handlers
  const handleAddConnection = async () => {
    if (!selectedPerson || selectedStudentIds.length === 0) {
      toast.error('Please select a person and at least one student')
      return
    }

    setAddLoading(true)
    try {
      if (addConnectionType === 'advisor') {
        // Add advisor-student connections
        await Promise.all(
          selectedStudentIds.map(studentId =>
            api.post(`/api/admin/advisors/${selectedPerson.id}/students`, { student_id: studentId })
          )
        )
        toast.success(`Assigned ${selectedStudentIds.length} student(s) to advisor`)
      } else {
        // Add parent-student connections
        await Promise.all(
          selectedStudentIds.map(studentId =>
            adminParentConnectionsAPI.createManualLink(selectedPerson.id, studentId, '')
          )
        )
        toast.success(`Connected ${selectedStudentIds.length} student(s) to parent`)
      }

      setShowAddModal(false)
      resetAddModal()
      loadConnections()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add connection')
    } finally {
      setAddLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (!selectedConnection) return

    try {
      if (selectedConnection.type === 'advisor') {
        await api.delete(`/api/admin/advisors/${selectedConnection.person.id}/students/${selectedConnection.student.id}`)
        toast.success('Student unassigned from advisor')
      } else {
        await adminParentConnectionsAPI.disconnectLink(selectedConnection.originalId)
        toast.success('Parent-student connection removed')
      }

      setShowDisconnectModal(false)
      setSelectedConnection(null)
      loadConnections()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to disconnect')
    }
  }

  const resetAddModal = () => {
    setSelectedPerson(null)
    setSelectedStudentIds([])
    setModalSearchTerm('')
  }

  const toggleStudentSelection = (studentId) => {
    setSelectedStudentIds(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    )
  }

  // Get available students for the selected person (excludes already connected)
  const getAvailableStudents = () => {
    if (!selectedPerson) return []

    const connectedStudentIds = connections
      .filter(c => c.type === addConnectionType && c.person.id === selectedPerson.id)
      .map(c => c.student.id)

    return students.filter(s => !connectedStudentIds.includes(s.id))
  }

  const filteredAvailableStudents = getAvailableStudents().filter(student => {
    if (!modalSearchTerm) return true
    const search = modalSearchTerm.toLowerCase()
    return (
      student.first_name?.toLowerCase().includes(search) ||
      student.last_name?.toLowerCase().includes(search) ||
      student.email?.toLowerCase().includes(search)
    )
  })

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  const advisorCount = connections.filter(c => c.type === 'advisor').length
  const parentCount = connections.filter(c => c.type === 'parent').length

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Connections</h2>
          <p className="text-gray-600 text-sm">Manage advisor-student and parent-student relationships</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium"
        >
          <UserPlusIcon className="w-5 h-5" />
          Add Connection
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              aria-label="Search connections"
            />
          </div>

          {/* Type Filter Pills */}
          <div className="flex bg-gray-100 rounded-lg p-1 self-start">
            <button
              onClick={() => setFilterType('all')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filterType === 'all'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All ({connections.length})
            </button>
            <button
              onClick={() => setFilterType('advisor')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filterType === 'advisor'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Advisors ({advisorCount})
            </button>
            <button
              onClick={() => setFilterType('parent')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filterType === 'parent'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Parents ({parentCount})
            </button>
          </div>
        </div>
      </div>

      {/* Connections List */}
      {filteredConnections.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <UserPlusIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No connections found</p>
          <p className="text-sm text-gray-500 mt-1">
            {searchTerm ? 'Try adjusting your search terms' : 'Click "Add Connection" to get started'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Person
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Connected To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Since
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredConnections.map((conn) => (
                  <tr key={conn.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{conn.person.name}</div>
                        <div className="text-sm text-gray-500">{conn.person.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        conn.type === 'advisor'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {conn.type === 'advisor' ? 'Advisor' : 'Parent'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{conn.student.name}</div>
                        <div className="text-sm text-gray-500">{conn.student.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {formatDate(conn.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedConnection(conn)
                          setShowDisconnectModal(true)
                        }}
                        className="inline-flex items-center px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                      >
                        <TrashIcon className="w-4 h-4 mr-1" />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {filteredConnections.map((conn) => (
              <div key={conn.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex justify-between items-start mb-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    conn.type === 'advisor'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {conn.type === 'advisor' ? 'Advisor' : 'Parent'}
                  </span>
                  <span className="text-xs text-gray-500">{formatDate(conn.created_at)}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{conn.type === 'advisor' ? 'Advisor' : 'Parent'}</p>
                    <p className="text-sm font-medium text-gray-900">{conn.person.name}</p>
                    <p className="text-xs text-gray-500 truncate">{conn.person.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Student</p>
                    <p className="text-sm font-medium text-gray-900">{conn.student.name}</p>
                    <p className="text-xs text-gray-500 truncate">{conn.student.email}</p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedConnection(conn)
                    setShowDisconnectModal(true)
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  <TrashIcon className="w-4 h-4" />
                  Remove Connection
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add Connection Modal */}
      {showAddModal && (
        <ModalOverlay onClose={() => { setShowAddModal(false); resetAddModal() }}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Add Connection</h3>
              <button
                onClick={() => {
                  setShowAddModal(false)
                  resetAddModal()
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Connection Type Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Connection Type</label>
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => {
                      setAddConnectionType('advisor')
                      setSelectedPerson(null)
                      setSelectedStudentIds([])
                    }}
                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      addConnectionType === 'advisor'
                        ? 'bg-white shadow-sm text-gray-900'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Advisor-Student
                  </button>
                  <button
                    onClick={() => {
                      setAddConnectionType('parent')
                      setSelectedPerson(null)
                      setSelectedStudentIds([])
                    }}
                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      addConnectionType === 'parent'
                        ? 'bg-white shadow-sm text-gray-900'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Parent-Student
                  </button>
                </div>
              </div>

              {/* Select Person */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select {addConnectionType === 'advisor' ? 'Advisor' : 'Parent'}
                </label>
                {selectedPerson ? (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">
                        {selectedPerson.display_name || `${selectedPerson.first_name} ${selectedPerson.last_name}`}
                      </p>
                      <p className="text-sm text-gray-500">{selectedPerson.email}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedPerson(null)
                        setSelectedStudentIds([])
                      }}
                      className="text-sm text-red-600 hover:text-red-800 font-medium"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                    {(addConnectionType === 'advisor' ? advisors : parents).length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <p>No {addConnectionType === 'advisor' ? 'advisors' : 'parents'} found</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-200">
                        {(addConnectionType === 'advisor' ? advisors : parents).map(person => (
                          <button
                            key={person.id}
                            onClick={() => setSelectedPerson(person)}
                            className="w-full text-left p-3 hover:bg-purple-50 transition-colors"
                          >
                            <p className="font-medium text-gray-900">
                              {person.display_name || `${person.first_name} ${person.last_name}`}
                            </p>
                            <p className="text-sm text-gray-500">{person.email}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Select Students */}
              {selectedPerson && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Student(s)
                    {selectedStudentIds.length > 0 && (
                      <span className="ml-2 text-optio-purple">({selectedStudentIds.length} selected)</span>
                    )}
                  </label>
                  <div className="relative mb-3">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={modalSearchTerm}
                      onChange={(e) => setModalSearchTerm(e.target.value)}
                      placeholder="Search students..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                    {filteredAvailableStudents.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <p>
                          {getAvailableStudents().length === 0
                            ? 'All students are already connected'
                            : 'No students match your search'}
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
                                ? 'bg-purple-50'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                              selectedStudentIds.includes(student.id)
                                ? 'bg-optio-purple border-optio-purple'
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
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  resetAddModal()
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAddConnection}
                disabled={!selectedPerson || selectedStudentIds.length === 0 || addLoading}
                className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addLoading ? 'Adding...' : `Add Connection${selectedStudentIds.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Disconnect Confirmation Modal */}
      {showDisconnectModal && selectedConnection && (
        <ModalOverlay onClose={() => { setShowDisconnectModal(false); setSelectedConnection(null) }}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Remove Connection</h3>
            <p className="text-gray-700 mb-2">
              Are you sure you want to remove the connection between{' '}
              <strong>{selectedConnection.person.name}</strong> and{' '}
              <strong>{selectedConnection.student.name}</strong>?
            </p>
            <p className="text-sm text-red-600 mb-6">
              {selectedConnection.type === 'parent'
                ? 'The parent will lose access to this student\'s data.'
                : 'The advisor will no longer be assigned to this student.'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDisconnectModal(false)
                  setSelectedConnection(null)
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
              >
                Remove
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

export default memo(AdminConnections)
