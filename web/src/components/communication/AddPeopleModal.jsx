import React, { useState } from 'react'
import { XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import ModalOverlay from '../ui/ModalOverlay'
import { useAvailableMembers, useAddMember } from '../../hooks/api/useGroupMessages'
import { AvailableMembersList } from './GroupSettingsModal'

/**
 * "Add people" for a group the school owns (ticket 0b85c3f1: "We need a way
 * to add someone to a group thread who is not already on it."). The office
 * reads such a group as the school, not as a member, so Group Settings -- a
 * member's admin tools -- is not offered; this is only the picker, over the
 * school's own routes (`source`), offering the school's staff, students and
 * parents who are not in the group yet.
 */
const AddPeopleModal = ({ isOpen, onClose, group, source }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const { data } = useAvailableMembers(group?.id, { source, enabled: !!group?.id && isOpen })
  const addMemberMutation = useAddMember()
  const people = data?.available_members || []
  const query = searchQuery.toLowerCase().trim()
  const shown = query
    ? people.filter(m => (`${m.first_name || ''} ${m.last_name || ''}`.trim() || m.display_name || '')
      .toLowerCase().includes(query))
    : people

  if (!isOpen) return null

  const add = async (userId) => {
    try {
      await addMemberMutation.mutateAsync({ groupId: group.id, userId, source })
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div role="dialog" aria-label="Add people"
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Add people</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search people..."
              aria-label="Search people"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
          </div>
          <AvailableMembersList members={shown} onAdd={add} busy={addMemberMutation.isPending} />
        </div>
      </div>
    </ModalOverlay>
  )
}


export default AddPeopleModal
