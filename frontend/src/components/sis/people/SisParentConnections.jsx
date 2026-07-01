import React from 'react'
import usePeopleTabState from '../../../hooks/usePeopleTabState'
import { RelationshipsSection, AddParentConnectionModal } from '../../organization/people'

/**
 * Parent-Student connection management for the SIS Families page. Reuses the
 * shared usePeopleTabState hook + RelationshipsSection restricted to the parent
 * view, scoped to the SIS-selected org. Parity with the legacy org People tab's
 * parent connections (link existing parent or invite a new one).
 */
const SisParentConnections = ({ orgId, onChanged }) => {
  const state = usePeopleTabState({ orgId, orgSlug: '', users: [], onUpdate: onChanged || (() => {}) })

  if (!orgId) return null

  return (
    <div className="mt-8">
      <RelationshipsSection
        only="parents"
        title="Parent connections"
        subtitle="Link parents to their students"
        showRelationships={state.showRelationships}
        setShowRelationships={state.setShowRelationships}
        loading={state.loading}
        relationshipView={state.relationshipView}
        setRelationshipView={state.setRelationshipView}
        advisors={state.advisors}
        selectedAdvisor={state.selectedAdvisor}
        assignedStudents={state.assignedStudents}
        expandedAdvisorId={state.expandedAdvisorId}
        handleSelectAdvisor={state.handleSelectAdvisor}
        handleUnassignStudent={state.handleUnassignStudent}
        setShowAssignModal={state.setShowAssignModal}
        allStudentsWithAdvisors={state.allStudentsWithAdvisors}
        parentLinks={state.parentLinks}
        handleDisconnectParentLink={state.handleDisconnectParentLink}
        setShowAddConnectionModal={state.setShowAddConnectionModal}
      />

      {state.showAddConnectionModal && (
        <AddParentConnectionModal
          connectionMode={state.connectionMode}
          setConnectionMode={state.setConnectionMode}
          parents={state.parents}
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
    </div>
  )
}

export default SisParentConnections
