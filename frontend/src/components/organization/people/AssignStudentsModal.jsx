import React from 'react'
import { MagnifyingGlassIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import Modal from './Modal'

/**
 * Modal for assigning students to an advisor.
 */
function AssignStudentsModal({
  selectedAdvisor,
  searchTerm,
  setSearchTerm,
  showUnassignedOnly,
  setShowUnassignedOnly,
  selectedStudentsForAdvisor,
  toggleStudentForAdvisor,
  getStudentsForAssignModal,
  assignLoading,
  handleAssignStudents,
  onClose
}) {
  const studentsToShow = getStudentsForAssignModal()

  return (
    <Modal
      title={`Assign Students to ${selectedAdvisor?.display_name || selectedAdvisor?.first_name}`}
      onClose={onClose}
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
        {studentsToShow.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>{showUnassignedOnly ? 'No unassigned students found' : 'No students available'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {studentsToShow.map(student => (
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
          onClick={onClose}
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
  )
}

export default AssignStudentsModal
