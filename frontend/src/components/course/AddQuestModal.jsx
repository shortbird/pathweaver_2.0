import React, { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { PlusIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import CreateQuestModal from '../CreateQuestModal'

/**
 * Modal component for adding quests to a course.
 * Shows available quests and allows creating new ones.
 */
const AddQuestModal = ({
  isOpen,
  onClose,
  onAddQuest,
  organizationId,
  existingQuestIds = []
}) => {
  const [loading, setLoading] = useState(false)
  const [quests, setQuests] = useState([])
  const [selectedQuestId, setSelectedQuestId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchQuests()
    }
  }, [isOpen])

  const fetchQuests = async () => {
    try {
      setLoading(true)
      // Fetch all available quests - backend handles organization visibility automatically
      const response = await api.get('/api/quests', {
        params: {
          per_page: 100  // Get more quests
        }
      })
      // Filter out quests already in the course
      const availableQuests = (response.data.quests || response.data.data || []).filter(
        q => !existingQuestIds.includes(q.id)
      )
      setQuests(availableQuests)
    } catch (error) {
      console.error('Failed to fetch quests:', error)
      toast.error('Failed to load quests')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    if (selectedQuestId) {
      const quest = quests.find(q => q.id === selectedQuestId)
      onAddQuest(quest)
      setSelectedQuestId(null)
    }
  }

  const handleCreateSuccess = (newQuest) => {
    setShowCreateModal(false)
    // Validate the quest has an id before adding to course
    if (newQuest && newQuest.id) {
      onAddQuest(newQuest)
    } else {
      console.error('Created quest missing id:', newQuest)
      toast.error('Quest created but failed to add to course. Please add it manually.')
    }
  }

  // Filter quests by search term
  const filteredQuests = quests.filter(quest =>
    quest.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    quest.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add Project to Course</h2>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
              >
                <PlusIcon className="w-4 h-4" />
                Create New Quest
              </button>
            </div>
            {/* Search input */}
            <div className="mt-4">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search quests..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
              </div>
            ) : filteredQuests.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="mb-4">
                  {searchTerm ? 'No quests match your search.' : 'No quests available.'}
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="text-optio-purple hover:underline"
                >
                  Create a new quest to add as a project
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredQuests.map(quest => (
                  <button
                    key={quest.id}
                    onClick={() => setSelectedQuestId(quest.id)}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      selectedQuestId === quest.id
                        ? 'border-optio-purple bg-optio-purple/5'
                        : 'border-gray-200 hover:border-optio-purple/50'
                    }`}
                  >
                    <h3 className="font-medium text-gray-900">{quest.title}</h3>
                    {quest.description && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{quest.description}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!selectedQuestId}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Project
            </button>
          </div>
        </div>
      </div>

      {/* Create Quest Modal */}
      {showCreateModal && (
        <CreateQuestModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </>
  )
}

export default AddQuestModal
