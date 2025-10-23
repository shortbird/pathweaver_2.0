import React, { useState, useEffect } from 'react'
import { X, Search, ChevronRight, Loader } from 'lucide-react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import AdvisorTaskForm from './AdvisorTaskForm'

const QuestSelectionModal = ({ student, onClose }) => {
  const [loading, setLoading] = useState(true)
  const [enrolledQuests, setEnrolledQuests] = useState([])
  const [availableQuests, setAvailableQuests] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedQuest, setSelectedQuest] = useState(null)
  const [showTaskForm, setShowTaskForm] = useState(false)

  useEffect(() => {
    fetchQuests()
  }, [student.id])

  const fetchQuests = async () => {
    setLoading(true)
    try {
      const response = await api.get(`/api/admin/users/${student.id}/quest-enrollments`)
      setEnrolledQuests(response.data.enrolled_quests || [])
      setAvailableQuests(response.data.available_quests || [])
    } catch (error) {
      console.error('Error fetching quests:', error)
      toast.error('Failed to load quests')
    } finally {
      setLoading(false)
    }
  }

  const handleQuestSelect = (quest) => {
    setSelectedQuest(quest)
    setShowTaskForm(true)
  }

  const handleTaskFormSuccess = () => {
    setShowTaskForm(false)
    setSelectedQuest(null)
    fetchQuests() // Refresh quest list
  }

  const handleTaskFormClose = () => {
    setShowTaskForm(false)
    setSelectedQuest(null)
  }

  const filterQuests = (quests) => {
    if (!searchTerm.trim()) return quests
    const term = searchTerm.toLowerCase()
    return quests.filter(quest =>
      quest.title.toLowerCase().includes(term) ||
      (quest.big_idea || '').toLowerCase().includes(term) ||
      (quest.description || '').toLowerCase().includes(term)
    )
  }

  const filteredEnrolled = filterQuests(enrolledQuests)
  const filteredAvailable = filterQuests(availableQuests)

  if (showTaskForm && selectedQuest) {
    return (
      <AdvisorTaskForm
        student={student}
        questId={selectedQuest.quest_id}
        userQuestId={selectedQuest.user_quest_id}
        onClose={handleTaskFormClose}
        onSuccess={handleTaskFormSuccess}
      />
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b px-6 py-4 flex justify-between items-center bg-gradient-primary-reverse">
          <div className="text-white">
            <h2 className="text-2xl font-bold">Select Quest for {student.first_name} {student.last_name}</h2>
            <p className="text-sm opacity-90">Choose which quest to add tasks to</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full text-white"
          >
            <X size={24} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b bg-gray-50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search quests..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Quest Lists */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="animate-spin text-purple-600" size={32} />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Enrolled Quests */}
              {filteredEnrolled.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-gray-800">
                    Enrolled Quests ({filteredEnrolled.length})
                  </h3>
                  <div className="space-y-3">
                    {filteredEnrolled.map((quest) => (
                      <div
                        key={quest.quest_id}
                        onClick={() => handleQuestSelect(quest)}
                        className="border border-purple-200 bg-purple-50 rounded-lg p-4 cursor-pointer hover:shadow-md transition-all group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-gray-900 group-hover:text-purple-700">
                                {quest.title}
                              </h4>
                              <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full">
                                Enrolled
                              </span>
                            </div>
                            {quest.big_idea && (
                              <p className="text-sm text-gray-600 mt-1 line-clamp-2">{quest.big_idea}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                              <span className="font-medium">{quest.task_count || 0} tasks</span>
                              {quest.started_at && (
                                <span>Started {new Date(quest.started_at).toLocaleDateString()}</span>
                              )}
                              {quest.completed_at && (
                                <span className="text-green-600 font-semibold">Completed</span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="text-purple-600 group-hover:translate-x-1 transition-transform" size={20} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Quests */}
              {filteredAvailable.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-gray-800">
                    Available Quests ({filteredAvailable.length})
                  </h3>
                  <div className="space-y-3">
                    {filteredAvailable.map((quest) => (
                      <div
                        key={quest.quest_id}
                        onClick={() => handleQuestSelect(quest)}
                        className="border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-purple-300 hover:shadow-md transition-all group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900 group-hover:text-purple-700">
                              {quest.title}
                            </h4>
                            {quest.big_idea && (
                              <p className="text-sm text-gray-600 mt-1 line-clamp-2">{quest.big_idea}</p>
                            )}
                            <p className="text-xs text-gray-500 mt-2">
                              Student will be auto-enrolled when you add tasks
                            </p>
                          </div>
                          <ChevronRight className="text-gray-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all" size={20} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {filteredEnrolled.length === 0 && filteredAvailable.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  {searchTerm ? (
                    <>
                      <p className="text-lg font-medium">No quests found matching "{searchTerm}"</p>
                      <p className="text-sm mt-2">Try a different search term</p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-medium">No quests available</p>
                      <p className="text-sm mt-2">Create a quest first from the Quests tab</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {enrolledQuests.length + availableQuests.length} total quests
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default QuestSelectionModal
