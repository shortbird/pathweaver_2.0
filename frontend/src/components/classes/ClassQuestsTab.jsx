import React, { useState, useEffect } from 'react'
import {
  PlusIcon,
  TrashIcon,
  Bars3Icon,
  BookOpenIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import classService from '../../services/classService'
import AddQuestModal from './AddQuestModal'

/**
 * ClassQuestsTab - Manage quests assigned to a class
 */
export default function ClassQuestsTab({ orgId, classId, classData, onUpdate }) {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    fetchQuests()
  }, [orgId, classId])

  const fetchQuests = async () => {
    try {
      setLoading(true)
      const response = await classService.getClassQuests(orgId, classId)
      if (response.success) {
        setQuests(response.quests || [])
      } else {
        toast.error(response.error || 'Failed to load quests')
      }
    } catch (error) {
      console.error('Failed to fetch quests:', error)
      toast.error('Failed to load quests')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveQuest = async (questId) => {
    if (
      !confirm(
        'Are you sure you want to remove this quest from the class? XP already earned will still count.'
      )
    ) {
      return
    }

    try {
      const response = await classService.removeClassQuest(orgId, classId, questId)
      if (response.success) {
        toast.success('Quest removed from class')
        fetchQuests()
        onUpdate?.()
      } else {
        toast.error(response.error || 'Failed to remove quest')
      }
    } catch (error) {
      console.error('Failed to remove quest:', error)
      toast.error(error.response?.data?.error || 'Failed to remove quest')
    }
  }

  const handleAddQuest = async (questId) => {
    try {
      const response = await classService.addClassQuest(orgId, classId, questId)
      if (response.success) {
        toast.success('Quest added to class')
        setShowAddModal(false)
        fetchQuests()
        onUpdate?.()
      } else {
        toast.error(response.error || 'Failed to add quest')
      }
    } catch (error) {
      console.error('Failed to add quest:', error)
      toast.error(error.response?.data?.error || 'Failed to add quest')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        <span className="ml-3 text-gray-500">Loading quests...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-gray-600">
          Students earn XP by completing tasks from these quests
        </p>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          <PlusIcon className="w-5 h-5" />
          Add Quest
        </button>
      </div>

      {/* Empty State */}
      {quests.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <BookOpenIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No quests assigned to this class yet</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-optio-purple text-white rounded-lg hover:bg-optio-purple/90 transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            Add First Quest
          </button>
        </div>
      ) : (
        /* Quest List */
        <div className="space-y-3">
          {quests.map((item, index) => {
            const quest = item.quests || {}
            return (
              <div
                key={item.id}
                className="flex items-center gap-4 p-4 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
              >
                {/* Drag Handle (placeholder for future reordering) */}
                <div className="text-gray-300 cursor-move">
                  <Bars3Icon className="w-5 h-5" />
                </div>

                {/* Order Number */}
                <div className="w-8 h-8 rounded-full bg-optio-purple/10 text-optio-purple flex items-center justify-center text-sm font-medium">
                  {index + 1}
                </div>

                {/* Quest Info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 truncate">{quest.title}</h4>
                  {quest.description && (
                    <p className="text-sm text-gray-500 line-clamp-1">{quest.description}</p>
                  )}
                </div>

                {/* Quest type badge removed - unified quest model */}

                {/* Status */}
                {!quest.is_active && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                    Inactive
                  </span>
                )}

                {/* Remove Button */}
                <button
                  onClick={() => handleRemoveQuest(item.quest_id)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove quest from class"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Quest Modal */}
      {showAddModal && (
        <AddQuestModal
          orgId={orgId}
          existingQuestIds={quests.map((q) => q.quest_id)}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddQuest}
        />
      )}
    </div>
  )
}
