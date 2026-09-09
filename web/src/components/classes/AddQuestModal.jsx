import React, { useState, useEffect } from 'react'
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  BookOpenIcon,
  PlusIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import classService from '../../services/classService'
import { ModalOverlay } from '../ui'

/**
 * AddQuestModal - Select an existing quest or create a new one to add to a class
 */
export default function AddQuestModal({ orgId, classId, existingQuestIds = [], onClose, onSubmit }) {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState('browse') // 'browse' or 'create'
  const [newQuest, setNewQuest] = useState({ title: '', description: '' })

  useEffect(() => {
    fetchAvailableQuests()
  }, [orgId])

  const fetchAvailableQuests = async () => {
    try {
      setLoading(true)
      const response = await classService.getAvailableQuests(orgId, { limit: 100 })
      if (response.success) {
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

  const handleCreateAndAdd = async (e) => {
    e.preventDefault()
    const title = newQuest.title.trim()
    const description = newQuest.description.trim()

    if (!title) {
      toast.error('Title is required')
      return
    }

    setSubmitting(true)
    try {
      const response = await classService.createAndAddQuest(orgId, classId, {
        title,
        description,
      })
      if (response.success) {
        toast.success('Quest created and added to class')
        onClose()
        // Trigger parent refresh by calling onSubmit with null (signals a refresh without adding)
        onSubmit(null, true)
      } else {
        toast.error(response.error || 'Failed to create quest')
      }
    } catch (error) {
      console.error('Failed to create quest:', error)
      toast.error(error.response?.data?.error || 'Failed to create quest')
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

  const orgQuests = filteredQuests.filter((q) => q.source === 'organization')
  const optioQuests = filteredQuests.filter((q) => q.source !== 'organization')

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {mode === 'create' && (
              <button
                onClick={() => setMode('browse')}
                className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
            )}
            <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
              <BookOpenIcon className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              {mode === 'create' ? 'Create New Quest' : 'Add Quest'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {mode === 'create' ? (
          /* Create New Quest Form */
          <form onSubmit={handleCreateAndAdd} className="flex-1 overflow-y-auto p-4 space-y-4">
            <p className="text-sm text-gray-500">
              Create a new quest for your organization. It will be added to this class automatically.
            </p>

            <div>
              <label htmlFor="quest-title" className="block text-sm font-medium text-gray-700 mb-1">
                Quest Title *
              </label>
              <input
                type="text"
                id="quest-title"
                value={newQuest.title}
                onChange={(e) => setNewQuest((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Introduction to Web Design"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                maxLength={200}
                autoFocus
                disabled={submitting}
              />
              <p className="mt-1 text-xs text-gray-400">{newQuest.title.length}/200</p>
            </div>

            <div>
              <label htmlFor="quest-desc" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="quest-desc"
                value={newQuest.description}
                onChange={(e) => setNewQuest((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="What will students learn or accomplish in this quest?"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
                rows={4}
                maxLength={2000}
                disabled={submitting}
              />
              <p className="mt-1 text-xs text-gray-400">{newQuest.description.length}/2000</p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMode('browse')}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !newQuest.title.trim()}
                className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {submitting ? 'Creating...' : 'Create & Add to Class'}
              </button>
            </div>
          </form>
        ) : (
          /* Browse Existing Quests */
          <>
            {/* Search + Create Button */}
            <div className="p-4 border-b border-gray-200 space-y-3">
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
              <button
                onClick={() => setMode('create')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-optio-purple/30 text-optio-purple rounded-lg hover:bg-optio-purple/5 hover:border-optio-purple/50 transition-colors"
              >
                <PlusIcon className="w-5 h-5" />
                Create New Quest
              </button>
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
                  <p>No available quests to add.</p>
                  <button
                    onClick={() => setMode('create')}
                    className="mt-2 text-optio-purple hover:underline text-sm"
                  >
                    Create one instead
                  </button>
                </div>
              ) : filteredQuests.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No quests match your search.</p>
                  <button
                    onClick={() => setMode('create')}
                    className="mt-2 text-optio-purple hover:underline text-sm"
                  >
                    Create a new quest instead
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
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
          </>
        )}
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
