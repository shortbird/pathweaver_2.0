import React, { useState, useEffect } from 'react'
import { XMarkIcon, MagnifyingGlassIcon, UserPlusIcon, CheckIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { friendsAPI, observerAPI } from '../../services/api'
import { useMessagingContacts } from '../../hooks/api/useDirectMessages'
import { useCreateGroup } from '../../hooks/api/useGroupMessages'

const CreateGroupModal = ({ isOpen, onClose, onGroupCreated }) => {
  const { user } = useAuth()
  const [groupName, setGroupName] = useState('')
  const [description, setDescription] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMembers, setSelectedMembers] = useState([])
  const [error, setError] = useState('')

  const createGroupMutation = useCreateGroup()

  // Fetch potential members (friends, contacts)
  const { data: friendsData } = useQuery({
    queryKey: ['friends', user?.id],
    queryFn: async () => {
      const response = await friendsAPI.getFriends()
      return response.data
    },
    enabled: !!user?.id
  })

  const { data: contactsData } = useMessagingContacts(user?.id, {
    enabled: !!user?.id
  })

  const friends = friendsData?.friends || []
  const contacts = contactsData?.contacts || []

  // Combine and dedupe available members
  const availableMembers = React.useMemo(() => {
    const memberMap = new Map()

    friends.forEach(f => {
      memberMap.set(f.id, {
        id: f.id,
        displayName: f.display_name || `${f.first_name || ''} ${f.last_name || ''}`.trim(),
        firstName: f.first_name,
        lastName: f.last_name,
        avatarUrl: f.avatar_url,
        role: f.role
      })
    })

    contacts.forEach(c => {
      if (!memberMap.has(c.id)) {
        memberMap.set(c.id, {
          id: c.id,
          displayName: c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
          firstName: c.first_name,
          lastName: c.last_name,
          avatarUrl: c.avatar_url,
          role: c.role
        })
      }
    })

    return Array.from(memberMap.values())
  }, [friends, contacts])

  // Filter by search
  const filteredMembers = React.useMemo(() => {
    if (!searchQuery.trim()) return availableMembers
    const query = searchQuery.toLowerCase().trim()
    return availableMembers.filter(m =>
      m.displayName?.toLowerCase().includes(query) ||
      m.firstName?.toLowerCase().includes(query) ||
      m.lastName?.toLowerCase().includes(query)
    )
  }, [availableMembers, searchQuery])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setGroupName('')
      setDescription('')
      setSearchQuery('')
      setSelectedMembers([])
      setError('')
    }
  }, [isOpen])

  const toggleMember = (member) => {
    setSelectedMembers(prev => {
      const isSelected = prev.some(m => m.id === member.id)
      if (isSelected) {
        return prev.filter(m => m.id !== member.id)
      } else {
        return [...prev, member]
      }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!groupName.trim()) {
      setError('Group name is required')
      return
    }

    if (groupName.length > 100) {
      setError('Group name must be 100 characters or less')
      return
    }

    try {
      const result = await createGroupMutation.mutateAsync({
        name: groupName.trim(),
        description: description.trim() || undefined,
        memberIds: selectedMembers.map(m => m.id)
      })

      onGroupCreated?.(result.group)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create group')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Create Group Chat</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Group Name */}
            <div>
              <label htmlFor="groupName" className="block text-sm font-medium text-gray-700 mb-1">
                Group Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="groupName"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Enter group name"
                maxLength={100}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">{groupName.length}/100 characters</p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this group about?"
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
              />
            </div>

            {/* Member Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Add Members (optional)
              </label>

              {/* Selected Members */}
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedMembers.map(member => (
                    <span
                      key={member.id}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-optio-purple/10 text-optio-purple rounded-full text-sm"
                    >
                      {member.displayName}
                      <button
                        type="button"
                        onClick={() => toggleMember(member)}
                        className="p-0.5 hover:bg-optio-purple/20 rounded-full"
                      >
                        <XMarkIcon className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Search */}
              <div className="relative mb-2">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search contacts..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                />
              </div>

              {/* Member List */}
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                {filteredMembers.length > 0 ? (
                  filteredMembers.map(member => {
                    const isSelected = selectedMembers.some(m => m.id === member.id)
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => toggleMember(member)}
                        className={`w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors ${
                          isSelected ? 'bg-optio-purple/5' : ''
                        }`}
                      >
                        {/* Avatar */}
                        {member.avatarUrl ? (
                          <img
                            src={member.avatarUrl}
                            alt={member.displayName}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-optio-purple font-medium text-sm">
                            {member.displayName?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                        )}

                        {/* Name */}
                        <span className="flex-1 text-left text-sm text-gray-900">
                          {member.displayName}
                        </span>

                        {/* Check indicator */}
                        {isSelected && (
                          <CheckIcon className="w-5 h-5 text-optio-purple" />
                        )}
                      </button>
                    )
                  })
                ) : (
                  <div className="p-4 text-center text-sm text-gray-500">
                    {searchQuery ? 'No contacts found' : 'No contacts available'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createGroupMutation.isPending || !groupName.trim()}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {createGroupMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <UserPlusIcon className="w-4 h-4" />
                  Create Group
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateGroupModal
