import React, { useState, useEffect } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { X, UserPlus, Users, Search } from 'lucide-react'

const AdvisorAssignments = () => {
  const [advisors, setAdvisors] = useState([])
  const [selectedAdvisor, setSelectedAdvisor] = useState(null)
  const [assignedStudents, setAssignedStudents] = useState([])
  const [unassignedStudents, setUnassignedStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [assignLoading, setAssignLoading] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchAdvisors()
    fetchUnassignedStudents()
  }, [])

  const fetchAdvisors = async () => {
    try {
      const response = await api.get('/api/admin/advisors')
      setAdvisors(response.data.advisors || [])
    } catch (error) {
      toast.error('Failed to load advisors')
      console.error('Error fetching advisors:', error)
    } finally {
      setLoading(false)
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
  }

  const handleAssignStudent = async (studentId) => {
    if (!selectedAdvisor) return

    setAssignLoading(true)
    try {
      await api.post(`/api/admin/advisors/${selectedAdvisor.id}/students`, {
        student_id: studentId
      })
      toast.success('Student assigned successfully')

      // Refresh data
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

      // Refresh data
      fetchAdvisorStudents(selectedAdvisor.id)
      fetchUnassignedStudents()
      fetchAdvisors()
    } catch (error) {
      toast.error('Failed to unassign student')
      console.error('Error unassigning student:', error)
    }
  }

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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Advisor-Student Assignments</h2>
        <p className="text-gray-600">Manage which students are assigned to which advisors</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Advisors List */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-semibold">Advisors ({advisors.length})</h3>
          </div>

          {advisors.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No advisors found</p>
              <p className="text-sm mt-1">Create users with the "advisor" role first</p>
            </div>
          ) : (
            <div className="space-y-2">
              {advisors.map(advisor => (
                <button
                  key={advisor.id}
                  onClick={() => handleSelectAdvisor(advisor)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedAdvisor?.id === advisor.id
                      ? 'border-purple-600 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {advisor.display_name || `${advisor.first_name} ${advisor.last_name}`}
                      </p>
                      <p className="text-sm text-gray-500">{advisor.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-purple-600">
                        {advisor.assigned_students_count || 0} students
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Panel - Assigned Students */}
        <div className="bg-white rounded-lg shadow p-6">
          {selectedAdvisor ? (
            <>
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-semibold">
                    {selectedAdvisor.display_name || `${selectedAdvisor.first_name} ${selectedAdvisor.last_name}`}'s Students
                  </h3>
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-primary text-white rounded-lg hover:opacity-90 font-medium"
                  >
                    <UserPlus className="w-4 h-4" />
                    Assign Student
                  </button>
                </div>
                <p className="text-sm text-gray-500">
                  {assignedStudents.length} student{assignedStudents.length !== 1 ? 's' : ''} assigned
                </p>
              </div>

              {assignedStudents.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
                  <p>No students assigned yet</p>
                  <p className="text-sm mt-1">Click "Assign Student" to get started</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {assignedStudents.map(student => (
                    <div
                      key={student.id}
                      className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">
                            {student.display_name || `${student.first_name} ${student.last_name}`}
                          </p>
                          <p className="text-sm text-gray-500">{student.email}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            Assigned {new Date(student.assigned_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => handleUnassignStudent(student.id)}
                          className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          Unassign
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-gray-500">
              <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">Select an advisor</p>
              <p className="text-sm mt-1">Choose an advisor from the left to view and manage their students</p>
            </div>
          )}
        </div>
      </div>

      {/* Assign Student Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-xl font-bold">Assign Student to {selectedAdvisor?.display_name}</h3>
              <button
                onClick={() => setShowAssignModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="px-6 py-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search students by name or email..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>

            {/* Students List */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {filteredUnassignedStudents.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>No unassigned students found</p>
                  {searchTerm && (
                    <p className="text-sm mt-1">Try adjusting your search</p>
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
                      <p className="font-medium text-gray-900">
                        {student.display_name || `${student.first_name} ${student.last_name}`}
                      </p>
                      <p className="text-sm text-gray-500">{student.email}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t bg-gray-50">
              <p className="text-sm text-gray-600">
                {filteredUnassignedStudents.length} unassigned student{filteredUnassignedStudents.length !== 1 ? 's' : ''} available
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdvisorAssignments
