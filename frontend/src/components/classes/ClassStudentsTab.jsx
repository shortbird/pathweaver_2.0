import React, { useState, useEffect } from 'react'
import {
  PlusIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import classService from '../../services/classService'
import AddStudentsModal from './AddStudentsModal'
import StudentProgressCard from './StudentProgressCard'

/**
 * ClassStudentsTab - Manage students enrolled in a class
 */
export default function ClassStudentsTab({ orgId, classId, classData, onUpdate }) {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    fetchStudents()
  }, [orgId, classId])

  const fetchStudents = async () => {
    try {
      setLoading(true)
      const response = await classService.getClassStudents(orgId, classId, { withProgress: true })
      if (response.success) {
        setStudents(response.students || [])
      } else {
        toast.error(response.error || 'Failed to load students')
      }
    } catch (error) {
      console.error('Failed to fetch students:', error)
      toast.error('Failed to load students')
    } finally {
      setLoading(false)
    }
  }

  const handleWithdrawStudent = async (studentId) => {
    if (!confirm('Are you sure you want to withdraw this student from the class?')) {
      return
    }

    try {
      const response = await classService.withdrawStudent(orgId, classId, studentId)
      if (response.success) {
        toast.success('Student withdrawn successfully')
        fetchStudents()
        onUpdate?.()
      } else {
        toast.error(response.error || 'Failed to withdraw student')
      }
    } catch (error) {
      console.error('Failed to withdraw student:', error)
      toast.error(error.response?.data?.error || 'Failed to withdraw student')
    }
  }

  const handleAddStudents = async (studentIds) => {
    try {
      const response = await classService.enrollStudents(orgId, classId, studentIds)
      if (response.success) {
        toast.success(response.message || 'Students enrolled successfully')
        setShowAddModal(false)
        fetchStudents()
        onUpdate?.()
      } else {
        toast.error(response.error || 'Failed to enroll students')
      }
    } catch (error) {
      console.error('Failed to enroll students:', error)
      toast.error(error.response?.data?.error || 'Failed to enroll students')
    }
  }

  const filteredStudents = students.filter((s) => {
    if (!searchTerm) return true
    const student = s.student || {}
    const term = searchTerm.toLowerCase()
    return (
      (student.display_name || '').toLowerCase().includes(term) ||
      (student.email || '').toLowerCase().includes(term) ||
      (student.first_name || '').toLowerCase().includes(term) ||
      (student.last_name || '').toLowerCase().includes(term)
    )
  })

  // Separate completed and active students
  const completedStudents = filteredStudents.filter((s) => s.progress?.is_complete)
  const activeStudents = filteredStudents.filter((s) => !s.progress?.is_complete)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        <span className="ml-3 text-gray-500">Loading students...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search students..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          />
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          <PlusIcon className="w-5 h-5" />
          Add Students
        </button>
      </div>

      {/* Empty State */}
      {students.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 mb-4">No students enrolled in this class yet</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-optio-purple text-white rounded-lg hover:bg-optio-purple/90 transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            Enroll Students
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Students */}
          {activeStudents.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Active ({activeStudents.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeStudents.map((enrollment) => (
                  <StudentProgressCard
                    key={enrollment.student_id}
                    enrollment={enrollment}
                    xpThreshold={classData.xp_threshold}
                    onWithdraw={() => handleWithdrawStudent(enrollment.student_id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed Students */}
          {completedStudents.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium text-green-700 mb-3">
                <CheckCircleIcon className="w-5 h-5" />
                Completed ({completedStudents.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedStudents.map((enrollment) => (
                  <StudentProgressCard
                    key={enrollment.student_id}
                    enrollment={enrollment}
                    xpThreshold={classData.xp_threshold}
                    onWithdraw={() => handleWithdrawStudent(enrollment.student_id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* No results */}
          {filteredStudents.length === 0 && searchTerm && (
            <div className="text-center py-8 text-gray-500">
              No students match your search
            </div>
          )}
        </div>
      )}

      {/* Add Students Modal */}
      {showAddModal && (
        <AddStudentsModal
          orgId={orgId}
          classId={classId}
          existingStudentIds={students.map((s) => s.student_id)}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddStudents}
        />
      )}
    </div>
  )
}
