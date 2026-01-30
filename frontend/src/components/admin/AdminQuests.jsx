import React, { useState, useEffect, memo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import toast from 'react-hot-toast'
import UnifiedQuestForm from './UnifiedQuestForm'
import CourseQuestForm from './CourseQuestForm'
import { useBulkSelection } from '../../hooks/useBulkSelection'

const AdminQuests = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showManager, setShowManager] = useState(false)
  const [editingQuest, setEditingQuest] = useState(null)
  const [showCreationForm, setShowCreationForm] = useState(false)
  const [showCourseQuestForm, setShowCourseQuestForm] = useState(false)
  const [activeFilter, setActiveFilter] = useState('all')
  const [questTypeFilter, setQuestTypeFilter] = useState('all')
  const [publicFilter, setPublicFilter] = useState('all')
  const [isProcessing, setIsProcessing] = useState(false)
  const [openDropdownId, setOpenDropdownId] = useState(null)

  // Bulk image generation progress
  const [bulkProgress, setBulkProgress] = useState(null)
  const cancelBulkRef = useRef(false)

  // Use bulk selection hook
  const {
    selectedIds,
    selectedIdsSet,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    isSelected,
    selectedCount,
    isAllSelected,
    hasSelection
  } = useBulkSelection({ items: quests, idKey: 'id' })

  // Determine user role
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isSuperAdmin = user?.role === 'superadmin'
  const isAdvisor = user?.role === 'advisor'

  useEffect(() => {
    fetchQuests()
    clearSelection()
  }, [activeFilter, questTypeFilter, publicFilter])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (openDropdownId && !e.target.closest('.quest-dropdown')) {
        setOpenDropdownId(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [openDropdownId])

  const fetchQuests = async () => {
    setLoading(true)
    try {
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

  const handleQuestSave = (updatedQuest) => {
    setShowManager(false)
    // Update the quest in state if we have updated data
    if (updatedQuest?.id) {
      setQuests(prev => prev.map(q =>
        q.id === updatedQuest.id ? { ...q, ...updatedQuest } : q
      ))
    }
    setEditingQuest(null)
  }

  const handleEdit = (quest) => {
    if (quest.quest_type === 'course') {
      // Edit course quests with CourseQuestForm
      setEditingQuest(quest)
      setShowCourseQuestForm(true)
      setOpenDropdownId(null)
      return
    }
    setEditingQuest(quest)
    setShowManager(true)
    setOpenDropdownId(null)
  }

  const handleDelete = async (questId) => {
    if (window.confirm('Are you sure you want to delete this quest?')) {
      try {
        await api.delete(`/api/admin/quests/${questId}`)
        toast.success('Quest deleted successfully')
        setQuests(prev => prev.filter(q => q.id !== questId))
      } catch (error) {
        toast.error('Failed to delete quest')
      }
    }
    setOpenDropdownId(null)
  }

  const handleRefreshImage = async (questId) => {
    try {
      const response = await api.post(`/api/admin/quests/${questId}/refresh-image`, {})
      const newImageUrl = response.data.image_url
      if (newImageUrl) {
        setQuests(prev => prev.map(q =>
          q.id === questId ? { ...q, image_url: newImageUrl, header_image_url: newImageUrl } : q
        ))
      }
      toast.success('Quest image refreshed successfully')
    } catch (error) {
      toast.error('Failed to refresh quest image')
    }
    setOpenDropdownId(null)
  }

  const handleCloneToOptio = async (questId) => {
    if (!window.confirm('Clone this quest to Optio library? AI will enhance the content to match Optio standards.')) return

    try {
      setIsProcessing(true)
      const response = await api.post(`/api/admin/quests/${questId}/clone-to-optio`, {})
      toast.success('Quest cloned to Optio! It is saved as a draft.')
      fetchQuests()  // Refresh list to show new quest
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to clone quest')
    } finally {
      setIsProcessing(false)
      setOpenDropdownId(null)
    }
  }

  const handleUploadImage = (questId) => {
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/jpeg,image/jpg,image/png,image/gif,image/webp'
    fileInput.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      const maxSize = 5 * 1024 * 1024
      if (file.size > maxSize) {
        toast.error('Image size must be less than 5MB')
        return
      }
      const formData = new FormData()
      formData.append('file', file)
      try {
        const loadingToast = toast.loading('Uploading image...')
        const response = await api.post(`/api/admin/quests/${questId}/upload-image`, formData)
        toast.dismiss(loadingToast)
        const newImageUrl = response.data.image_url
        if (newImageUrl) {
          setQuests(prev => prev.map(q =>
            q.id === questId ? { ...q, image_url: newImageUrl, header_image_url: newImageUrl } : q
          ))
        }
        toast.success('Quest image uploaded successfully')
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to upload image')
      }
    }
    fileInput.click()
    setOpenDropdownId(null)
  }

  const handleToggleActive = async (questId, currentStatus) => {
    const newStatus = !currentStatus
    setQuests(prev => prev.map(q =>
      q.id === questId ? { ...q, is_active: newStatus } : q
    ))
    api.put(`/api/admin/quests/${questId}`, { is_active: newStatus })
      .catch(error => {
        setQuests(prev => prev.map(q =>
          q.id === questId ? { ...q, is_active: currentStatus } : q
        ))
        toast.error('Failed to update quest status')
      })
  }

  const handleTogglePublic = async (questId, currentStatus) => {
    const newStatus = !currentStatus
    setQuests(prev => prev.map(q =>
      q.id === questId ? { ...q, is_public: newStatus } : q
    ))
    api.put(`/api/admin/quests/${questId}`, { is_public: newStatus })
      .catch(error => {
        setQuests(prev => prev.map(q =>
          q.id === questId ? { ...q, is_public: currentStatus } : q
        ))
        toast.error('Failed to update quest visibility')
      })
  }

  // Bulk action handlers
  const handleBulkDelete = async () => {
    if (selectedCount === 0) return
    const confirmMessage = `Are you sure you want to delete ${selectedCount} quest${selectedCount > 1 ? 's' : ''}? This action cannot be undone.`
    if (!window.confirm(confirmMessage)) return

    const idsToDelete = [...selectedIds]
    setIsProcessing(true)
    try {
      const response = await api.post('/api/admin/quests/bulk-delete', {
        quest_ids: idsToDelete
      })
      if (response.data.success) {
        toast.success(`Deleted ${response.data.deleted_count} quest${response.data.deleted_count > 1 ? 's' : ''}`)
        if (response.data.failed?.length > 0) {
          toast.error(`Failed to delete ${response.data.failed.length} quest(s)`)
        }
        // Remove deleted quests from state
        const failedIds = new Set(response.data.failed?.map(f => f.id) || [])
        setQuests(prev => prev.filter(q => !idsToDelete.includes(q.id) || failedIds.has(q.id)))
        clearSelection()
      }
    } catch (error) {
      const errorData = error.response?.data?.error
      const errorMessage = typeof errorData === 'string'
        ? errorData
        : errorData?.message || 'Failed to delete quests'
      toast.error(errorMessage)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBulkActivate = async () => {
    if (selectedCount === 0) return
    const idsToUpdate = [...selectedIds]
    setIsProcessing(true)
    try {
      const response = await api.post('/api/admin/quests/bulk-update', {
        quest_ids: idsToUpdate,
        updates: { is_active: true }
      })
      toast.success(`Activated ${response.data.updated_count} quest${response.data.updated_count > 1 ? 's' : ''}`)
      setQuests(prev => prev.map(q =>
        idsToUpdate.includes(q.id) ? { ...q, is_active: true } : q
      ))
      clearSelection()
    } catch (error) {
      toast.error('Failed to activate quests')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBulkDeactivate = async () => {
    if (selectedCount === 0) return
    const idsToUpdate = [...selectedIds]
    setIsProcessing(true)
    try {
      const response = await api.post('/api/admin/quests/bulk-update', {
        quest_ids: idsToUpdate,
        updates: { is_active: false }
      })
      toast.success(`Deactivated ${response.data.updated_count} quest${response.data.updated_count > 1 ? 's' : ''}`)
      setQuests(prev => prev.map(q =>
        idsToUpdate.includes(q.id) ? { ...q, is_active: false } : q
      ))
      clearSelection()
    } catch (error) {
      toast.error('Failed to deactivate quests')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBulkPublish = async () => {
    if (selectedCount === 0) return
    const idsToUpdate = [...selectedIds]
    setIsProcessing(true)
    try {
      const response = await api.post('/api/admin/quests/bulk-update', {
        quest_ids: idsToUpdate,
        updates: { is_public: true }
      })
      toast.success(`Published ${response.data.updated_count} quest${response.data.updated_count > 1 ? 's' : ''}`)
      setQuests(prev => prev.map(q =>
        idsToUpdate.includes(q.id) ? { ...q, is_public: true } : q
      ))
      clearSelection()
    } catch (error) {
      toast.error('Failed to publish quests')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBulkUnpublish = async () => {
    if (selectedCount === 0) return
    const idsToUpdate = [...selectedIds]
    setIsProcessing(true)
    try {
      const response = await api.post('/api/admin/quests/bulk-update', {
        quest_ids: idsToUpdate,
        updates: { is_public: false }
      })
      toast.success(`Unpublished ${response.data.updated_count} quest${response.data.updated_count > 1 ? 's' : ''}`)
      setQuests(prev => prev.map(q =>
        idsToUpdate.includes(q.id) ? { ...q, is_public: false } : q
      ))
      clearSelection()
    } catch (error) {
      toast.error('Failed to unpublish quests')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBulkGenerateImages = async () => {
    if (selectedCount === 0) return
    cancelBulkRef.current = false
    const idsToProcess = [...selectedIds]
    let failedCount = 0
    setBulkProgress({ current: 0, total: idsToProcess.length, currentQuest: null, failed: 0 })

    for (let i = 0; i < idsToProcess.length; i++) {
      if (cancelBulkRef.current) {
        toast.success('Image generation cancelled')
        break
      }

      const questId = idsToProcess[i]
      const quest = quests.find(q => q.id === questId)
      setBulkProgress(p => ({ ...p, current: i, currentQuest: quest?.title || 'Unknown' }))

      try {
        const response = await api.post(`/api/admin/quests/${questId}/refresh-image`, {})
        const newImageUrl = response.data.image_url
        if (newImageUrl) {
          setQuests(prev => prev.map(q =>
            q.id === questId ? { ...q, image_url: newImageUrl, header_image_url: newImageUrl } : q
          ))
        }
      } catch (err) {
        failedCount++
        setBulkProgress(p => ({ ...p, failed: p.failed + 1 }))
      }
    }

    setBulkProgress(null)
    clearSelection()

    if (!cancelBulkRef.current) {
      toast.success(`Generated images for ${idsToProcess.length - failedCount} quest${idsToProcess.length > 1 ? 's' : ''}`)
    }
  }

  const handleCancelBulkGenerate = () => {
    cancelBulkRef.current = true
  }

  // Dropdown menu component
  const QuestDropdown = ({ quest }) => {
    const isOpen = openDropdownId === quest.id
    return (
      <div className="relative quest-dropdown">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setOpenDropdownId(isOpen ? null : quest.id)
          }}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
        {isOpen && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50">
            <button
              onClick={() => handleEdit(quest)}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Quest
            </button>
            <button
              onClick={() => handleUploadImage(quest.id)}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Upload Image
            </button>
            <button
              onClick={() => handleRefreshImage(quest.id)}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Generate Image
            </button>
            {/* Clone to Optio - For superadmin to clone user-generated quests into polished Optio platform quests */}
            {isSuperAdmin && quest.created_by !== user?.id && (
              <>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={() => handleCloneToOptio(quest.id)}
                  disabled={isProcessing}
                  className="w-full px-4 py-2 text-left text-sm text-optio-purple hover:bg-purple-50 flex items-center gap-2 disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Clone to Optio
                </button>
              </>
            )}
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={() => handleDelete(quest.id)}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Quest
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold">Manage Quests</h2>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            onClick={() => navigate('/courses/new')}
            className="bg-optio-purple text-white px-6 py-2 rounded-lg hover:opacity-90 font-semibold"
          >
            Create Course
          </button>
          <button
            onClick={() => setShowCourseQuestForm(true)}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:opacity-90 font-semibold"
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

      {/* Bulk Action Toolbar - Shows when items selected */}
      {isSuperAdmin && hasSelection && (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-optio-purple/10 rounded-lg border border-optio-purple/20">
          <span className="font-semibold text-optio-purple mr-2">{selectedCount} selected</span>
          <button
            onClick={handleBulkActivate}
            disabled={isProcessing}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
          >
            Activate
          </button>
          <button
            onClick={handleBulkDeactivate}
            disabled={isProcessing}
            className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 font-medium"
          >
            Deactivate
          </button>
          <button
            onClick={handleBulkPublish}
            disabled={isProcessing}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            Publish
          </button>
          <button
            onClick={handleBulkUnpublish}
            disabled={isProcessing}
            className="px-3 py-1.5 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 font-medium"
          >
            Unpublish
          </button>
          <button
            onClick={handleBulkGenerateImages}
            disabled={isProcessing}
            className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium"
          >
            Generate Images
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={isProcessing}
            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
          >
            Delete
          </button>
          <button
            onClick={clearSelection}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 font-medium ml-auto"
          >
            Clear Selection
          </button>
        </div>
      )}

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        {/* Select All Checkbox - Superadmin only */}
        {isSuperAdmin && quests.length > 0 && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="selectAll"
              checked={isAllSelected}
              onChange={toggleSelectAll}
              className="w-5 h-5 rounded border-gray-300 text-optio-purple focus:ring-optio-purple cursor-pointer"
            />
            <label htmlFor="selectAll" className="text-sm font-medium text-gray-600 cursor-pointer">
              Select All
            </label>
          </div>
        )}

        {/* Divider when selection controls are visible */}
        {isSuperAdmin && quests.length > 0 && (
          <div className="h-6 w-px bg-gray-300" />
        )}

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

      {/* Forms */}
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
            if (newQuest?.id) {
              setQuests(prev => [newQuest, ...prev])
            }
            setShowCreationForm(false)
          }}
        />
      )}

      {showCourseQuestForm && (
        <CourseQuestForm
          mode={editingQuest ? 'edit' : 'create'}
          quest={editingQuest}
          onClose={() => {
            setShowCourseQuestForm(false)
            setEditingQuest(null)
          }}
          onSuccess={(updatedQuest) => {
            if (updatedQuest?.id) {
              if (editingQuest) {
                setQuests(prev => prev.map(q => q.id === updatedQuest.id ? { ...q, ...updatedQuest } : q))
              } else {
                setQuests(prev => [updatedQuest, ...prev])
              }
            }
            setShowCourseQuestForm(false)
            setEditingQuest(null)
            fetchQuests()
          }}
        />
      )}

      {/* Info Banner for Course Quests */}
      {questTypeFilter === 'course' && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-800">
            <strong>Course Quests</strong> have preset tasks aligned to existing curriculum (e.g., Khan Academy). Students do not personalize tasks - they receive the preset tasks automatically when enrolling.
          </p>
        </div>
      )}

      {/* Quest Grid */}
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
                  onClick={() => isSuperAdmin && hasSelection && toggleSelection(quest.id)}
                  className={`group relative bg-white rounded-xl transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-2 ${
                    isSelected(quest.id) ? 'border-optio-purple ring-2 ring-optio-purple/20' : 'border-gray-100'
                  } ${isSuperAdmin && hasSelection ? 'cursor-pointer' : ''} ${openDropdownId === quest.id ? 'z-40' : 'z-0'}`}
                >
                  {/* Image Section with Title Overlay */}
                  <div className="relative h-48 overflow-hidden rounded-t-xl">
                    {quest.image_url || quest.header_image_url ? (
                      <img
                        src={quest.image_url || quest.header_image_url}
                        alt={`Quest: ${quest.title}`}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br bg-gradient-primary" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />

                    {/* Selection Checkbox - Superadmin only */}
                    {isSuperAdmin && (
                      <div className="absolute top-4 left-4 z-10">
                        <input
                          type="checkbox"
                          checked={isSelected(quest.id)}
                          onChange={() => toggleSelection(quest.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-5 h-5 rounded border-2 border-white bg-white/90 text-optio-purple focus:ring-optio-purple focus:ring-offset-0 cursor-pointer shadow-lg"
                        />
                      </div>
                    )}

                    {/* Status Badges */}
                    <div className="absolute top-4 right-4 flex flex-col items-end gap-1">
                      {quest.is_active && (
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-500 text-white">
                          Active
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        quest.quest_type === 'course' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'
                      }`}>
                        {quest.quest_type === 'course' ? 'Course Quest' : 'Optio Quest'}
                      </span>
                      {quest.is_project && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500 text-white" title={quest.connected_courses?.map(c => c.course_title).join(', ')}>
                          Project
                        </span>
                      )}
                    </div>

                    {/* Title Overlay */}
                    <div className="absolute inset-x-0 bottom-0 p-6">
                      <h3 className="text-white text-xl font-bold leading-tight drop-shadow-lg line-clamp-2">
                        {quest.title}
                      </h3>
                    </div>
                  </div>

                  {/* Content Section */}
                  <div className="bg-white p-6 rounded-b-xl">
                    <p className="text-gray-600 text-sm leading-relaxed line-clamp-3 mb-4">
                      {quest.description || quest.big_idea || 'No description available'}
                    </p>

                    {/* Active Toggle */}
                    <div className="flex items-center justify-between min-h-[44px] mb-3 p-3 bg-gray-50 rounded-lg" onClick={(e) => e.stopPropagation()}>
                      <span className="text-sm font-medium text-gray-700">
                        Active
                        {isAdvisor && <span className="text-xs text-gray-500 ml-1">(Admin only)</span>}
                      </span>
                      <button
                        onClick={() => isAdmin && handleToggleActive(quest.id, quest.is_active)}
                        disabled={isAdvisor}
                        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                          isAdvisor ? 'opacity-50 cursor-not-allowed' : 'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2'
                        } ${quest.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          quest.is_active ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>

                    {/* Public Toggle */}
                    <div className="flex items-center justify-between min-h-[44px] mb-4 p-3 bg-blue-50 rounded-lg" onClick={(e) => e.stopPropagation()}>
                      <span className="text-sm font-medium text-gray-700">
                        Public
                        {isAdvisor && <span className="text-xs text-gray-500 ml-1">(Admin only)</span>}
                      </span>
                      <button
                        onClick={() => isAdmin && handleTogglePublic(quest.id, quest.is_public)}
                        disabled={isAdvisor}
                        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                          isAdvisor ? 'opacity-50 cursor-not-allowed' : 'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
                        } ${quest.is_public ? 'bg-blue-500' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          quest.is_public ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>

                    {/* Creator Info & Dropdown Menu */}
                    <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                      {quest.creator_name ? (
                        <div className="flex-1 mr-2 p-2 bg-purple-50 rounded-lg">
                          <span className="text-xs text-gray-600">Created by</span>
                          <p className="text-sm font-medium text-gray-700 truncate">{quest.creator_name}</p>
                        </div>
                      ) : (
                        <div className="flex-1" />
                      )}
                      <QuestDropdown quest={quest} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bulk Progress Modal */}
      {bulkProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Generating Images</h3>
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Progress</span>
                <span>{bulkProgress.current} / {bulkProgress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-optio-purple to-optio-pink h-3 rounded-full transition-all duration-300"
                  style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                />
              </div>
            </div>
            {bulkProgress.currentQuest && (
              <p className="text-sm text-gray-600 mb-4 truncate">
                Currently: {bulkProgress.currentQuest}
              </p>
            )}
            {bulkProgress.failed > 0 && (
              <p className="text-sm text-red-600 mb-4">
                {bulkProgress.failed} failed
              </p>
            )}
            <button
              onClick={handleCancelBulkGenerate}
              className="w-full px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(AdminQuests)
