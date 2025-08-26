import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'

const QuestDetailPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [quest, setQuest] = useState(null)
  const [userQuest, setUserQuest] = useState(null)
  const [learningLogs, setLearningLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [evidenceText, setEvidenceText] = useState('')
  const [newLogEntry, setNewLogEntry] = useState('')
  const [addingLog, setAddingLog] = useState(false)

  const pillarNames = {
    creativity: 'Creativity',
    critical_thinking: 'Critical Thinking',
    practical_skills: 'Practical Skills',
    communication: 'Communication',
    cultural_literacy: 'Cultural Literacy'
  }

  useEffect(() => {
    fetchQuestDetails()
  }, [id])

  const fetchQuestDetails = async () => {
    try {
      const questResponse = await api.get(`/quests/${id}`)
      setQuest(questResponse.data)

      const userQuestsResponse = await api.get(`/quests/user/${user.id}/quests`)
      // The response has a 'quests' property that contains the array
      const userQuests = userQuestsResponse.data.quests || []
      const existingUserQuest = userQuests.find(uq => uq.quest_id === id)
      setUserQuest(existingUserQuest)

      if (existingUserQuest) {
        fetchLearningLogs(existingUserQuest.id)
      }
    } catch (error) {
      console.error('Failed to fetch quest details:', error)
      toast.error('Failed to load quest details')
    } finally {
      setLoading(false)
    }
  }

  const fetchLearningLogs = async (userQuestId) => {
    try {
      const response = await api.get(`/quests/${userQuestId}/logs`)
      setLearningLogs(response.data.logs || [])
    } catch (error) {
      console.error('Failed to fetch learning logs:', error)
    }
  }

  const handleStartQuest = async () => {
    try {
      const response = await api.post(`/quests/${id}/start`)
      setUserQuest(response.data)
      toast.success('Quest started! Begin your adventure!')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to start quest')
    }
  }

  const handleAddLog = async () => {
    if (!newLogEntry.trim()) {
      toast.error('Please write something about your journey')
      return
    }

    setAddingLog(true)
    try {
      const response = await api.post(`/quests/${userQuest.id}/log`, {
        log_entry: newLogEntry
      })
      
      if (response.data.bonus_awarded) {
        toast.success(`Learning log added! Earned ${response.data.bonus_awarded.xp_amount} bonus XP!`)
      } else {
        toast.success('Learning log added!')
      }
      
      setNewLogEntry('')
      fetchLearningLogs(userQuest.id)
    } catch (error) {
      toast.error('Failed to add learning log')
    } finally {
      setAddingLog(false)
    }
  }

  const handleSubmitQuest = async () => {
    if (!evidenceText.trim()) {
      toast.error('Please share how you showcased your journey')
      return
    }

    setSubmitting(true)
    try {
      await api.post(`/quests/${id}/submit`, {
        evidence_text: evidenceText
      })
      toast.success('Quest submitted for review!')
      navigate('/dashboard')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to submit quest')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!quest) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-center text-gray-600">Quest not found</p>
      </div>
    )
  }

  const totalXP = quest.quest_skill_xp?.reduce((sum, award) => sum + award.xp_amount, 0) || 0
  const intensityColors = {
    light: 'bg-green-100 text-green-800',
    moderate: 'bg-yellow-100 text-yellow-800',
    intensive: 'bg-red-100 text-red-800'
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="card mb-8">
        {/* Quest Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">{quest.title}</h1>
          
          <div className="flex flex-wrap gap-3 mb-4">
            {quest.primary_pillar && (
              <span className="bg-primary/10 text-primary px-4 py-2 rounded-full font-medium">
                {pillarNames[quest.primary_pillar]}
              </span>
            )}
            {quest.intensity && (
              <span className={`px-4 py-2 rounded-full font-medium ${intensityColors[quest.intensity]}`}>
                {quest.intensity.charAt(0).toUpperCase() + quest.intensity.slice(1)} Intensity
              </span>
            )}
            {quest.estimated_time && (
              <span className="bg-gray-100 text-gray-800 px-4 py-2 rounded-full font-medium">
                {quest.estimated_time}
              </span>
            )}
            <span className="bg-secondary text-white px-4 py-2 rounded-full font-bold">
              {totalXP} XP
            </span>
          </div>
        </div>

        {/* The Big Picture */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-primary">The Big Picture</h2>
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6">
            <p className="text-lg text-gray-700 leading-relaxed">
              {quest.big_idea || quest.description}
            </p>
          </div>
        </div>

        {/* What You'll Create */}
        {quest.what_youll_create && quest.what_youll_create.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-primary">What You'll Create</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quest.what_youll_create.map((item, index) => (
                <div key={index} className="flex items-start">
                  <span className="text-2xl mr-3">✨</span>
                  <p className="text-gray-700">{item}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Your Toolkit */}
        {quest.helpful_resources && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-primary">Your Toolkit</h2>
            <div className="bg-gray-50 rounded-lg p-6">
              {quest.helpful_resources.tools && quest.helpful_resources.tools.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-700 mb-2">Tools:</h3>
                  <div className="flex flex-wrap gap-2">
                    {quest.helpful_resources.tools.map((tool, index) => (
                      <span key={index} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {quest.helpful_resources.materials && quest.helpful_resources.materials.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-700 mb-2">Materials:</h3>
                  <div className="flex flex-wrap gap-2">
                    {quest.helpful_resources.materials.map((material, index) => (
                      <span key={index} className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
                        {material}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {quest.helpful_resources.links && quest.helpful_resources.links.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">Helpful Resources:</h3>
                  <ul className="space-y-1">
                    {quest.helpful_resources.links.map((link, index) => (
                      <li key={index}>
                        <a href={link} target="_blank" rel="noopener noreferrer" 
                           className="text-blue-600 hover:underline text-sm">
                          {link}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Fallback to old fields if new structure not available */}
              {!quest.helpful_resources.tools && !quest.helpful_resources.materials && !quest.helpful_resources.links && (
                <>
                  {quest.resources_needed && (
                    <div className="mb-4">
                      <h3 className="font-semibold text-gray-700 mb-2">Resources Needed:</h3>
                      <p className="text-gray-600">{quest.resources_needed}</p>
                    </div>
                  )}
                  {quest.location_requirements && (
                    <div>
                      <h3 className="font-semibold text-gray-700 mb-2">Suggested Location:</h3>
                      <p className="text-gray-600">{quest.location_requirements}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* The Journey */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-primary">The Journey</h2>
          
          {/* Your Mission */}
          {quest.your_mission && quest.your_mission.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Your Mission:</h3>
              <div className="space-y-3">
                {quest.your_mission.map((step, index) => (
                  <div key={index} className="flex items-start">
                    <span className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold mr-3 flex-shrink-0">
                      {index + 1}
                    </span>
                    <p className="text-gray-700 pt-1">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Showcase Your Journey */}
          <div className="bg-blue-50 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold mb-2">Showcase Your Journey:</h3>
            <p className="text-gray-700">
              {quest.showcase_your_journey || quest.evidence_requirements}
            </p>
            {quest.example_submissions && (
              <div className="mt-3 text-sm text-gray-600">
                <p className="font-semibold">Examples:</p>
                <p>{quest.example_submissions}</p>
              </div>
            )}
          </div>

          {/* Learning Log */}
          {userQuest?.status === 'in_progress' && (
            <div className="bg-yellow-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-3">
                📝 Learning Log 
                {quest.log_bonus && (
                  <span className="text-sm font-normal text-yellow-700 ml-2">
                    (+{quest.log_bonus.xp_amount} XP for first entry!)
                  </span>
                )}
              </h3>
              
              <div className="mb-4">
                <textarea
                  value={newLogEntry}
                  onChange={(e) => setNewLogEntry(e.target.value)}
                  placeholder="Document your journey... What did you discover? What challenged you? What made you proud?"
                  className="input-field w-full h-24"
                />
                <button
                  onClick={handleAddLog}
                  disabled={addingLog}
                  className="btn-primary mt-2"
                >
                  {addingLog ? 'Adding...' : 'Add Log Entry'}
                </button>
              </div>

              {learningLogs.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-700">Your Journey So Far:</h4>
                  {learningLogs.map((log, index) => (
                    <div key={log.id || index} className="bg-white rounded p-3">
                      <p className="text-gray-700 text-sm">{log.log_entry}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(log.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Go Further */}
        {(quest.collaboration_spark || quest.real_world_bonus || quest.optional_challenges) && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-primary">Go Further</h2>
            
            {quest.collaboration_spark && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-700 mb-2">🤝 Collaboration Spark:</h3>
                <p className="text-gray-600">{quest.collaboration_spark}</p>
              </div>
            )}
            
            {quest.real_world_bonus && (
              <div className="bg-purple-50 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-purple-800 mb-2">
                  🌟 Real World Bonus (+{quest.real_world_bonus.xp_amount} XP)
                </h3>
                <p className="text-purple-700">{quest.real_world_bonus.description}</p>
              </div>
            )}

            {quest.optional_challenges && quest.optional_challenges.length > 0 && (
              <div className="bg-purple-50 rounded-lg p-4">
                <h3 className="font-semibold text-purple-800 mb-3">Bonus Challenges:</h3>
                {quest.optional_challenges.map((challenge, index) => (
                  <div key={index} className="mb-2">
                    <p className="text-purple-700">{challenge.description}</p>
                    <span className="text-sm text-purple-600">
                      +{challenge.xp_amount} XP
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* The Fine Print */}
        {(quest.heads_up || quest.safety_considerations || quest.location || quest.requires_adult_supervision) && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-primary">The Fine Print</h2>
            <div className="bg-gray-50 rounded-lg p-6">
              {quest.requires_adult_supervision && (
                <div className="bg-red-50 border border-red-200 rounded p-3 mb-3">
                  <p className="text-red-800 font-semibold">
                    ⚠️ This quest requires adult supervision for safety
                  </p>
                </div>
              )}
              {quest.heads_up && (
                <div className="mb-3">
                  <h3 className="font-semibold text-gray-700 mb-1">Heads Up:</h3>
                  <p className="text-gray-600">{quest.heads_up}</p>
                </div>
              )}
              {quest.safety_considerations && (
                <div className="mb-3">
                  <h3 className="font-semibold text-yellow-700 mb-1">Safety Notes:</h3>
                  <p className="text-yellow-600">{quest.safety_considerations}</p>
                </div>
              )}
              {quest.location && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-1">Location:</h3>
                  <p className="text-gray-600">{quest.location}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!userQuest && (
          <button
            onClick={handleStartQuest}
            className="btn-primary w-full md:w-auto text-lg py-3 px-8"
          >
            Begin This Quest
          </button>
        )}

        {userQuest?.status === 'in_progress' && (
          <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Ready to Submit?</h2>
            <p className="text-gray-600 mb-4">
              Once you've completed your quest and documented your journey, share how you showcased your work:
            </p>
            <textarea
              value={evidenceText}
              onChange={(e) => setEvidenceText(e.target.value)}
              placeholder="Describe how you showcased your journey and what you learned..."
              className="input-field w-full h-32 mb-4"
            />
            <button
              onClick={handleSubmitQuest}
              disabled={submitting}
              className="btn-primary disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit for Review'}
            </button>
          </div>
        )}

        {userQuest?.status === 'pending_review' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">
              ⏳ Your submission is being reviewed by an educator. Great work on completing the quest!
            </p>
          </div>
        )}

        {userQuest?.status === 'completed' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 text-lg">
              🎉 Congratulations! You've completed this quest and earned {totalXP} XP!
            </p>
          </div>
        )}

        {userQuest?.status === 'needs_changes' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 mb-2">
              Your submission needs some changes. Please review the feedback and try again!
            </p>
            <button
              onClick={() => setUserQuest({ ...userQuest, status: 'in_progress' })}
              className="btn-primary"
            >
              Revise Submission
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default QuestDetailPage