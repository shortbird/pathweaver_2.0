import React, { Suspense, lazy } from 'react'
import CreateUsernameStudentModal from './CreateUsernameStudentModal'
import {
  Modal,
  EditUserModal,
  InvitationLinksSection,
  PendingInvitationsSection,
  MembersTable,
  RelationshipsSection,
  AssignStudentsModal,
  AddParentConnectionModal
} from './people'
import {
  ChevronDownIcon,
  UserPlusIcon,
  UsersIcon,
  EnvelopeIcon
} from '@heroicons/react/24/outline'
import usePeopleTabState from '../../hooks/usePeopleTabState'

const BulkUserImport = lazy(() => import('../admin/BulkUserImport'))
const InviteUserModal = lazy(() => import('../admin/InviteUserModal'))

export default function PeopleTab({ orgId, orgSlug, users, onUpdate }) {
  const state = usePeopleTabState({ orgId, orgSlug, users, onUpdate })

  return (
    <div className="space-y-4">
      {/* Quick Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search members..."
            value={state.searchTerm}
            onChange={(e) => state.setSearchTerm(e.target.value)}
            className="border border-gray-200 rounded-lg px-4 py-2 w-64 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
          />
          <select
            value={state.roleFilter}
            onChange={(e) => state.setRoleFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
          >
            <option value="all">All Roles</option>
            <option value="student">Student</option>
            <option value="parent">Parent</option>
            <option value="advisor">Advisor</option>
            <option value="org_admin">Org Admin</option>
            <option value="observer">Observer</option>
          </select>
        </div>

        <div className="flex items-center gap-2 relative">
          {state.selectedUsers.size > 0 && (
            <button
              onClick={state.handleBulkRemove}
              disabled={state.bulkActionLoading}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {state.bulkActionLoading ? 'Removing...' : `Remove ${state.selectedUsers.size} Selected`}
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => state.setShowActionsDropdown(!state.showActionsDropdown)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90"
            >
              <UserPlusIcon className="w-5 h-5" />
              Add User
              <ChevronDownIcon className="w-4 h-4" />
            </button>

            {state.showActionsDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => state.setShowActionsDropdown(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                  <button
                    onClick={() => {
                      state.setShowActionsDropdown(false)
                      state.setShowInviteModal(true)
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <EnvelopeIcon className="w-4 h-4" />
                    Invite by Email
                  </button>
                  <button
                    onClick={() => {
                      state.setShowActionsDropdown(false)
                      state.setShowCreateUsernameModal(true)
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <UserPlusIcon className="w-4 h-4" />
                    Create Student (No Email)
                  </button>
                  <button
                    onClick={() => {
                      state.setShowActionsDropdown(false)
                      state.setShowBulkImportModal(true)
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <UsersIcon className="w-4 h-4" />
                    Bulk Import CSV
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Two Column Layout: Invitation Links and Pending Invitations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InvitationLinksSection
          showInvitationLinks={state.showInvitationLinks}
          setShowInvitationLinks={state.setShowInvitationLinks}
          linksLoading={state.linksLoading}
          VALID_ROLES={state.VALID_ROLES}
          getLinkForRole={state.getLinkForRole}
          generating={state.generating}
          getRoleBadgeClass={state.getRoleBadgeClass}
          formatExpiration={state.formatExpiration}
          copiedLinkId={state.copiedLinkId}
          handleCopyLink={state.handleCopyLink}
          handleGenerateLink={state.handleGenerateLink}
          refreshConfirmRole={state.refreshConfirmRole}
          handleRefreshLinkRequest={state.handleRefreshLinkRequest}
          handleCancelRefresh={state.handleCancelRefresh}
          handleConfirmRefresh={state.handleConfirmRefresh}
        />

        <PendingInvitationsSection
          showPendingInvitations={state.showPendingInvitations}
          setShowPendingInvitations={state.setShowPendingInvitations}
          pendingInvitations={state.pendingInvitations}
          pendingLoading={state.pendingLoading}
          getRoleBadgeClass={state.getRoleBadgeClass}
          formatExpiration={state.formatExpiration}
        />
      </div>

      {/* Relationships Section */}
      <RelationshipsSection
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
        parentLinks={state.parentLinks}
        handleDisconnectParentLink={state.handleDisconnectParentLink}
        setShowAddConnectionModal={state.setShowAddConnectionModal}
      />

      {/* Members Table */}
      <MembersTable
        filteredUsers={state.filteredUsers}
        paginatedUsers={state.paginatedUsers}
        selectedUsers={state.selectedUsers}
        selectAllVisible={state.selectAllVisible}
        toggleUserSelection={state.toggleUserSelection}
        searchTerm={state.searchTerm}
        currentPage={state.currentPage}
        setCurrentPage={state.setCurrentPage}
        totalPages={state.totalPages}
        startIndex={state.startIndex}
        usersPerPage={state.usersPerPage}
        onEditUser={(user) => {
          state.setSelectedUser(user)
          state.setShowEditModal(true)
        }}
      />

      {/* Modals */}
      {state.showEditModal && state.selectedUser && (
        <EditUserModal
          orgId={orgId}
          user={state.selectedUser}
          onClose={() => {
            state.setShowEditModal(false)
            state.setSelectedUser(null)
          }}
          onSuccess={() => {
            state.setShowEditModal(false)
            state.setSelectedUser(null)
            onUpdate()
          }}
          onRemove={() => {
            state.handleRemoveUser(state.selectedUser.id)
            state.setShowEditModal(false)
            state.setSelectedUser(null)
          }}
        />
      )}

      {state.showCreateUsernameModal && (
        <CreateUsernameStudentModal
          orgId={orgId}
          orgSlug={orgSlug}
          onClose={() => state.setShowCreateUsernameModal(false)}
          onSuccess={() => onUpdate()}
        />
      )}

      {state.showInviteModal && (
        <Suspense fallback={
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        }>
          <InviteUserModal
            organizationId={orgId}
            onClose={() => state.setShowInviteModal(false)}
            onSuccess={() => {
              state.fetchPendingInvitations()
              onUpdate()
            }}
          />
        </Suspense>
      )}

      {state.showBulkImportModal && (
        <Modal
          title="Bulk Import Users"
          onClose={() => state.setShowBulkImportModal(false)}
        >
          <div className="p-6">
            <Suspense fallback={
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
              </div>
            }>
              <BulkUserImport
                organizationId={orgId}
                onImportComplete={() => {
                  state.setShowBulkImportModal(false)
                  onUpdate()
                }}
              />
            </Suspense>
          </div>
        </Modal>
      )}

      {/* Assign Students Modal */}
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

      {/* Add Parent Connection Modal */}
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
