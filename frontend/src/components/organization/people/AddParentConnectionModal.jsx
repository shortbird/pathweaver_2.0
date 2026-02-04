import React from 'react'
import { LinkIcon, EnvelopeIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import Modal from './Modal'

/**
 * Modal for adding parent-student connections.
 */
function AddParentConnectionModal({
  connectionMode,
  setConnectionMode,
  // Existing parent linking
  parents,
  selectedParent,
  setSelectedParent,
  // Invite new parent
  inviteEmail,
  setInviteEmail,
  inviteName,
  setInviteName,
  // Student selection
  students,
  selectedStudentIds,
  toggleStudentSelection,
  // Loading states
  addConnectionLoading,
  inviteLoading,
  // Handlers
  handleAddConnection,
  handleInviteParent,
  resetModalState,
  onClose
}) {
  const handleClose = () => {
    resetModalState()
    onClose()
  }

  return (
    <Modal
      title="Add Parent-Student Connection"
      onClose={handleClose}
    >
      <div className="flex-1 overflow-y-auto">
        {/* Mode Toggle */}
        <div className="px-6 py-4 border-b">
          <div className="flex rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => {
                setConnectionMode('existing')
                toggleStudentSelection(null) // Reset selection
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                connectionMode === 'existing'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <LinkIcon className="w-4 h-4" />
              Link Existing
            </button>
            <button
              onClick={() => {
                setConnectionMode('invite')
                setSelectedParent(null)
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                connectionMode === 'invite'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <EnvelopeIcon className="w-4 h-4" />
              Invite New
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-6">
          {connectionMode === 'existing' ? (
            <>
              {/* Select Parent */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Parent Account
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
                      }}
                      className="text-sm text-red-600 hover:text-red-800 font-medium"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                    {parents.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <p>No parent accounts found</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-200">
                        {parents.map(parent => (
                          <button
                            key={parent.id}
                            onClick={() => setSelectedParent(parent)}
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
                )}
              </div>

              {/* Select Students */}
              {selectedParent && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Student(s)
                  </label>
                  <StudentSelectionList
                    students={students}
                    selectedStudentIds={selectedStudentIds}
                    toggleStudentSelection={toggleStudentSelection}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              {/* Invite New Parent */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  Send an email invitation to a parent. When they accept, they'll be connected to the selected student(s).
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Parent's Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="parent@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Student(s) <span className="text-red-500">*</span>
                </label>
                <StudentSelectionList
                  students={students}
                  selectedStudentIds={selectedStudentIds}
                  toggleStudentSelection={toggleStudentSelection}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
        <button
          onClick={handleClose}
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
  )
}

/**
 * Reusable student selection list component.
 */
function StudentSelectionList({ students, selectedStudentIds, toggleStudentSelection }) {
  return (
    <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
      {students.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No students found</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {students.map(student => (
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
  )
}

export default AddParentConnectionModal
