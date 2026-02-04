import React from 'react'
import { Modal } from './people'
import {
  AdvisorStudentSection,
  AllStudentsOverview,
  ParentStudentSection
} from './connections'
import {
  AssignStudentsModal,
  AddParentConnectionModal
} from './people'
import {
  MagnifyingGlassIcon,
  UserPlusIcon,
  UsersIcon,
  CheckCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import useConnectionsTabState from '../../hooks/useConnectionsTabState'

export default function ConnectionsTab({ orgId }) {
  const state = useConnectionsTabState({ orgId })

  if (state.loading) {
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
              <p className="text-3xl font-bold">{state.advisors.length}</p>
              <p className="text-sm opacity-90">Advisors & Admins</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-optio-pink to-optio-purple p-6 rounded-lg text-white shadow-md">
          <div className="flex items-center gap-3">
            <UserPlusIcon className="w-10 h-10" />
            <div>
              <p className="text-sm opacity-90">Parent-Student</p>
              <p className="text-3xl font-bold">{state.parentLinks.length}</p>
              <p className="text-sm opacity-90">Active Connections</p>
            </div>
          </div>
        </div>
      </div>

      {/* Advisor-Student Connections Section */}
      <AdvisorStudentSection
        advisors={state.advisors}
        selectedAdvisor={state.selectedAdvisor}
        assignedStudents={state.assignedStudents}
        expandedAdvisorId={state.expandedAdvisorId}
        handleSelectAdvisor={state.handleSelectAdvisor}
        handleUnassignStudent={state.handleUnassignStudent}
        setShowAssignModal={state.setShowAssignModal}
      />

      {/* All Students Overview Section */}
      <AllStudentsOverview
        allStudentsWithAdvisors={state.allStudentsWithAdvisors}
        handleViewStudentAdvisors={state.handleViewStudentAdvisors}
      />

      {/* Parent-Student Connections Section */}
      <ParentStudentSection
        searchTerm={state.searchTerm}
        setSearchTerm={state.setSearchTerm}
        filteredParentLinks={state.filteredParentLinks}
        setShowAddConnectionModal={state.setShowAddConnectionModal}
        setSelectedLink={state.setSelectedLink}
        setShowDisconnectModal={state.setShowDisconnectModal}
      />

      {/* Assign Student Modal */}
      {state.showAssignModal && (
        <AssignStudentsModal
          selectedAdvisor={state.selectedAdvisor}
          searchTerm={state.searchTerm}
          setSearchTerm={state.setSearchTerm}
          showUnassignedOnly={state.showUnassignedOnly}
          setShowUnassignedOnly={state.setShowUnassignedOnly}
          selectedStudentsForAdvisor={state.selectedStudentsForAdvisor}
          toggleStudentForAdvisor={state.toggleStudentForAdvisor}
          getStudentsForAssignModal={state.getStudentsForAssignModal}
          assignLoading={state.assignLoading}
          handleAssignStudents={state.handleAssignStudents}
          onClose={() => {
            state.setShowAssignModal(false)
            state.setSelectedStudentsForAdvisor([])
            state.setSearchTerm('')
            state.setShowUnassignedOnly(false)
          }}
        />
      )}

      {/* Add Parent-Student Connection Modal */}
      {state.showAddConnectionModal && (
        <AddParentConnectionModal
          connectionMode={state.connectionMode}
          setConnectionMode={state.setConnectionMode}
          parents={state.filteredParents}
          selectedParent={state.selectedParent}
          setSelectedParent={state.setSelectedParent}
          inviteEmail={state.inviteEmail}
          setInviteEmail={state.setInviteEmail}
          inviteName={state.inviteName}
          setInviteName={state.setInviteName}
          students={state.students}
          selectedStudentIds={state.selectedStudentIds}
          toggleStudentSelection={state.toggleStudentSelection}
          addConnectionLoading={state.addConnectionLoading}
          inviteLoading={state.inviteLoading}
          handleAddConnection={state.handleAddConnection}
          handleInviteParent={state.handleInviteParent}
          resetModalState={state.resetModalState}
          onClose={() => state.setShowAddConnectionModal(false)}
        />
      )}

      {/* Student Advisors Modal */}
      {state.showStudentAdvisorsModal && state.selectedStudentForAdvisors && (
        <Modal
          title={`Advisors for ${state.selectedStudentForAdvisors.display_name || `${state.selectedStudentForAdvisors.first_name} ${state.selectedStudentForAdvisors.last_name}`}`}
          onClose={() => {
            state.setShowStudentAdvisorsModal(false)
            state.setSelectedStudentForAdvisors(null)
          }}
        >
          <div className="px-6 py-4">
            {state.selectedStudentForAdvisors.advisors?.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <UsersIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No advisors assigned to this student</p>
                <p className="text-sm mt-1">Use the advisor cards above to assign advisors</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-4">
                  This student has {state.selectedStudentForAdvisors.advisors.length} advisor{state.selectedStudentForAdvisors.advisors.length > 1 ? 's' : ''} assigned:
                </p>
                {state.selectedStudentForAdvisors.advisors.map(advisor => (
                  <div key={advisor.assignment_id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                    <div>
                      <p className="font-medium text-gray-900">{advisor.display_name}</p>
                      <p className="text-sm text-gray-500">{advisor.email}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Assigned {new Date(advisor.assigned_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => state.handleUnassignAdvisorFromStudent(
                        state.selectedStudentForAdvisors.id,
                        advisor.advisor_id,
                        advisor.display_name
                      )}
                      className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
            <button
              onClick={() => {
                state.setShowStudentAdvisorsModal(false)
                state.setSelectedStudentForAdvisors(null)
              }}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* Disconnect Parent Link Modal */}
      {state.showDisconnectModal && (
        <Modal
          title="Disconnect Parent-Student Link"
          onClose={() => {
            state.setShowDisconnectModal(false)
            state.setSelectedLink(null)
          }}
          onConfirm={state.handleDisconnectParentLink}
          confirmText="Disconnect"
          confirmClass="bg-red-600 hover:bg-red-700"
        >
          <p className="text-gray-700">
            Are you sure you want to disconnect <strong>{state.selectedLink?.parent?.first_name} {state.selectedLink?.parent?.last_name}</strong> from{' '}
            <strong>{state.selectedLink?.student?.first_name} {state.selectedLink?.student?.last_name}</strong>?
          </p>
          <p className="text-sm text-red-600 mt-2">
            This action cannot be undone. The parent will lose access to this student's data.
          </p>
        </Modal>
      )}
    </div>
  )
}
