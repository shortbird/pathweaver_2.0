import React, { useState, useEffect, memo, lazy, Suspense } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import toast from 'react-hot-toast'
import UnifiedQuestForm from './UnifiedQuestForm'
import CourseQuestForm from './CourseQuestForm'
import BulkQuestGenerator from './BulkQuestGenerator'

// Lazy load large modal to reduce initial bundle size
const AIQuestReviewModal = lazy(() => import('./AIQuestReviewModal'))

const AdminQuests = () => {
  const { user } = useAuth()
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showManager, setShowManager] = useState(false)
  const [editingQuest, setEditingQuest] = useState(null)
  const [showCreationForm, setShowCreationForm] = useState(false)
  const [showCourseQuestForm, setShowCourseQuestForm] = useState(false)
  const [editingCourseQuest, setEditingCourseQuest] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all') // all, active, inactive
  const [questTypeFilter, setQuestTypeFilter] = useState('all') // all, optio, course
  const [publicFilter, setPublicFilter] = useState('all') // all, public, private
  const [showBulkGenerator, setShowBulkGenerator] = useState(false)
  const [showAIReviewModal, setShowAIReviewModal] = useState(false)

  // Determine user role
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isAdvisor = user?.role === 'advisor'

  useEffect(() => {
    fetchQuests()
  }, [activeFilter, questTypeFilter, publicFilter])

  const fetchQuests = async () => {
    setLoading(true)
    try {
      // Build query parameters
      const params = new URLSearchParams({ per_page: '10000' })

      if (activeFilter !== 'all') {
        params.append('is_active', activeFilter === 'active' ? 'true' : 'false')
      }

      if (questTypeFilter !== 'all') {
        params.append('quest_type', questTypeFilter)
      }

      if (publicFilter !== 'all') {
        params.append('is_public', publicFilter === 'public' ? 'true' : 'false')
      }

      const response = await api.get(`/api/admin/quests?${params.toString()}`)
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
    setEditingCourseQuest(null)
    fetchQuests()
  }

  const handleEdit = (quest) => {
    // Check quest type to determine which form to show
    if (quest.quest_type === 'course') {
      setEditingCourseQuest(quest)
      setShowCourseQuestForm(true)
    } else {
      // Default to Optio quest form for 'optio' type or undefined
      setEditingQuest(quest)
      setShowManager(true)
    }
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

  const handleToggleActive = async (questId, currentStatus) => {
    const newStatus = !currentStatus
    // Optimistic update
    setQuests(prev => prev.map(q =>
      q.id === questId ? { ...q, is_active: newStatus } : q
    ))

    // Background API call
    api.put(`/api/admin/quests/${questId}`, { is_active: newStatus })
      .catch(error => {
        // Revert on failure
        setQuests(prev => prev.map(q =>
          q.id === questId ? { ...q, is_active: currentStatus } : q
        ))
        toast.error('Failed to update quest status')
      })
  }

  const handleTogglePublic = async (questId, currentStatus) => {
    const newStatus = !currentStatus
    // Optimistic update
    setQuests(prev => prev.map(q =>
      q.id === questId ? { ...q, is_public: newStatus } : q
    ))

    // Background API call
    api.put(`/api/admin/quests/${questId}`, { is_public: newStatus })
      .catch(error => {
        // Revert on failure
        setQuests(prev => prev.map(q =>
          q.id === questId ? { ...q, is_public: currentStatus } : q
        ))
        toast.error('Failed to update quest visibility')
      })
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold">Manage Quests</h2>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            onClick={() => setShowBulkGenerator(true)}
            className="bg-gradient-to-r from-optio-purple to-optio-pink text-white px-6 py-2 rounded-lg hover:opacity-90 font-semibold flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Bulk Generate (200)
          </button>
          <button
            onClick={() => setShowAIReviewModal(true)}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-semibold flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Review AI Quests
          </button>
          <button
            onClick={() => setShowCourseQuestForm(true)}
            className="bg-optio-purple text-white px-6 py-2 rounded-lg hover:opacity-90 font-semibold"
          >
            Create Course Quest
          </button>
          <button
            onClick={() => setShowCreationForm(true)}
            className="bg-gradient-primary text-white px-6 py-2 rounded-lg hover:opacity-90 font-semibold"
          >
            Create Optio Quest
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        {/* Active Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">Status:</span>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Quest Type Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">Type:</span>
          <select
            value={questTypeFilter}
            onChange={(e) => setQuestTypeFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
          >
            <option value="all">All Types</option>
            <option value="optio">Optio</option>
            <option value="course">Course</option>
          </select>
        </div>

        {/* Public Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">Visibility:</span>
          <select
            value={publicFilter}
            onChange={(e) => setPublicFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
          >
            <option value="all">All</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>

        {/* Results Summary */}
        <div className="ml-auto text-sm text-gray-600">
          <span className="font-semibold">{quests.length}</span> quest{quests.length !== 1 ? 's' : ''}
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

      {showCreationForm && (
        <UnifiedQuestForm
          mode="create"
          onClose={() => setShowCreationForm(false)}
          onSuccess={(newQuest) => {
            fetchQuests()
            setShowCreationForm(false)
          }}
        />
      )}

      {showCourseQuestForm && (
        <CourseQuestForm
          mode={editingCourseQuest ? 'edit' : 'create'}
          quest={editingCourseQuest}
          onClose={() => {
            setShowCourseQuestForm(false)
            setEditingCourseQuest(null)
          }}
          onSuccess={(newQuest) => {
            fetchQuests()
            setShowCourseQuestForm(false)
            setEditingCourseQuest(null)
          }}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gradient-to-r bg-gradient-primary"></div>
        </div>
      ) : (
        <div>
          {quests.length === 0 ? (
            <div className="text-center py-16 text-gray-500 bg-gray-50 rounded-xl">
              <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
              </svg>
              <p className="text-lg font-semibold">No quests found</p>
              <p className="text-sm mt-2">
                No quests match your current filters. Try adjusting the filters above.
              </p>
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
                        alt={`Quest: ${quest.title}`}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br bg-gradient-primary" />
                    )}

                    {/* Gradient Overlay for Text Readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />

                    {/* Active/Inactive Badge */}
                    <div className="absolute top-4 right-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        quest.is_active
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-500 text-white'
                      }`}>
                        {quest.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

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

                    {/* Active Toggle - Disabled for advisors */}
                    <div className="flex items-center justify-between min-h-[44px] mb-3 p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm font-medium text-gray-700">
                        Active
                        {isAdvisor && <span className="text-xs text-gray-500 ml-1">(Admin only)</span>}
                      </span>
                      <button
                        onClick={() => isAdmin && handleToggleActive(quest.id, quest.is_active)}
                        disabled={isAdvisor}
                        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                          isAdvisor
                            ? 'opacity-50 cursor-not-allowed'
                            : 'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2'
                        } ${quest.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            quest.is_active ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Public Toggle - Admin only */}
                    <div className="flex items-center justify-between min-h-[44px] mb-4 p-3 bg-blue-50 rounded-lg">
                      <span className="text-sm font-medium text-gray-700">
                        Public
                        {isAdvisor && <span className="text-xs text-gray-500 ml-1">(Admin only)</span>}
                      </span>
                      <button
                        onClick={() => isAdmin && handleTogglePublic(quest.id, quest.is_public)}
                        disabled={isAdvisor}
                        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                          isAdvisor
                            ? 'opacity-50 cursor-not-allowed'
                            : 'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
                        } ${quest.is_public ? 'bg-blue-500' : 'bg-gray-300'}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            quest.is_public ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Created by info */}
                    {quest.creator_name && (
                      <div className="mb-4 p-3 bg-purple-50 rounded-lg">
                        <span className="text-xs text-gray-600">Created by</span>
                        <p className="text-sm font-medium text-gray-700">{quest.creator_name}</p>
                      </div>
                    )}

                    {/* Admin Action Buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleEdit(quest)}
                        className="min-h-[44px] px-4 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(quest.id)}
                        className="min-h-[44px] px-4 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                      <button
                        onClick={() => handleUploadImage(quest.id)}
                        className="min-h-[44px] px-4 py-2 text-sm bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Upload
                      </button>
                      <button
                        onClick={() => handleRefreshImage(quest.id)}
                        className="min-h-[44px] px-4 py-2 text-sm bg-purple-50 text-optio-purple rounded-lg hover:bg-purple-100 transition-colors font-medium flex items-center justify-center gap-2"
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

      {/* Bulk Quest Generator */}
      {showBulkGenerator && (
        <BulkQuestGenerator
          onClose={() => setShowBulkGenerator(false)}
          onSuccess={() => {
            fetchQuests()
            setShowBulkGenerator(false)
          }}
        />
      )}

      {/* AI Quest Review Modal */}
      {showAIReviewModal && (
        <Suspense fallback={<div />}>
          <AIQuestReviewModal
            isOpen={showAIReviewModal}
            onClose={() => setShowAIReviewModal(false)}
            onApprove={() => {
              fetchQuests()
            }}
          />
        </Suspense>
      )}
    </div>
  )
}

export default memo(AdminQuests)