import React, { useState, useEffect, memo } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import SourcesManager from '../SourcesManager'
import UnifiedQuestForm from './UnifiedQuestForm'

const AdminQuests = () => {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showManager, setShowManager] = useState(false)
  const [editingQuest, setEditingQuest] = useState(null)
  const [collapsedQuests, setCollapsedQuests] = useState(new Set())
  const [showSourcesManager, setShowSourcesManager] = useState(false)
  const [showCreationForm, setShowCreationForm] = useState(false)
  const [activeTab, setActiveTab] = useState('quests')

  useEffect(() => {
    fetchQuests()
  }, [])

  const fetchQuests = async () => {
    try {
      const response = await api.get('/api/v3/admin/quests')
      setQuests(response.data.quests)
      // Set all quests as collapsed by default
      const allQuestIds = new Set(response.data.quests.map(quest => quest.id))
      setCollapsedQuests(allQuestIds)
    } catch (error) {
      toast.error('Failed to load quests')
    } finally {
      setLoading(false)
    }
  }

  const handleQuestSave = () => {
    setShowManager(false)
    setEditingQuest(null)
    fetchQuests()
  }

  const handleEdit = (quest) => {
    setEditingQuest(quest)
    setShowManager(true)
  }

  const handleDelete = async (questId) => {
    if (window.confirm('Are you sure you want to delete this quest?')) {
      try {
        await api.delete(`/api/v3/admin/quests/${questId}`)
        toast.success('Quest deleted successfully')
        fetchQuests()
      } catch (error) {
        toast.error('Failed to delete quest')
      }
    }
  }

  const handleRefreshImage = async (questId) => {
    try {
      const response = await api.post(`/api/v3/admin/quests/${questId}/refresh-image`, {})
      toast.success('Quest image refreshed successfully')
      fetchQuests()
    } catch (error) {
      toast.error('Failed to refresh quest image')
    }
  }

  const getSkillCategoryName = (category) => {
    const categoryNames = {
      'reading_writing': 'Reading & Writing',
      'thinking_skills': 'Thinking Skills',
      'personal_growth': 'Personal Growth',
      'life_skills': 'Life Skills',
      'making_creating': 'Making & Creating',
      'world_understanding': 'World Understanding'
    }
    return categoryNames[category] || category
  }

  const toggleQuestCollapse = (questId) => {
    setCollapsedQuests(prev => {
      const newSet = new Set(prev)
      if (newSet.has(questId)) {
        newSet.delete(questId)
      } else {
        newSet.add(questId)
      }
      return newSet
    })
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Manage Quests</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (collapsedQuests.size === quests.length) {
                // All collapsed, so expand all
                setCollapsedQuests(new Set())
              } else {
                // Some or all expanded, so collapse all
                const allQuestIds = new Set(quests.map(quest => quest.id))
                setCollapsedQuests(allQuestIds)
              }
            }}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
          >
            {collapsedQuests.size === quests.length ? 'Expand All' : 'Collapse All'}
          </button>
          <button
            onClick={() => setShowCreationForm(true)}
            className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-4 py-2 rounded hover:opacity-90"
          >
            Create New Quest
          </button>
          <button
            onClick={() => setShowSourcesManager(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
          >
            Manage Source Images
          </button>
        </div>
      </div>

      {showManager && (
        <UnifiedQuestForm
          mode="edit"
          quest={editingQuest}
          onClose={() => {
            setShowManager(false)
            setEditingQuest(null)
          }}
          onSuccess={handleQuestSave}
        />
      )}

      {showSourcesManager && (
        <SourcesManager
          onClose={() => setShowSourcesManager(false)}
        />
      )}

      {showCreationForm && (
        <UnifiedQuestForm
          mode="create"
          onClose={() => setShowCreationForm(false)}
          onSuccess={(newQuest) => {
            fetchQuests() // Refresh quest list
            // Success toast is already shown by UnifiedQuestForm
          }}
        />
      )}

      {loading ? (
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
      ) : (
        <div>
          {quests.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
              <p className="text-lg">No quests found</p>
              <p className="text-sm mt-2">Create your first quest using the button above</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {quests.map(quest => {
                // Calculate total XP from tasks for V3 or fallback to old system
                const totalXP = quest.quest_tasks?.reduce((sum, task) => sum + (task.xp_amount || 0), 0) ||
                               quest.quest_skill_xp?.reduce((sum, award) => sum + award.xp_amount, 0) ||
                               quest.quest_xp_awards?.reduce((sum, award) => sum + award.xp_amount, 0) ||
                               quest.total_xp || 0;

                const isCollapsed = collapsedQuests.has(quest.id);

                return (
                  <div key={quest.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                    {/* Quest Image Preview */}
                    {quest.image_url || quest.header_image_url ? (
                      <div className="relative h-32 overflow-hidden">
                        <img
                          src={quest.image_url || quest.header_image_url}
                          alt={quest.title}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRefreshImage(quest.id);
                          }}
                          className="absolute top-2 right-2 bg-white/90 hover:bg-white px-2 py-1 rounded text-xs text-gray-700 transition-colors"
                        >
                          🔄 Refresh Image
                        </button>
                      </div>
                    ) : (
                      <div className="h-2 bg-gradient-to-r from-gray-200 to-gray-300"></div>
                    )}

                    {/* Header Row */}
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1 cursor-pointer" onClick={() => toggleQuestCollapse(quest.id)}>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">
                              {isCollapsed ? '▶' : '▼'}
                            </span>
                            <h3 className="text-lg font-semibold text-gray-900">{quest.title}</h3>
                          </div>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2 ml-6">
                            {quest.big_idea || quest.description || 'No description'}
                          </p>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleEdit(quest)}
                            className="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(quest.id)}
                            className="px-3 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                    {/* Collapsible Content */}
                    {!isCollapsed && (
                      <>
                    {/* Tasks Section for V3 Quests */}
                    {quest.quest_tasks && quest.quest_tasks.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-500 mb-2">TASKS ({quest.quest_tasks.length}):</p>
                        <div className="space-y-2">
                          {quest.quest_tasks
                            .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                            .map((task, idx) => (
                            <div key={task.id || idx} className="bg-gray-50 p-3 rounded-lg">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <span className="font-medium text-sm">{idx + 1}. {task.title}</span>
                                  {task.description && (
                                    <p className="text-xs text-gray-600 mt-1">{task.description}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 ml-2">
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                    {task.xp_amount} XP
                                  </span>
                                  <span className={`text-xs px-2 py-1 rounded ${
                                    task.pillar === 'creativity' ? 'bg-purple-100 text-purple-700' :
                                    task.pillar === 'critical_thinking' ? 'bg-blue-100 text-blue-700' :
                                    task.pillar === 'practical_skills' ? 'bg-green-100 text-green-700' :
                                    task.pillar === 'communication' ? 'bg-orange-100 text-orange-700' :
                                    task.pillar === 'cultural_literacy' ? 'bg-red-100 text-red-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {task.pillar?.replace('_', ' ')}
                                  </span>
                                  {task.is_collaboration_eligible && (
                                    <span className="text-xs text-purple-600">Team-up eligible</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Skills or Subjects XP */}
                    {(quest.quest_skill_xp?.length > 0 || quest.quest_xp_awards?.length > 0) && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-500 mb-2">XP AWARDS:</p>
                        <div className="flex flex-wrap gap-2">
                          {quest.quest_skill_xp?.map((award, idx) => (
                            <div key={`skill-${idx}`} className="bg-gradient-to-r from-blue-50 to-purple-50 px-3 py-1 rounded-full border border-gray-200">
                              <span className="text-xs font-medium text-gray-700">
                                {getSkillCategoryName(award.skill_category)}:
                              </span>
                              <span className="text-xs font-bold text-primary ml-1">{award.xp_amount} XP</span>
                            </div>
                          ))}
                          {quest.quest_xp_awards?.map((award, idx) => (
                            <div key={`subject-${idx}`} className="bg-gradient-to-r from-green-50 to-blue-50 px-3 py-1 rounded-full border border-gray-200">
                              <span className="text-xs font-medium text-gray-700">
                                {award.subject?.replace(/_/g, ' ')}:
                              </span>
                              <span className="text-xs font-bold text-primary ml-1">{award.xp_amount} XP</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Core Skills */}
                    {quest.core_skills?.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-500 mb-2">CORE SKILLS:</p>
                        <div className="flex flex-wrap gap-1">
                          {quest.core_skills.map((skill, idx) => (
                            <span key={idx} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                              {skill.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Additional Info */}
                    <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-gray-500">
                      {quest.location_requirements && (
                        <div>
                          <span className="font-semibold">Location:</span> {quest.location_requirements}
                        </div>
                      )}
                      {quest.resources_needed && (
                        <div>
                          <span className="font-semibold">Resources:</span> {quest.resources_needed}
                        </div>
                      )}
                      {quest.optional_challenges?.length > 0 && (
                        <div>
                          <span className="font-semibold">Optional Challenges:</span> {quest.optional_challenges.length}
                        </div>
                      )}
                      <div>
                        <span className="font-semibold">Quest ID:</span> {quest.id.slice(0, 8)}...
                      </div>
                    </div>
                    </>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(AdminQuests)