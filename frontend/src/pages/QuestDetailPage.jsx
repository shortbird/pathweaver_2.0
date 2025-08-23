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

  const totalXP = quest.quest_xp_awards?.reduce((sum, award) => sum + award.xp_amount, 0) || 0

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="card mb-8">
        <h1 className="text-3xl font-bold mb-4">{quest.title}</h1>
        
        <div className="flex flex-wrap gap-2 mb-4">
          {quest.quest_xp_awards?.map((award, index) => (
            <span
              key={index}
              className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm"
            >
              {award.subject.replace('_', ' ')} • {award.xp_amount} XP
            </span>
          ))}
          <span className="bg-secondary text-text px-3 py-1 rounded-full text-sm font-semibold">
            Total: {totalXP} XP
          </span>
        </div>

        <div className="prose max-w-none mb-6">
          <h2 className="text-xl font-semibold mb-2">Description</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{quest.description}</p>
        </div>

        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h2 className="text-xl font-semibold mb-2">Evidence Requirements</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{quest.evidence_requirements}</p>
        </div>

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
            <textarea
              value={evidenceText}
              onChange={(e) => setEvidenceText(e.target.value)}
              placeholder="Describe what you learned and how you completed this quest..."
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