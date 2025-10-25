import React, { useState, useEffect } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

const BadgeForm = ({ mode = 'create', badge = null, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    identity_statement: '',
    description: '',
    pillar_primary: 'stem',
    min_quests: 5,
    min_xp: 1500,
    is_active: true
  })

  // Initialize form data for edit mode
  useEffect(() => {
    if (mode === 'edit' && badge) {
      setFormData({
        name: badge.name || '',
        identity_statement: badge.identity_statement || '',
        description: badge.description || '',
        pillar_primary: badge.pillar_primary || 'stem',
        min_quests: badge.min_quests || 5,
        min_xp: badge.min_xp || 1500,
        is_active: badge.is_active !== undefined ? badge.is_active : true
      })
    }
  }, [mode, badge])

  const validateForm = () => {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Badge name is required'
    }

    if (!formData.identity_statement.trim()) {
      newErrors.identity_statement = 'Identity statement is required'
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }

    if (formData.min_quests < 1) {
      newErrors.min_quests = 'Minimum quests must be at least 1'
    }

    if (formData.min_xp < 0) {
      newErrors.min_xp = 'Minimum XP cannot be negative'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      toast.error('Please fix all errors before submitting')
      return
    }

    setLoading(true)

    try {
      // Prepare data for submission
      const submitData = {
        name: formData.name.trim(),
        identity_statement: formData.identity_statement.trim(),
        description: formData.description.trim(),
        pillar_primary: formData.pillar_primary,
        min_quests: parseInt(formData.min_quests),
        min_xp: parseInt(formData.min_xp),
        is_active: formData.is_active
      }

      const endpoint = mode === 'edit'
        ? `/api/admin/badges/${badge.id}`
        : '/api/admin/badges/create'

      const method = mode === 'edit' ? 'put' : 'post'
      const response = await api[method](endpoint, submitData)

      toast.success(`Badge ${mode === 'edit' ? 'updated' : 'created'} successfully!`)
      onSuccess && onSuccess(response.data.badge)
      onClose()
    } catch (error) {
      console.error(`Error ${mode === 'edit' ? 'updating' : 'creating'} badge:`, error)
      const errorMessage = error.response?.data?.error || `Failed to ${mode === 'edit' ? 'update' : 'create'} badge`
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            {mode === 'edit' ? 'Edit Badge' : 'Create New Badge'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Info Message */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Badge Design:</strong> Badges recognize achievement in specific skill areas.
              Students earn badges by completing required quests and earning minimum XP.
              You can associate quests with badges after creation.
            </p>
          </div>

          {/* Badge Details */}
          <div className="space-y-6">
            {/* Badge Name */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-800">
                Badge Name
                <span className="text-red-500 font-bold ml-1">*</span>
                <span className="text-xs font-normal text-gray-500 ml-1">(Required)</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value })
                  if (errors.name) {
                    setErrors({ ...errors, name: '' })
                  }
                }}
                className={`w-full px-4 py-3 border-2 rounded-lg transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="e.g., Environmental Steward"
              />
              <p className="text-xs text-gray-500 mt-1">
                A clear, memorable name that represents the achievement
              </p>
              {errors.name && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm flex items-center">
                    <AlertCircle size={16} className="mr-2 flex-shrink-0" />
                    {errors.name}
                  </p>
                </div>
              )}
            </div>

            {/* Identity Statement */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-800">
                Identity Statement
                <span className="text-red-500 font-bold ml-1">*</span>
                <span className="text-xs font-normal text-gray-500 ml-1">(Required)</span>
              </label>
              <input
                type="text"
                value={formData.identity_statement}
                onChange={(e) => {
                  setFormData({ ...formData, identity_statement: e.target.value })
                  if (errors.identity_statement) {
                    setErrors({ ...errors, identity_statement: '' })
                  }
                }}
                className={`w-full px-4 py-3 border-2 rounded-lg transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 ${errors.identity_statement ? 'border-red-500' : 'border-gray-300'}`}
                placeholder='e.g., "I am a community leader who takes action on environmental issues"'
              />
              <p className="text-xs text-gray-500 mt-1">
                Complete this sentence: "I am..." or "I can..." - Reflects the identity achieved
              </p>
              {errors.identity_statement && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm flex items-center">
                    <AlertCircle size={16} className="mr-2 flex-shrink-0" />
                    {errors.identity_statement}
                  </p>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-800">
                Description
                <span className="text-red-500 font-bold ml-1">*</span>
                <span className="text-xs font-normal text-gray-500 ml-1">(Required)</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => {
                  setFormData({ ...formData, description: e.target.value })
                  if (errors.description) {
                    setErrors({ ...errors, description: '' })
                  }
                }}
                className={`w-full px-4 py-3 border-2 rounded-lg transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 ${errors.description ? 'border-red-500' : 'border-gray-300'}`}
                rows={4}
                placeholder="Describe what this badge represents and what students will learn"
              />
              <p className="text-xs text-gray-500 mt-1">
                Provide context about the skills and achievements this badge represents
              </p>
              {errors.description && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm flex items-center">
                    <AlertCircle size={16} className="mr-2 flex-shrink-0" />
                    {errors.description}
                  </p>
                </div>
              )}
            </div>

            {/* Primary Pillar */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-800">
                Primary Pillar
                <span className="text-red-500 font-bold ml-1">*</span>
              </label>
              <select
                value={formData.pillar_primary}
                onChange={(e) => setFormData({ ...formData, pillar_primary: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              >
                <option value="stem">🔬 STEM</option>
                <option value="wellness">💚 Wellness</option>
                <option value="communication">💬 Communication</option>
                <option value="civics">🏛️ Civics</option>
                <option value="art">🎨 Art</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                The primary skill pillar this badge focuses on
              </p>
            </div>

            {/* Requirements Section */}
            <div className="grid grid-cols-2 gap-4">
              {/* Minimum Quests */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-800">
                  Minimum Quests
                  <span className="text-red-500 font-bold ml-1">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.min_quests}
                  onChange={(e) => {
                    setFormData({ ...formData, min_quests: e.target.value })
                    if (errors.min_quests) {
                      setErrors({ ...errors, min_quests: '' })
                    }
                  }}
                  className={`w-full px-4 py-3 border-2 rounded-lg transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 ${errors.min_quests ? 'border-red-500' : 'border-gray-300'}`}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Number of quests to complete
                </p>
                {errors.min_quests && (
                  <p className="text-red-700 text-xs mt-1">{errors.min_quests}</p>
                )}
              </div>

              {/* Minimum XP */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-800">
                  Minimum XP
                  <span className="text-red-500 font-bold ml-1">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={formData.min_xp}
                  onChange={(e) => {
                    setFormData({ ...formData, min_xp: e.target.value })
                    if (errors.min_xp) {
                      setErrors({ ...errors, min_xp: '' })
                    }
                  }}
                  className={`w-full px-4 py-3 border-2 rounded-lg transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 ${errors.min_xp ? 'border-red-500' : 'border-gray-300'}`}
                />
                <p className="text-xs text-gray-500 mt-1">
                  XP required to earn badge
                </p>
                {errors.min_xp && (
                  <p className="text-red-700 text-xs mt-1">{errors.min_xp}</p>
                )}
              </div>
            </div>

            {/* Status Toggle */}
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-800">Status</label>
              <select
                value={formData.is_active.toString()}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Only active badges will be visible to students
              </p>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-4 pt-8 border-t mt-8">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-gradient-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? (mode === 'edit' ? 'Updating...' : 'Creating...') : (mode === 'edit' ? 'Update Badge' : 'Create Badge')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default BadgeForm
