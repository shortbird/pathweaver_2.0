import React, { useState, useEffect, useCallback } from 'react'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  UserPlusIcon,
  UsersIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import toast from 'react-hot-toast'
import ModalOverlay from '../ui/ModalOverlay'

/**
 * Dedicated Advisors tab for org management.
 * Allows org_admins to assign students to advisors (including themselves).
 */
export default function AdvisorsTab({ orgId }) {
  const [advisors, setAdvisors] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedAdvisorId, setExpandedAdvisorId] = useState(null)
  const [assignedStudents, setAssignedStudents] = useState([])
  const [selectedAdvisor, setSelectedAdvisor] = useState(null)

  // Assign modal state
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignSearchTerm, setAssignSearchTerm] = useState('')
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false)
  const [selectedStudents, setSelectedStudents] = useState([])
  const [assignLoading, setAssignLoading] = useState(false)
  const [unassignedStudents, setUnassignedStudents] = useState([])
  const [allStudentsWithAdvisors, setAllStudentsWithAdvisors] = useState([])

  const fetchAdvisors = useCallback(async () => {
    try {
      const response = await api.get(`/api/admin/organizations/${orgId}/advisors`)
      setAdvisors(response.data.advisors || [])
    } catch (error) {
      console.error('Error fetching advisors:', error)
      toast.error('Failed to load advisors')
    } finally {
      setLoading(false)
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

  useEffect(() => {
    fetchAdvisors()
    fetchUnassignedStudents()
    fetchAllStudentsWithAdvisors()
  }, [fetchAdvisors, fetchUnassignedStudents, fetchAllStudentsWithAdvisors])

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
    if (expandedAdvisorId === advisor.id) {
      setExpandedAdvisorId(null)
      setSelectedAdvisor(null)
      setAssignedStudents([])
    } else {
      setSelectedAdvisor(advisor)
      setExpandedAdvisorId(advisor.id)
      fetchAdvisorStudents(advisor.id)
    }
  }

  const handleAssignStudents = async () => {
    if (!selectedAdvisor || selectedStudents.length === 0) return

    setAssignLoading(true)
    try {
      await Promise.all(
        selectedStudents.map(studentId =>
          api.post(`/api/admin/organizations/${orgId}/advisors/${selectedAdvisor.id}/students`, {
            student_id: studentId
          })
        )
      )

      const count = selectedStudents.length
      toast.success(`${count} student${count > 1 ? 's' : ''} assigned successfully`)

      fetchAdvisorStudents(selectedAdvisor.id)
      fetchUnassignedStudents()
      fetchAllStudentsWithAdvisors()
      fetchAdvisors()
      setShowAssignModal(false)
      setSelectedStudents([])
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
    }
  }

  const toggleStudentSelection = (studentId) => {
    setSelectedStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    )
  }

  const getStudentsForModal = () => {
    const alreadyAssigned = assignedStudents.map(s => s.id)
    const source = showUnassignedOnly ? unassignedStudents : allStudentsWithAdvisors
    return source.filter(student => {
      if (alreadyAssigned.includes(student.id)) return false
      if (!assignSearchTerm) return true
      const searchLower = assignSearchTerm.toLowerCase()
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

  // Summary stats
  const totalStudents = allStudentsWithAdvisors.length
  const assignedCount = allStudentsWithAdvisors.filter(s => s.advisor_count > 0).length
  const unassignedCount = totalStudents - assignedCount

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Advisors</p>
          <p className="text-2xl font-bold text-gray-900">{advisors.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Students Assigned</p>
          <p className="text-2xl font-bold text-green-600">{assignedCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Students Unassigned</p>
          <p className="text-2xl font-bold text-amber-600">{unassignedCount}</p>
        </div>
      </div>

      {/* Advisors List */}
      {advisors.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <UsersIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No advisors yet</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Invite users with the "advisor" role to your organization, or org admins can also act as advisors.
            Go to the People tab to add users.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {advisors.map(advisor => (
            <div key={advisor.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => handleSelectAdvisor(advisor)}
                className="w-full p-5 text-left flex justify-between items-center hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center text-white font-semibold text-sm">
                    {(advisor.first_name || advisor.display_name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">
                        {`${advisor.first_name || ''} ${advisor.last_name || ''}`.trim() || advisor.display_name || 'Unknown'}
                      </p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        advisor.role === 'org_admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {advisor.role === 'org_admin' ? 'Admin' : 'Advisor'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{advisor.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-medium ${
                    (advisor.assigned_students_count || 0) > 0 ? 'text-optio-purple' : 'text-gray-400'
                  }`}>
                    {advisor.assigned_students_count || 0} student{advisor.assigned_students_count !== 1 ? 's' : ''}
                  </span>
                  {expandedAdvisorId === advisor.id ? (
                    <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>

              {expandedAdvisorId === advisor.id && selectedAdvisor?.id === advisor.id && (
                <div className="px-5 pb-5 border-t border-gray-100">
                  <div className="flex justify-between items-center py-4">
                    <h4 className="font-semibold text-gray-900">
                      Assigned Students ({assignedStudents.length})
                    </h4>
                    <button
                      onClick={() => {
                        setShowAssignModal(true)
                        setAssignSearchTerm('')
                        setSelectedStudents([])
                        setShowUnassignedOnly(false)
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium text-sm"
                    >
                      <UserPlusIcon className="w-4 h-4" />
                      Assign Students
                    </button>
                  </div>

                  {assignedStudents.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                      <p>No students assigned yet</p>
                      <p className="text-sm mt-1">Click "Assign Students" to get started</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {assignedStudents.map(student => (
                        <div key={student.id} className="p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 text-sm truncate">
                                {`${student.first_name || ''} ${student.last_name || ''}`.trim() || student.display_name || 'Student'}
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

      {/* Assign Students Modal */}
      {showAssignModal && selectedAdvisor && (
        <ModalOverlay onClose={() => { setShowAssignModal(false); setSelectedStudents([]) }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                Assign Students to {selectedAdvisor.first_name || selectedAdvisor.display_name || 'Advisor'}
              </h3>
              <button
                onClick={() => {
                  setShowAssignModal(false)
                  setSelectedStudents([])
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 border-b space-y-3">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={assignSearchTerm}
                  onChange={(e) => setAssignSearchTerm(e.target.value)}
                  placeholder="Search students..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
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
                <span className="text-sm text-gray-600">Show unassigned only</span>
              </div>
              {selectedStudents.length > 0 && (
                <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-medium text-blue-900">
                    {selectedStudents.length} student{selectedStudents.length > 1 ? 's' : ''} selected
                  </p>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 max-h-80">
              {getStudentsForModal().length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>{showUnassignedOnly ? 'No unassigned students found' : 'No students available'}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {getStudentsForModal().map(student => (
                    <button
                      key={student.id}
                      onClick={() => toggleStudentSelection(student.id)}
                      disabled={assignLoading}
                      className={`w-full text-left p-3 rounded-lg border transition-all disabled:opacity-50 flex items-center gap-3 ${
                        selectedStudents.includes(student.id)
                          ? 'border-optio-purple bg-purple-50'
                          : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedStudents.includes(student.id)
                          ? 'bg-optio-purple border-optio-purple'
                          : 'border-gray-300'
                      }`}>
                        {selectedStudents.includes(student.id) && (
                          <CheckCircleIcon className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">
                          {`${student.first_name || ''} ${student.last_name || ''}`.trim() || student.display_name || 'Student'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{student.email}</p>
                        {!showUnassignedOnly && student.advisor_count > 0 && (
                          <p className="text-xs text-purple-600 mt-0.5">
                            {student.advisor_count} advisor{student.advisor_count > 1 ? 's' : ''}
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
                  setSelectedStudents([])
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignStudents}
                disabled={selectedStudents.length === 0 || assignLoading}
                className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {assignLoading ? 'Assigning...' : `Assign ${selectedStudents.length || ''} Student${selectedStudents.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}
