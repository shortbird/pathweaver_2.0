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
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [evidenceText, setEvidenceText] = useState('')
  const [selectedEvidenceType, setSelectedEvidenceType] = useState('')

  const skillCategoryNames = {
    reading_writing: 'Reading & Writing',
    thinking_skills: 'Thinking Skills',
    personal_growth: 'Personal Growth',
    life_skills: 'Life Skills',
    making_creating: 'Making & Creating',
    world_understanding: 'World Understanding'
  }

  const evidenceTypeLabels = {
    photo: 'Photo',
    video: 'Video',
    written: 'Written Work',
    project_link: 'Project Link',
    presentation: 'Presentation',
    artifact: 'Physical Artifact',
    certificate: 'Certificate'
  }

  useEffect(() => {
    fetchQuestDetails()
  }, [id])

  const fetchQuestDetails = async () => {
    try {
      const questResponse = await api.get(`/quests/${id}`)
      setQuest(questResponse.data)

      const userQuestsResponse = await api.get(`/quests/user/${user.id}/quests`)
      const existingUserQuest = userQuestsResponse.data.find(uq => uq.quest_id === id)
      setUserQuest(existingUserQuest)
    } catch (error) {
      console.error('Failed to fetch quest details:', error)
      toast.error('Failed to load quest details')
    } finally {
      setLoading(false)
    }
  }

  const handleStartQuest = async () => {
    try {
      const response = await api.post(`/quests/${id}/start`)
      setUserQuest(response.data)
      toast.success('Quest started!')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to start quest')
    }
  }

  const handleSubmitQuest = async () => {
    if (!evidenceText.trim()) {
      toast.error('Please provide evidence of your learning')
      return
    }

    if (quest.accepted_evidence_types?.length > 0 && !selectedEvidenceType) {
      toast.error('Please select an evidence type')
      return
    }

    setSubmitting(true)
    try {
      await api.post(`/quests/${id}/submit`, {
        evidence_text: evidenceText,
        evidence_type: selectedEvidenceType
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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="card mb-8">
        {quest.requires_adult_supervision && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-800 font-semibold">
              ⚠️ This quest requires adult supervision for safety
            </p>
          </div>
        )}

        <h1 className="text-3xl font-bold mb-4">{quest.title}</h1>
        
        {/* Difficulty, Effort, and Time Badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          {quest.difficulty_level && (
            <span className={`px-3 py-1 rounded text-sm font-medium ${
              quest.difficulty_level === 'beginner' ? 'bg-green-100 text-green-800' :
              quest.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {quest.difficulty_level}
            </span>
          )}
          {quest.effort_level && (
            <span className={`px-3 py-1 rounded text-sm font-medium ${
              quest.effort_level === 'light' ? 'bg-blue-100 text-blue-800' :
              quest.effort_level === 'moderate' ? 'bg-orange-100 text-orange-800' :
              'bg-purple-100 text-purple-800'
            }`}>
              {quest.effort_level} effort
            </span>
          )}
          {quest.estimated_hours && (
            <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded text-sm font-medium">
              ~{quest.estimated_hours} hours
            </span>
          )}
        </div>

        {/* Skill Category XP Awards */}
        <div className="flex flex-wrap gap-2 mb-4">
          {quest.quest_skill_xp?.map((award, index) => (
            <span
              key={index}
              className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm"
            >
              {skillCategoryNames[award.skill_category]} • {award.xp_amount} XP
            </span>
          ))}
          <span className="bg-secondary text-text px-3 py-1 rounded-full text-sm font-semibold">
            Total: {totalXP} XP
          </span>
        </div>

        {/* Core Skills */}
        {quest.core_skills && quest.core_skills.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Skills You'll Develop:</h3>
            <div className="flex flex-wrap gap-2">
              {quest.core_skills.map((skill, index) => (
                <span key={index} className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">
                  {skill.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="prose max-w-none mb-6">
          <h2 className="text-xl font-semibold mb-2">Description</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{quest.description}</p>
        </div>

        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h2 className="text-xl font-semibold mb-2">Evidence Suggestions</h2>
          <p className="text-sm text-gray-600 mb-2 italic">Remember: You already have your diploma! These are suggestions to help you showcase quality learning.</p>
          <p className="text-gray-700 whitespace-pre-wrap mb-3">{quest.evidence_requirements}</p>
          
          {quest.accepted_evidence_types && quest.accepted_evidence_types.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-semibold text-gray-600 mb-1">Accepted Evidence Types:</p>
              <div className="flex flex-wrap gap-2">
                {quest.accepted_evidence_types.map((type, index) => (
                  <span key={index} className="bg-white px-2 py-1 rounded text-xs">
                    {evidenceTypeLabels[type] || type}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {quest.example_submissions && (
            <div className="mt-3">
              <p className="text-sm font-semibold text-gray-600 mb-1">Example Submissions:</p>
              <p className="text-sm text-gray-600">{quest.example_submissions}</p>
            </div>
          )}
        </div>

        {/* Additional Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {quest.resources_needed && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-600 mb-1">Resources Needed:</h3>
              <p className="text-sm text-gray-700">{quest.resources_needed}</p>
            </div>
          )}
          
          {quest.location_requirements && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-600 mb-1">Suggested Locations:</h3>
              <p className="text-sm text-gray-700">{quest.location_requirements}</p>
            </div>
          )}
          
          {quest.safety_considerations && (
            <div className="bg-yellow-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-yellow-800 mb-1">Safety Considerations:</h3>
              <p className="text-sm text-yellow-700">{quest.safety_considerations}</p>
            </div>
          )}
        </div>

        {/* Optional Challenges */}
        {quest.optional_challenges && quest.optional_challenges.length > 0 && (
          <div className="bg-purple-50 rounded-lg p-4 mb-6">
            <h2 className="text-xl font-semibold mb-3">Optional Challenges (Bonus XP)</h2>
            {quest.optional_challenges.map((challenge, index) => (
              <div key={index} className="mb-3 pb-3 border-b border-purple-200 last:border-0">
                <p className="text-gray-700 mb-1">{challenge.description}</p>
                <span className="text-sm text-purple-700 font-semibold">
                  +{challenge.xp_amount} XP in {skillCategoryNames[challenge.skill_category]}
                </span>
              </div>
            ))}
          </div>
        )}

        {!userQuest && (
          <button
            onClick={handleStartQuest}
            className="btn-primary w-full md:w-auto"
          >
            Start This Quest
          </button>
        )}

        {userQuest?.status === 'in_progress' && (
          <div className="bg-gray-50 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Submit Your Evidence</h2>
            
            {quest.accepted_evidence_types && quest.accepted_evidence_types.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Evidence Type</label>
                <select
                  value={selectedEvidenceType}
                  onChange={(e) => setSelectedEvidenceType(e.target.value)}
                  className="input-field w-full"
                  required
                >
                  <option value="">Select evidence type...</option>
                  {quest.accepted_evidence_types.map(type => (
                    <option key={type} value={type}>
                      {evidenceTypeLabels[type] || type}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            <textarea
              value={evidenceText}
              onChange={(e) => setEvidenceText(e.target.value)}
              placeholder="Share your learning journey - what you discovered, how you grew, and what you're proud of..."
              className="input-field w-full h-32 mb-4"
            />
            <div className="flex gap-4">
              <button
                onClick={handleSubmitQuest}
                disabled={submitting}
                className="btn-primary disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit for Review'}
              </button>
            </div>
          </div>
        )}

        {userQuest?.status === 'pending_review' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">
              ✓ Your submission is pending review by an educator.
            </p>
          </div>
        )}

        {userQuest?.status === 'completed' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800">
              ✓ Congratulations! You've completed this quest and earned {totalXP} XP!
            </p>
          </div>
        )}

        {userQuest?.status === 'needs_changes' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 mb-2">
              Your submission needs changes. Please review the feedback and resubmit.
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