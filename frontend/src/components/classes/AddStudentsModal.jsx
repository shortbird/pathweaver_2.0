import React, { useState, useEffect } from 'react'
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { ModalOverlay } from '../ui'

/**
 * AddStudentsModal - Select students to enroll in a class
 */
export default function AddStudentsModal({
  orgId,
  classId,
  existingStudentIds = [],
  onClose,
  onSubmit,
}) {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchOrgStudents()
  }, [orgId])

  const fetchOrgStudents = async () => {
    try {
      setLoading(true)
      // Get all students from the organization
      const response = await api.get(`/api/admin/organizations/${orgId}/users?role=student`)
      if (response.data.success || response.data.users) {
        // Filter out already enrolled students
        const existingSet = new Set(existingStudentIds)
        const available = (response.data.users || []).filter((u) => !existingSet.has(u.id))
        setStudents(available)
      }
    } catch (error) {
      console.error('Failed to fetch students:', error)
      toast.error('Failed to load available students')
    } finally {
      setLoading(false)
    }
  }

  const toggleStudent = (studentId) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(studentId)) {
        newSet.delete(studentId)
      } else {
        newSet.add(studentId)
      }
      return newSet
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === filteredStudents.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredStudents.map((s) => s.id)))
    }
  }

  const handleSubmit = async () => {
    if (selectedIds.size === 0) return

    setSubmitting(true)
    try {
      await onSubmit(Array.from(selectedIds))
    } finally {
      setSubmitting(false)
    }
  }

  const filteredStudents = students.filter((student) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      (student.display_name || '').toLowerCase().includes(term) ||
      (student.email || '').toLowerCase().includes(term) ||
      (student.first_name || '').toLowerCase().includes(term) ||
      (student.last_name || '').toLowerCase().includes(term)
    )
  })

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
              <UsersIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Add Students</h2>
              <p className="text-sm text-gray-500">
                {selectedIds.size} selected
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search students..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* Student List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple"></div>
              <span className="ml-2 text-gray-500">Loading students...</span>
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No available students in this organization
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No students match your search
            </div>
          ) : (
            <div className="space-y-2">
              {/* Select All */}
              <button
                onClick={toggleAll}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left"
              >
                <div
                  className={`w-5 h-5 rounded border flex items-center justify-center ${
                    selectedIds.size === filteredStudents.length
                      ? 'bg-optio-purple border-optio-purple'
                      : 'border-gray-300'
                  }`}
                >
                  {selectedIds.size === filteredStudents.length && (
                    <CheckIcon className="w-3.5 h-3.5 text-white" />
                  )}
                </div>
                <span className="font-medium text-gray-700">
                  Select All ({filteredStudents.length})
                </span>
              </button>

              <hr className="my-2" />

              {/* Student Items */}
              {filteredStudents.map((student) => {
                const displayName =
                  student.display_name ||
                  `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
                  student.email
                const isSelected = selectedIds.has(student.id)

                return (
                  <button
                    key={student.id}
                    onClick={() => toggleStudent(student.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
                      isSelected ? 'bg-optio-purple/5' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded border flex items-center justify-center ${
                        isSelected
                          ? 'bg-optio-purple border-optio-purple'
                          : 'border-gray-300'
                      }`}
                    >
                      {isSelected && <CheckIcon className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{displayName}</p>
                      {displayName !== student.email && (
                        <p className="text-sm text-gray-500 truncate">{student.email}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || selectedIds.size === 0}
            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {submitting
              ? 'Adding...'
              : `Add ${selectedIds.size} Student${selectedIds.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
