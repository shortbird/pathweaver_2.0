import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import VisualQuestCard from '../components/VisualQuestCard'

const QuestDetailPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [quest, setQuest] = useState(null)
  const [userQuest, setUserQuest] = useState(null)
  const [learningLogs, setLearningLogs] = useState([])
  const [loading, setLoading] = useState(true)

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
      const response = await api.post(`/quests/${id}/start`, {})
      setUserQuest(response.data)
      toast.success('Quest started! Begin your adventure!')
      
      // If we have the user quest ID, fetch learning logs
      if (response.data?.id) {
        fetchLearningLogs(response.data.id)
      }
      
      // Refresh quest details to ensure everything is in sync
      fetchQuestDetails()
    } catch (error) {
      const errorMessage = error.response?.data?.error
      // Ensure the error message is a string
      if (typeof errorMessage === 'object' && errorMessage !== null) {
        toast.error(errorMessage.message || JSON.stringify(errorMessage))
      } else {
        toast.error(errorMessage || 'Failed to start quest')
      }
    }
  }

  const handleAddLog = async (logEntry) => {
    if (!logEntry.trim()) {
      toast.error('Please write something about your journey')
      return
    }

    try {
      const response = await api.post(`/quests/${userQuest.id}/log`, {
        log_entry: logEntry
      })
      
      if (response.data.bonus_awarded) {
        toast.success(`Learning log added! Earned ${response.data.bonus_awarded.xp_amount} bonus XP!`)
      } else {
        toast.success('Learning log added!')
      }
      
      fetchLearningLogs(userQuest.id)
      return true
    } catch (error) {
      toast.error('Failed to add learning log')
      return false
    }
  }

  const handleSubmitQuest = async (evidenceText) => {
    if (!evidenceText.trim()) {
      toast.error('Please share how you showcased your journey')
      return
    }

    try {
      await api.post(`/quests/${id}/submit`, {
        evidence_text: evidenceText
      })
      toast.success('Quest submitted for review!')
      navigate('/dashboard')
      return true
    } catch (error) {
      const errorMessage = error.response?.data?.error
      // Ensure the error message is a string
      if (typeof errorMessage === 'object' && errorMessage !== null) {
        toast.error(errorMessage.message || JSON.stringify(errorMessage))
      } else {
        toast.error(errorMessage || 'Failed to submit quest')
      }
      return false
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

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      <VisualQuestCard 
        quest={quest}
        userQuest={userQuest}
        onStartQuest={handleStartQuest}
        onSubmitQuest={handleSubmitQuest}
        onAddLog={handleAddLog}
        learningLogs={learningLogs}
      />
    </div>
  )
}

export default QuestDetailPage