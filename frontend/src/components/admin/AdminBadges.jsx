import React, { useState, useEffect, memo } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import BadgeForm from './BadgeForm'
import BadgeQuestManager from './BadgeQuestManager'

const AdminBadges = () => {
  const [badges, setBadges] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingBadge, setEditingBadge] = useState(null)
  const [showCreationForm, setShowCreationForm] = useState(false)
  const [managingQuestsBadge, setManagingQuestsBadge] = useState(null)

  useEffect(() => {
    fetchBadges()
  }, [])

  const fetchBadges = async () => {
    try {
      const response = await api.get('/api/admin/badges')
      setBadges(response.data.badges)
    } catch (error) {
      toast.error('Failed to load badges')
    } finally {
      setLoading(false)
    }
  }

  const handleBadgeSave = () => {
    setEditingBadge(null)
    setShowCreationForm(false)
    fetchBadges()
  }

  const handleEdit = (badge) => {
    setEditingBadge(badge)
  }

  const handleDelete = async (badgeId) => {
    if (window.confirm('Are you sure you want to delete this badge? This will remove all user progress for this badge.')) {
      try {
        await api.delete(`/api/admin/badges/${badgeId}`)
        toast.success('Badge deleted successfully')
        fetchBadges()
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to delete badge')
      }
    }
  }

  const handleRefreshImage = async (badgeId) => {
    try {
      await api.post(`/api/admin/badges/${badgeId}/refresh-image`, {})
      toast.success('Badge image refreshed successfully')
      fetchBadges()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to refresh badge image')
    }
  }

  const handleUploadImage = (badgeId) => {
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
          `/api/admin/badges/${badgeId}/upload-image`,
          formData
        )

        toast.dismiss(loadingToast)
        toast.success('Badge image uploaded successfully')
        fetchBadges()
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to upload image')
      }
    }

    // Trigger file selection dialog
    fileInput.click()
  }

  const handleManageQuests = (badge) => {
    setManagingQuestsBadge(badge)
  }

  // Get pillar icon
  const getPillarIcon = (pillar) => {
    const icons = {
      stem: '🔬',
      wellness: '💚',
      communication: '💬',
      civics: '🏛️',
      art: '🎨'
    }
    return icons[pillar] || '🎯'
  }

  // Get pillar color
  const getPillarColor = (pillar) => {
    const colors = {
      stem: 'from-blue-500 to-cyan-500',
      wellness: 'from-green-500 to-emerald-500',
      communication: 'from-purple-500 to-pink-500',
      civics: 'from-red-500 to-orange-500',
      art: 'from-yellow-500 to-orange-500'
    }
    return colors[pillar] || 'from-gray-500 to-gray-600'
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold">Manage Badges</h2>
        <button
          onClick={() => setShowCreationForm(true)}
          className="bg-gradient-primary text-white px-6 py-2 rounded-lg hover:opacity-90 font-semibold"
        >
          Create Badge
        </button>
      </div>

      {editingBadge && (
        <BadgeForm
          mode="edit"
          badge={editingBadge}
          onClose={() => setEditingBadge(null)}
          onSuccess={handleBadgeSave}
        />
      )}

      {showCreationForm && (
        <BadgeForm
          mode="create"
          onClose={() => setShowCreationForm(false)}
          onSuccess={handleBadgeSave}
        />
      )}

      {managingQuestsBadge && (
        <BadgeQuestManager
          badge={managingQuestsBadge}
          onClose={() => setManagingQuestsBadge(null)}
          onUpdate={fetchBadges}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gradient-to-r bg-gradient-primary"></div>
        </div>
      ) : (
        <div>
          {badges.length === 0 ? (
            <div className="text-center py-16 text-gray-500 bg-gray-50 rounded-xl">
              <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
              </svg>
              <p className="text-lg font-semibold">No badges found</p>
              <p className="text-sm mt-2">Create your first badge using the button above</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {badges.map(badge => (
                <div
                  key={badge.id}
                  className="group bg-white rounded-xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-gray-100"
                >
                  {/* Image Section with Title Overlay */}
                  <div className="relative h-48 overflow-hidden">
                    {/* Background Image */}
                    {badge.image_url ? (
                      <img
                        src={badge.image_url}
                        alt={`Badge: ${badge.name} - ${badge.pillar_primary || 'Achievement'} badge`}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${getPillarColor(badge.pillar_primary)}`} />
                    )}

                    {/* Gradient Overlay for Text Readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />

                    {/* Pillar Icon Badge */}
                    <div className="absolute top-4 right-4">
                      <div className={`w-10 h-10 bg-gradient-to-br ${getPillarColor(badge.pillar_primary)} rounded-full flex items-center justify-center text-xl shadow-lg`}>
                        {getPillarIcon(badge.pillar_primary)}
                      </div>
                    </div>

                    {/* Title Overlay */}
                    <div className="absolute inset-x-0 bottom-0 p-6">
                      <h3 className="text-white text-xl font-bold leading-tight drop-shadow-lg line-clamp-2">
                        {badge.name}
                      </h3>
                      {badge.quest_count > 0 && (
                        <p className="text-white/90 text-sm mt-1 drop-shadow">
                          {badge.quest_count} {badge.quest_count === 1 ? 'quest' : 'quests'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Info Section */}
                  <div className="bg-white p-6">
                    <p className="text-gray-600 text-sm italic leading-relaxed line-clamp-2 mb-2">
                      "{badge.identity_statement}"
                    </p>
                    <p className="text-gray-500 text-xs mb-3">
                      {badge.min_quests} quests • {badge.min_xp} XP required
                    </p>
                    <p className="text-gray-600 text-sm leading-relaxed line-clamp-3 mb-4">
                      {badge.description}
                    </p>

                    {/* Status Badge */}
                    <div className="mb-4">
                      {badge.is_active ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Inactive
                        </span>
                      )}
                    </div>

                    {/* Admin Action Buttons */}
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <button
                        onClick={() => handleEdit(badge)}
                        className="min-h-[44px] px-4 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(badge.id)}
                        className="min-h-[44px] px-4 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                      <button
                        onClick={() => handleUploadImage(badge.id)}
                        className="min-h-[44px] px-4 py-2 text-sm bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Upload
                      </button>
                      <button
                        onClick={() => handleRefreshImage(badge.id)}
                        className="min-h-[44px] px-4 py-2 text-sm bg-purple-50 text-optio-purple rounded-lg hover:bg-purple-100 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                      </button>
                    </div>

                    {/* Manage Quests Button */}
                    <button
                      onClick={() => handleManageQuests(badge)}
                      className="w-full px-4 py-2 text-sm bg-gradient-primary text-white rounded-lg hover:opacity-90 transition-opacity font-medium flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Manage Quests ({badge.quest_count})
                    </button>
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

export default memo(AdminBadges)
