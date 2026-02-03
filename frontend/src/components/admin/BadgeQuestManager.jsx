import React, { useState, useEffect } from 'react'
import { XMarkIcon, PlusIcon, TrashIcon, CheckIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

const BadgeQuestManager = ({ badge, onClose, onUpdate }) => {
  const [loading, setLoading] = useState(true)
  const [linkedQuests, setLinkedQuests] = useState([])
  const [allQuests, setAllQuests] = useState([])
  const [showQuestSelector, setShowQuestSelector] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchData()
  }, [badge.id])

  const fetchData = async () => {
    try {
      setLoading(true)

      // Fetch linked quests
      const linkedResponse = await api.get(`/api/admin/badges/${badge.id}/quests`)
      setLinkedQuests(linkedResponse.data.badge_quests || [])

      // Fetch all available quests
      const questsResponse = await api.get('/api/admin/quests')
      setAllQuests(questsResponse.data.quests || [])
    } catch (error) {
      toast.error('Failed to load quest data')
    } finally {
      setLoading(false)
    }
  }

  const handleLinkQuest = async (questId) => {
    try {
      // Get the next order index
      const nextOrderIndex = linkedQuests.length

      await api.post(`/api/admin/badges/${badge.id}/quests`, {
        quest_id: questId,
        is_required: true,
        order_index: nextOrderIndex
      })

      toast.success('Quest linked to badge successfully')
      setShowQuestSelector(false)
      setSearchTerm('')
      fetchData()
      onUpdate && onUpdate()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to link quest')
    }
  }

  const handleUnlinkQuest = async (questId) => {
    if (!window.confirm('Remove this quest from the badge?')) return

    try {
      await api.delete(`/api/admin/badges/${badge.id}/quests/${questId}`)
      toast.success('Quest unlinked from badge')
      fetchData()
      onUpdate && onUpdate()
    } catch (error) {
      toast.error('Failed to unlink quest')
    }
  }

  const handleToggleRequired = async (badgeQuest) => {
    try {
      await api.put(`/api/admin/badges/${badge.id}/quests/${badgeQuest.quest_id}`, {
        is_required: !badgeQuest.is_required
      })
      toast.success('Quest requirement updated')
      fetchData()
    } catch (error) {
      toast.error('Failed to update quest requirement')
    }
  }

  // Get quests that are not yet linked
  const availableQuests = allQuests.filter(quest =>
    !linkedQuests.some(lq => lq.quest_id === quest.id)
  )

  // Filter available quests by search term
  const filteredQuests = availableQuests.filter(quest =>
    quest.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    quest.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Manage Quests
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Badge: {badge.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <XMarkIcon size={24} />
          </button>
        </div>

        <div className="p-6">
          {/* Add Quest Button */}
          <div className="mb-6">
            <button
              onClick={() => setShowQuestSelector(!showQuestSelector)}
              className="w-full bg-gradient-primary text-white px-6 py-3 rounded-lg hover:opacity-90 font-semibold flex items-center justify-center gap-2"
            >
              <PlusIcon size={20} />
              Add Quest to Badge
            </button>
          </div>

          {/* Quest Selector */}
          {showQuestSelector && (
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Select Quest to Add</h3>
                <button
                  onClick={() => {
                    setShowQuestSelector(false)
                    setSearchTerm('')
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XIcon size={20} />
                </button>
              </div>

              {/* Search */}
              <input
                type="text"
                placeholder="Search quests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                aria-label="Search quests"
              />

              {/* Available Quests */}
              <div className="max-h-64 overflow-y-auto space-y-2">
                {filteredQuests.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    {searchTerm ? 'No matching quests found' : 'All quests are already linked to this badge'}
                  </p>
                ) : (
                  filteredQuests.map(quest => (
                    <div
                      key={quest.id}
                      className="flex justify-between items-center p-3 bg-white border border-gray-200 rounded-lg hover:border-purple-300 transition-colors"
                    >
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{quest.title}</h4>
                        {quest.description && (
                          <p className="text-sm text-gray-500 line-clamp-1 mt-1">
                            {quest.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleLinkQuest(quest.id)}
                        className="ml-4 px-4 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors font-medium text-sm flex items-center gap-2"
                      >
                        <PlusIcon size={16} />
                        Add
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Linked Quests Table */}
          <div>
            <h3 className="text-lg font-semibold mb-4">
              Linked Quests ({linkedQuests.length})
            </h3>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
              </div>
            ) : linkedQuests.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                <svg className="mx-auto h-12 w-12 text-gray-300 mb-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                </svg>
                <p className="text-base font-medium">No quests linked yet</p>
                <p className="text-sm mt-1">Click "Add Quest to Badge" to get started</p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Order
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Quest Title
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Required
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {linkedQuests.map((badgeQuest, index) => (
                      <tr key={badgeQuest.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          #{index + 1}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {badgeQuest.quests?.title || 'Unknown Quest'}
                          </div>
                          {badgeQuest.quests?.description && (
                            <div className="text-sm text-gray-500 line-clamp-1 mt-1">
                              {badgeQuest.quests.description}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => handleToggleRequired(badgeQuest)}
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              badgeQuest.is_required
                                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                            }`}
                          >
                            {badgeQuest.is_required ? (
                              <>
                                <CheckIcon size={14} className="mr-1" />
                                Required
                              </>
                            ) : (
                              'Optional'
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleUnlinkQuest(badgeQuest.quest_id)}
                            className="text-red-600 hover:text-red-900 inline-flex items-center gap-1"
                          >
                            <TrashIcon size={16} />
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-4 pt-6 mt-6 border-t">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gradient-primary text-white rounded-lg hover:opacity-90 font-medium"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BadgeQuestManager
