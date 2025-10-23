import React, { useState, useEffect, memo } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import UnifiedQuestForm from './UnifiedQuestForm'

const AdminQuests = () => {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showManager, setShowManager] = useState(false)
  const [editingQuest, setEditingQuest] = useState(null)
  const [showCreationForm, setShowCreationForm] = useState(false)

  useEffect(() => {
    fetchQuests()
  }, [])

  const fetchQuests = async () => {
    try {
      const response = await api.get('/api/admin/quests')
      setQuests(response.data.quests)
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
        await api.delete(`/api/admin/quests/${questId}`)
        toast.success('Quest deleted successfully')
        fetchQuests()
      } catch (error) {
        toast.error('Failed to delete quest')
      }
    }
  }

  const handleRefreshImage = async (questId) => {
    try {
      await api.post(`/api/admin/quests/${questId}/refresh-image`, {})
      toast.success('Quest image refreshed successfully')
      fetchQuests()
    } catch (error) {
      toast.error('Failed to refresh quest image')
    }
  }

  const handleUploadImage = (questId) => {
    // Create file input element
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/jpeg,image/jpg,image/png,image/gif,image/webp'

    fileInput.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return

      // Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024
      if (file.size > maxSize) {
        toast.error('Image size must be less than 5MB')
        return
      }

      // Create FormData for file upload
      const formData = new FormData()
      formData.append('file', file)

      try {
        const loadingToast = toast.loading('Uploading image...')

        // Note: Don't set Content-Type header manually for FormData
        // Axios will automatically set it with the correct boundary
        const response = await api.post(
          `/api/admin/quests/${questId}/upload-image`,
          formData
        )

        toast.dismiss(loadingToast)
        toast.success('Quest image uploaded successfully')
        fetchQuests()
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to upload image')
      }
    }

    // Trigger file selection dialog
    fileInput.click()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Manage Quests</h2>
        <button
          onClick={() => setShowCreationForm(true)}
          className="bg-gradient-to-r bg-gradient-primary-reverse text-white px-6 py-2 rounded-lg hover:opacity-90 font-semibold"
        >
          Create New Quest
        </button>
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

      {showCreationForm && (
        <UnifiedQuestForm
          mode="create"
          onClose={() => setShowCreationForm(false)}
          onSuccess={(newQuest) => {
            fetchQuests()
          }}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gradient-to-r bg-gradient-primary-reverse"></div>
        </div>
      ) : (
        <div>
          {quests.length === 0 ? (
            <div className="text-center py-16 text-gray-500 bg-gray-50 rounded-xl">
              <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
              </svg>
              <p className="text-lg font-semibold">No quests found</p>
              <p className="text-sm mt-2">Create your first quest using the button above</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {quests.map(quest => (
                <div
                  key={quest.id}
                  className="group bg-white rounded-xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-gray-100"
                >
                  {/* Image Section with Title Overlay - Same as QuestCardSimple */}
                  <div className="relative h-48 overflow-hidden">
                    {/* Background Image */}
                    {quest.image_url || quest.header_image_url ? (
                      <img
                        src={quest.image_url || quest.header_image_url}
                        alt={quest.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br bg-gradient-primary-reverse" />
                    )}

                    {/* Gradient Overlay for Text Readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />

                    {/* Title Overlay */}
                    <div className="absolute inset-x-0 bottom-0 p-6">
                      <h3 className="text-white text-xl font-bold leading-tight drop-shadow-lg line-clamp-2">
                        {quest.title}
                      </h3>
                    </div>
                  </div>

                  {/* Description Section */}
                  <div className="bg-white p-6">
                    <p className="text-gray-600 text-sm leading-relaxed line-clamp-3 mb-4">
                      {quest.description || quest.big_idea || 'No description available'}
                    </p>

                    {/* Admin Action Buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleEdit(quest)}
                        className="px-4 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(quest.id)}
                        className="px-4 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                      <button
                        onClick={() => handleUploadImage(quest.id)}
                        className="px-4 py-2 text-sm bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Upload
                      </button>
                      <button
                        onClick={() => handleRefreshImage(quest.id)}
                        className="px-4 py-2 text-sm bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(AdminQuests)