import React from 'react'
import usePeopleTabState from '../../../hooks/usePeopleTabState'
import { RelationshipsSection, AssignStudentsModal } from '../../organization/people'

/**
 * Advisor(Teacher)-Student assignment management for the SIS Staff page. Reuses
 * the shared usePeopleTabState hook + RelationshipsSection restricted to the
 * advisor view, scoped to the SIS-selected org. Parity with the legacy org
 * People tab's advisor assignments.
 */
const SisAdvisorAssignments = ({ orgId, onChanged }) => {
  const state = usePeopleTabState({ orgId, orgSlug: '', users: [], onUpdate: onChanged || (() => {}) })

  if (!orgId) return null

  return (
    <div className="mt-8">
      <RelationshipsSection
        only="advisors"
        title="Teacher assignments"
        subtitle="Assign students to their teachers"
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
            state.setShowUnassignedOnly(false)
          }}
        />
      )}
    </div>
  )
}

export default SisAdvisorAssignments
