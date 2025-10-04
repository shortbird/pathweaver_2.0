import React, { useState, useEffect } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

const UnifiedQuestForm = ({ mode = 'create', quest = null, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  // Form state - simplified to title + idea only
  const [formData, setFormData] = useState({
    title: '',
    big_idea: '',
    is_active: true
  })

  // Initialize form data for edit mode
  useEffect(() => {
    if (mode === 'edit' && quest) {
      setFormData({
        title: quest.title || '',
        big_idea: quest.big_idea || quest.description || '',
        is_active: quest.is_active !== undefined ? quest.is_active : true
      })
    }
  }, [mode, quest])

  const validateForm = () => {
    const newErrors = {}

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
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
        title: formData.title.trim(),
        big_idea: formData.big_idea.trim(),
        is_active: formData.is_active
      }

      const endpoint = mode === 'edit'
        ? `/api/v3/admin/quests/${quest.id}`
        : '/api/v3/admin/quests/create-v3'

      const method = mode === 'edit' ? 'put' : 'post'
      const response = await api[method](endpoint, submitData)

      toast.success(`Quest ${mode === 'edit' ? 'updated' : 'created'} successfully! Tasks can now be added per student.`)
      onSuccess && onSuccess(response.data.quest)
      onClose()
    } catch (error) {
      console.error(`Error ${mode === 'edit' ? 'updating' : 'creating'} quest:`, error)
      const errorMessage = error.response?.data?.error || `Failed to ${mode === 'edit' ? 'update' : 'create'} quest`
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
            {mode === 'edit' ? 'Edit Quest' : 'Create New Quest'}
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
              <strong>Note:</strong> Quests are now personalized per student. After creating a quest, advisors can add custom tasks for each student through the user management interface.
            </p>
          </div>

          {/* Quest Details */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-800">
                Quest Title
                <span className="text-red-500 font-bold ml-1">*</span>
                <span className="text-xs font-normal text-gray-500 ml-1">(Required)</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => {
                  setFormData({ ...formData, title: e.target.value })
                  if (errors.title) {
                    setErrors({ ...errors, title: '' })
                  }
                }}
                className={`w-full px-4 py-3 border-2 rounded-lg transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 ${errors.title ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="e.g., Build a Community Garden"
              />
              <p className="text-xs text-gray-500 mt-1">
                Create an engaging title that clearly describes what students will accomplish
              </p>
              {errors.title && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm flex items-center">
                    <AlertCircle size={16} className="mr-2 flex-shrink-0" />
                    {errors.title}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-600">
                Big Idea / Description
                <span className="text-xs text-gray-400 ml-1">(Optional)</span>
              </label>
              <textarea
                value={formData.big_idea}
                onChange={(e) => setFormData({ ...formData, big_idea: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg border-gray-200 bg-gray-50/50 transition-all focus:bg-white focus:border-gray-400"
                rows={4}
                placeholder="Describe the quest's main concept and learning goals (optional)"
              />
              <p className="text-xs text-gray-500 mt-1">
                Provide context about why this quest matters and what students will gain
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-600">Status</label>
              <select
                value={formData.is_active.toString()}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Only active quests will be visible to students
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
              className="px-6 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? (mode === 'edit' ? 'Updating...' : 'Creating...') : (mode === 'edit' ? 'Update Quest' : 'Create Quest')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default UnifiedQuestForm
