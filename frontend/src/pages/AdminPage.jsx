import React, { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'
import AdminQuestManager from './AdminQuestManager'
import AIQuestGenerator from '../components/AIQuestGenerator'
import AIQuestBulkGenerator from '../components/AIQuestBulkGenerator'

const AdminDashboard = () => {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    try {
      const response = await api.get('/admin/analytics')
      setAnalytics(response.data)
    } catch (error) {
      toast.error('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <h3 className="text-sm text-gray-600 mb-2">Total Users</h3>
          <p className="text-3xl font-bold">{analytics?.total_users || 0}</p>
        </div>
        <div className="card">
          <h3 className="text-sm text-gray-600 mb-2">Monthly Active</h3>
          <p className="text-3xl font-bold text-green-600">{analytics?.monthly_active_users || 0}</p>
        </div>
        <div className="card">
          <h3 className="text-sm text-gray-600 mb-2">Quests Completed</h3>
          <p className="text-3xl font-bold text-purple-600">{analytics?.total_quests_completed || 0}</p>
        </div>
        <div className="card">
          <h3 className="text-sm text-gray-600 mb-2">Paid Subscribers</h3>
          <p className="text-3xl font-bold text-yellow-600">
            {(analytics?.subscription_breakdown?.creator || 0) + 
             (analytics?.subscription_breakdown?.visionary || 0)}
          </p>
        </div>
      </div>
    </div>
  )
}

const AdminQuests = () => {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showManager, setShowManager] = useState(false)
  const [editingQuest, setEditingQuest] = useState(null)
  const [showAIGenerator, setShowAIGenerator] = useState(false)
  const [showBulkGenerator, setShowBulkGenerator] = useState(false)
  const [collapsedQuests, setCollapsedQuests] = useState(new Set())

  useEffect(() => {
    fetchQuests()
  }, [])

  const fetchQuests = async () => {
    try {
      const response = await api.get('/quests')
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
        await api.delete(`/admin/quests/${questId}`)
        toast.success('Quest deleted successfully')
        fetchQuests()
      } catch (error) {
        toast.error('Failed to delete quest')
      }
    }
  }

  const handleAIQuestAccepted = () => {
    fetchQuests()
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

  const getDifficultyBadgeColor = (level) => {
    switch(level) {
      case 'beginner': return 'bg-green-100 text-green-800'
      case 'intermediate': return 'bg-yellow-100 text-yellow-800'
      case 'advanced': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getEffortBadgeColor = (level) => {
    switch(level) {
      case 'light': return 'bg-blue-100 text-blue-800'
      case 'moderate': return 'bg-orange-100 text-orange-800'
      case 'intensive': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
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
            onClick={() => setShowBulkGenerator(true)}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded hover:from-indigo-700 hover:to-purple-700 flex items-center gap-2"
          >
            <span>🚀</span>
            <span>Bulk Generate</span>
          </button>
          <button
            onClick={() => setShowAIGenerator(true)}
            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2 rounded hover:from-purple-700 hover:to-blue-700 flex items-center gap-2"
          >
            <span>🤖</span>
            <span>AI Generate</span>
          </button>
          <button
            onClick={() => {
              setEditingQuest(null)
              setShowManager(true)
            }}
            className="btn-primary"
          >
            Create Quest
          </button>
        </div>
      </div>

      {showBulkGenerator && (
        <AIQuestBulkGenerator
          onClose={() => setShowBulkGenerator(false)}
          onQuestsGenerated={fetchQuests}
        />
      )}

      {showAIGenerator && (
        <AIQuestGenerator
          onQuestAccepted={handleAIQuestAccepted}
          onClose={() => setShowAIGenerator(false)}
        />
      )}

      {showManager && (
        <AdminQuestManager
          quest={editingQuest}
          onClose={() => {
            setShowManager(false)
            setEditingQuest(null)
          }}
          onSave={handleQuestSave}
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
                const totalXP = quest.quest_skill_xp?.reduce((sum, award) => sum + award.xp_amount, 0) || 
                               quest.quest_xp_awards?.reduce((sum, award) => sum + award.xp_amount, 0) || 0;
                
                const isCollapsed = collapsedQuests.has(quest.id);
                
                return (
                  <div key={quest.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
                    {/* Header Row */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1 cursor-pointer" onClick={() => toggleQuestCollapse(quest.id)}>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">
                            {isCollapsed ? '▶' : '▼'}
                          </span>
                          <h3 className="text-lg font-semibold text-gray-900">{quest.title}</h3>
                        </div>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2 ml-6">{quest.description}</p>
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
                    {/* Quest Metadata */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {quest.difficulty_level && (
                        <span className={`px-3 py-1 text-xs font-medium rounded ${getDifficultyBadgeColor(quest.difficulty_level)}`}>
                          {quest.difficulty_level?.charAt(0).toUpperCase() + quest.difficulty_level?.slice(1)}
                        </span>
                      )}
                      {quest.effort_level && (
                        <span className={`px-3 py-1 text-xs font-medium rounded ${getEffortBadgeColor(quest.effort_level)}`}>
                          {quest.effort_level?.charAt(0).toUpperCase() + quest.effort_level?.slice(1)} Effort
                        </span>
                      )}
                      {quest.estimated_hours && (
                        <span className="px-3 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700">
                          ⏱️ ~{quest.estimated_hours} hours
                        </span>
                      )}
                      {quest.requires_adult_supervision && (
                        <span className="px-3 py-1 text-xs font-medium rounded bg-red-100 text-red-700">
                          ⚠️ Adult Supervision
                        </span>
                      )}
                      {totalXP > 0 && (
                        <span className="px-3 py-1 text-xs font-medium rounded bg-purple-100 text-purple-700">
                          🏆 {totalXP} Total XP
                        </span>
                      )}
                    </div>

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

                    {/* Evidence Suggestions */}
                    <div className="border-t pt-4">
                      <p className="text-xs font-semibold text-gray-500 mb-2">EVIDENCE SUGGESTIONS:</p>
                      <p className="text-sm text-gray-700 line-clamp-2">
                        {quest.evidence_requirements || 'No specific suggestions set'}
                      </p>
                      
                      {quest.accepted_evidence_types?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {quest.accepted_evidence_types.map((type, idx) => (
                            <span key={idx} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded">
                              {type}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

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
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const AdminSubmissions = () => {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSubmissions()
  }, [])

  const fetchSubmissions = async () => {
    try {
      const response = await api.get('/admin/submissions/pending')
      setSubmissions(response.data)
    } catch (error) {
      toast.error('Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }

  const handleReview = async (submissionId, action, feedback = '') => {
    try {
      await api.post(`/admin/submissions/${submissionId}/review`, {
        action,
        feedback
      })
      toast.success(`Submission ${action === 'approve' ? 'approved' : 'sent back for changes'}`)
      fetchSubmissions()
    } catch (error) {
      toast.error('Failed to review submission')
    }
  }

  if (loading) {
    return <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Review Submissions</h2>
      {submissions.length === 0 ? (
        <p className="text-gray-600">No pending submissions</p>
      ) : (
        <div className="space-y-4">
          {submissions.map(submission => (
            <div key={submission.id} className="card">
              <div className="mb-4">
                <h3 className="font-semibold">{submission.user_quests?.quests?.title}</h3>
                <p className="text-sm text-gray-600">
                  Submitted by: {submission.user_quests?.users?.first_name} {submission.user_quests?.users?.last_name}
                </p>
                <p className="text-sm text-gray-600">
                  Date: {new Date(submission.submitted_at).toLocaleDateString()}
                </p>
              </div>
              
              {submission.submission_evidence?.map((evidence, idx) => (
                <div key={idx} className="mb-4 p-3 bg-gray-50 rounded">
                  {evidence.text_content && (
                    <p className="text-sm">{evidence.text_content}</p>
                  )}
                </div>
              ))}

              <div className="flex gap-2">
                <button
                  onClick={() => handleReview(submission.id, 'approve')}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  Approve
                </button>
                <button
                  onClick={() => {
                    const feedback = prompt('Enter feedback for the student:')
                    if (feedback) {
                      handleReview(submission.id, 'request_changes', feedback)
                    }
                  }}
                  className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
                >
                  Request Changes
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const AdminPage = () => {
  const location = useLocation()
  const currentPath = location.pathname.split('/').pop()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Panel</h1>
      
      <div className="flex gap-4 mb-8 border-b">
        <Link
          to="/admin"
          className={`pb-2 px-1 ${currentPath === 'admin' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Dashboard
        </Link>
        <Link
          to="/admin/quests"
          className={`pb-2 px-1 ${currentPath === 'quests' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Quests
        </Link>
        <Link
          to="/admin/submissions"
          className={`pb-2 px-1 ${currentPath === 'submissions' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Submissions
        </Link>
      </div>

      <Routes>
        <Route index element={<AdminDashboard />} />
        <Route path="quests" element={<AdminQuests />} />
        <Route path="submissions" element={<AdminSubmissions />} />
      </Routes>
    </div>
  )
}

export default AdminPage