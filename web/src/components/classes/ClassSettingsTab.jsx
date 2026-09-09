import React, { useState, useEffect } from 'react'

/**
 * ClassSettingsTab - Edit class name, description, and XP threshold
 */
export default function ClassSettingsTab({ classData, onUpdate, isOrgAdmin }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    xp_threshold: 100,
  })
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    if (classData) {
      setFormData({
        name: classData.name || '',
        description: classData.description || '',
        xp_threshold: classData.xp_threshold || 100,
      })
    }
  }, [classData])

  const handleChange = (e) => {
    const { name, value } = e.target
    const newValue = name === 'xp_threshold' ? parseInt(value) || 0 : value
    setFormData((prev) => ({
      ...prev,
      [name]: newValue,
    }))
    setHasChanges(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      return
    }

    setSaving(true)
    try {
      await onUpdate(formData)
      setHasChanges(false)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setFormData({
      name: classData.name || '',
      description: classData.description || '',
      xp_threshold: classData.xp_threshold || 100,
    })
    setHasChanges(false)
  }

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Class Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., English 101"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Optional class description"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
          />
        </div>

        {/* XP Threshold */}
        <div>
          <label htmlFor="xp_threshold" className="block text-sm font-medium text-gray-700 mb-1">
            XP Required for Completion
          </label>
          <div className="relative max-w-xs">
            <input
              type="number"
              id="xp_threshold"
              name="xp_threshold"
              value={formData.xp_threshold}
              onChange={handleChange}
              min={0}
              step={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
              XP
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Students complete the class when they earn this much XP from class quests.
            Changing this will automatically update completion status for all enrolled students.
          </p>
        </div>

        {/* Actions */}
        {hasChanges && (
          <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
            <button
              type="submit"
              disabled={saving || !formData.name.trim()}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
