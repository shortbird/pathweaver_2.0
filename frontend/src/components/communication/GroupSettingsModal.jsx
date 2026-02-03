import React, { useState, useEffect } from 'react'
import {
  XMarkIcon,
  UserPlusIcon,
  TrashIcon,
  ArrowRightOnRectangleIcon,
  PencilIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import {
  useGroup,
  useUpdateGroup,
  useAddMember,
  useRemoveMember,
  useLeaveGroup,
  useAvailableMembers
} from '../../hooks/api/useGroupMessages'

const GroupSettingsModal = ({ isOpen, onClose, group }) => {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('members')
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddMembers, setShowAddMembers] = useState(false)

  const { data: groupData, refetch: refetchGroup } = useGroup(group?.id, {
    enabled: !!group?.id
  })

  const { data: availableMembersData } = useAvailableMembers(group?.id, {
    enabled: !!group?.id && showAddMembers
  })

  const updateGroupMutation = useUpdateGroup()
  const addMemberMutation = useAddMember()
  const removeMemberMutation = useRemoveMember()
  const leaveGroupMutation = useLeaveGroup()

  const groupDetails = groupData?.group || group
  const members = groupDetails?.members || []
  const availableMembers = availableMembersData?.available_members || []

  // Check if current user is admin
  const isAdmin = members.some(m => m.user_id === user?.id && m.role === 'admin')

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen && groupDetails) {
      setEditName(groupDetails.name || '')
      setEditDescription(groupDetails.description || '')
      setIsEditing(false)
      setShowAddMembers(false)
      setSearchQuery('')
    }
  }, [isOpen, groupDetails])

  const handleSaveEdit = async () => {
    if (!editName.trim()) return

    try {
      await updateGroupMutation.mutateAsync({
        groupId: group.id,
        name: editName.trim(),
        description: editDescription.trim() || null
      })
      setIsEditing(false)
      refetchGroup()
    } catch (error) {
      // Error handled by mutation
    }
  }

  const handleAddMember = async (userId) => {
    try {
      await addMemberMutation.mutateAsync({
        groupId: group.id,
        userId
      })
      refetchGroup()
    } catch (error) {
      // Error handled by mutation
    }
  }

  const handleRemoveMember = async (userId) => {
    if (!confirm('Are you sure you want to remove this member?')) return

    try {
      await removeMemberMutation.mutateAsync({
        groupId: group.id,
        userId
      })
      refetchGroup()
    } catch (error) {
      // Error handled by mutation
    }
  }

  const handleLeaveGroup = async () => {
    if (!confirm('Are you sure you want to leave this group?')) return

    try {
      await leaveGroupMutation.mutateAsync(group.id)
      onClose()
    } catch (error) {
      // Error handled by mutation
    }
  }

  // Filter members by search
  const filteredMembers = React.useMemo(() => {
    if (!searchQuery.trim()) return members
    const query = searchQuery.toLowerCase().trim()
    return members.filter(m => {
      const name = m.user?.display_name ||
        `${m.user?.first_name || ''} ${m.user?.last_name || ''}`.trim()
      return name.toLowerCase().includes(query)
    })
  }, [members, searchQuery])

  // Filter available members by search
  const filteredAvailable = React.useMemo(() => {
    if (!searchQuery.trim()) return availableMembers
    const query = searchQuery.toLowerCase().trim()
    return availableMembers.filter(m => {
      const name = m.display_name || `${m.first_name || ''} ${m.last_name || ''}`.trim()
      return name.toLowerCase().includes(query)
    })
  }, [availableMembers, searchQuery])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Group Settings</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => { setActiveTab('members'); setShowAddMembers(false) }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'members'
                ? 'text-optio-purple border-b-2 border-optio-purple'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Members ({members.length})
          </button>
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'details'
                ? 'text-optio-purple border-b-2 border-optio-purple'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Details
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'members' && (
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search members..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                />
              </div>

              {/* Add Members Button (Admin only) */}
              {isAdmin && !showAddMembers && (
                <button
                  onClick={() => setShowAddMembers(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 text-optio-purple border border-optio-purple rounded-lg hover:bg-optio-purple/5 transition-colors"
                >
                  <UserPlusIcon className="w-5 h-5" />
                  Add Members
                </button>
              )}

              {/* Add Members View */}
              {showAddMembers && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-700">Add Members</h3>
                    <button
                      onClick={() => setShowAddMembers(false)}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>

                  {filteredAvailable.length > 0 ? (
                    <div className="border border-gray-200 rounded-lg divide-y">
                      {filteredAvailable.map(member => {
                        const name = member.display_name ||
                          `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Unknown'
                        return (
                          <div
                            key={member.id}
                            className="flex items-center justify-between p-3"
                          >
                            <div className="flex items-center gap-3">
                              {member.avatar_url ? (
                                <img
                                  src={member.avatar_url}
                                  alt={name}
                                  className="w-8 h-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-optio-purple font-medium text-sm">
                                  {name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="text-sm text-gray-900">{name}</span>
                            </div>

                            <button
                              onClick={() => handleAddMember(member.id)}
                              disabled={addMemberMutation.isPending}
                              className="p-2 text-optio-purple hover:bg-optio-purple/10 rounded-full transition-colors disabled:opacity-50"
                            >
                              <UserPlusIcon className="w-4 h-4" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No more users available to add
                    </p>
                  )}
                </div>
              )}

              {/* Member List */}
              {!showAddMembers && (
                <div className="border border-gray-200 rounded-lg divide-y">
                  {filteredMembers.map(member => {
                    const memberUser = member.user || {}
                    const name = memberUser.display_name ||
                      `${memberUser.first_name || ''} ${memberUser.last_name || ''}`.trim() || 'Unknown'
                    const isCurrentUser = member.user_id === user?.id
                    const isMemberAdmin = member.role === 'admin'

                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3"
                      >
                        <div className="flex items-center gap-3">
                          {memberUser.avatar_url ? (
                            <img
                              src={memberUser.avatar_url}
                              alt={name}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-optio-purple font-medium text-sm">
                              {name.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-900">{name}</span>
                              {isCurrentUser && (
                                <span className="text-xs text-gray-500">(You)</span>
                              )}
                            </div>
                            {isMemberAdmin && (
                              <span className="inline-flex items-center gap-1 text-xs text-optio-purple">
                                <ShieldCheckIcon className="w-3 h-3" />
                                Admin
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Remove button (admin can remove others, not themselves) */}
                        {isAdmin && !isCurrentUser && (
                          <button
                            onClick={() => handleRemoveMember(member.user_id)}
                            disabled={removeMemberMutation.isPending}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors disabled:opacity-50"
                            title="Remove member"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* Group Info */}
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Group Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={100}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                      maxLength={500}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      disabled={!editName.trim() || updateGroupMutation.isPending}
                      className="flex-1 py-2 bg-optio-purple text-white rounded-lg hover:bg-optio-purple/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <CheckIcon className="w-4 h-4" />
                      Save
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-gray-700">Group Name</label>
                      {isAdmin && (
                        <button
                          onClick={() => setIsEditing(true)}
                          className="text-optio-purple hover:underline text-sm flex items-center gap-1"
                        >
                          <PencilIcon className="w-3 h-3" />
                          Edit
                        </button>
                      )}
                    </div>
                    <p className="text-gray-900">{groupDetails?.name}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <p className="text-gray-900">
                      {groupDetails?.description || 'No description'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Created
                    </label>
                    <p className="text-gray-900">
                      {groupDetails?.created_at
                        ? new Date(groupDetails.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })
                        : 'Unknown'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLeaveGroup}
            disabled={leaveGroupMutation.isPending}
            className="w-full py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5" />
            Leave Group
          </button>
        </div>
      </div>
    </div>
  )
}

export default GroupSettingsModal
