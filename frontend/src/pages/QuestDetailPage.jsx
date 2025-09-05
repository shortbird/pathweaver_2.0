import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
// Removed VisualQuestCard import - component not implemented yet

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

  const handleSubmitQuest = async (submissionData, files) => {
    try {
      let fileUrls = []
      
      // Upload files if any
      if (files && files.length > 0) {
        const formData = new FormData()
        files.forEach(file => {
          formData.append('files', file)
        })
        
        try {
          const uploadResponse = await api.post('/api/uploads/evidence', formData, {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          })
          fileUrls = uploadResponse.data.files.map(f => f.url)
        } catch (uploadError) {
          console.error('File upload failed:', uploadError)
          toast.error('Failed to upload files. Submitting with text evidence only.')
        }
      }
      
      // Submit quest with evidence
      await api.post(`/quests/${id}/submit`, {
        evidence_text: submissionData.evidence_text || '',
        evidence_files: fileUrls
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
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold mb-4">{quest.title}</h1>
          <p className="text-gray-600 mb-6">{quest.description || quest.big_idea}</p>
          
          <div className="mb-6">
            <span className="text-lg font-semibold">Total XP: </span>
            <span className="text-green-600 font-bold">{quest.total_xp || 0}</span>
          </div>
          
          {!userQuest && (
            <button
              onClick={handleStartQuest}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
            >
              Start Quest
            </button>
          )}
          
          {userQuest && !userQuest.completed_at && (
            <div>
              <p className="text-gray-600 mb-4">Quest in progress...</p>
              <button
                onClick={() => {
                  const evidenceText = prompt('Enter your evidence:')
                  if (evidenceText) {
                    handleSubmitQuest({ evidence_text: evidenceText }, [])
                  }
                }}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700"
              >
                Submit Quest
              </button>
            </div>
          )}
          
          {userQuest && userQuest.completed_at && (
            <div className="bg-green-100 p-4 rounded-lg">
              <p className="text-green-800 font-semibold">Quest Completed!</p>
            </div>
          )}
          
          {learningLogs.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xl font-semibold mb-3">Learning Logs</h3>
              <div className="space-y-2">
                {learningLogs.map((log, index) => (
                  <div key={index} className="bg-gray-50 p-3 rounded">
                    <p className="text-sm text-gray-600">{log.content}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(log.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default QuestDetailPage