import React, { useState, useEffect } from 'react'
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import classService from '../../services/classService'
import { ModalOverlay } from '../ui'

/**
 * AddQuestModal - Select a quest to add to a class
 */
export default function AddQuestModal({ orgId, existingQuestIds = [], onClose, onSubmit }) {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchAvailableQuests()
  }, [orgId])

  const fetchAvailableQuests = async () => {
    try {
      setLoading(true)
      const response = await classService.getAvailableQuests(orgId, { limit: 100 })
      if (response.success) {
        // Filter out already-added quests
        const existingSet = new Set(existingQuestIds)
        const available = (response.quests || []).filter((q) => !existingSet.has(q.id))
        setQuests(available)
      }
    } catch (error) {
      console.error('Failed to fetch quests:', error)
      toast.error('Failed to load available quests')
    } finally {
      setLoading(false)
    }
  }

  const handleAddQuest = async (questId) => {
    setSubmitting(true)
    try {
      await onSubmit(questId)
    } finally {
      setSubmitting(false)
    }
  }

  const filteredQuests = quests.filter((quest) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      (quest.title || '').toLowerCase().includes(term) ||
      (quest.description || '').toLowerCase().includes(term)
    )
  })

  // Group quests by source
  const orgQuests = filteredQuests.filter((q) => q.source === 'organization')
  const optioQuests = filteredQuests.filter((q) => q.source !== 'organization')

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
              <BookOpenIcon className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Add Quest</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search quests..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* Quest List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple"></div>
              <span className="ml-2 text-gray-500">Loading quests...</span>
            </div>
          ) : quests.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No available quests to add
            </div>
          ) : filteredQuests.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No quests match your search
            </div>
          ) : (
            <div className="space-y-4">
              {/* Organization Quests */}
              {orgQuests.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Organization Quests ({orgQuests.length})
                  </h3>
                  <div className="space-y-2">
                    {orgQuests.map((quest) => (
                      <QuestItem
                        key={quest.id}
                        quest={quest}
                        onAdd={() => handleAddQuest(quest.id)}
                        disabled={submitting}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Optio Quests */}
              {optioQuests.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Optio Quests ({optioQuests.length})
                  </h3>
                  <div className="space-y-2">
                    {optioQuests.map((quest) => (
                      <QuestItem
                        key={quest.id}
                        quest={quest}
                        onAdd={() => handleAddQuest(quest.id)}
                        disabled={submitting}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}

function QuestItem({ quest, onAdd, disabled }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{quest.title}</p>
        {quest.description && (
          <p className="text-sm text-gray-500 line-clamp-1">{quest.description}</p>
        )}
        {/* Quest type badge removed - unified model */}
      </div>
      <button
        onClick={onAdd}
        disabled={disabled}
        className="px-3 py-1.5 bg-optio-purple text-white text-sm rounded-lg hover:bg-optio-purple/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Add
      </button>
    </div>
  )
}
