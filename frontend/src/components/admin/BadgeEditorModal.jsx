import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'

const BadgeEditorModal = ({ badge, isOpen, onClose, onSave, isProcessing }) => {
  const [formData, setFormData] = useState({
    name: '',
    identity_statement: '',
    description: '',
    pillar_primary: 'STEM & Logic',
    pillar_weights: {},
    min_quests: 5,
    min_xp: 1500
  })

  useEffect(() => {
    if (badge) {
      setFormData({
        name: badge.name || '',
        identity_statement: badge.identity_statement || '',
        description: badge.description || '',
        pillar_primary: badge.pillar_primary || 'STEM & Logic',
        pillar_weights: badge.pillar_weights || {},
        min_quests: badge.min_quests || 5,
        min_xp: badge.min_xp || 1500
      })
    }
  }, [badge])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({...badge, ...formData})
  }

  if (!isOpen) return null

  const pillars = [
    'STEM & Logic',
    'Life & Wellness',
    'Language & Communication',
    'Society & Culture',
    'Arts & Creativity'
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <h2 className="text-xl font-bold">Edit Badge</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Badge Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Creative Storyteller"
            />
          </div>

          {/* Identity Statement */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Identity Statement *
            </label>
            <input
              type="text"
              required
              value={formData.identity_statement}
              onChange={(e) => setFormData({...formData, identity_statement: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="I am a storyteller who brings ideas to life through words"
            />
            <p className="text-xs text-gray-500 mt-1">Start with "I am...", "I can...", or "I have..."</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description *
            </label>
            <textarea
              required
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Explore the art of narrative by creating stories across different genres and mediums..."
            />
          </div>

          {/* Primary Pillar */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Primary Pillar *
            </label>
            <select
              required
              value={formData.pillar_primary}
              onChange={(e) => setFormData({...formData, pillar_primary: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              {pillars.map(pillar => (
                <option key={pillar} value={pillar}>{pillar}</option>
              ))}
            </select>
          </div>

          {/* Requirements */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Quests *
              </label>
              <input
                type="number"
                required
                min="1"
                max="20"
                value={formData.min_quests}
                onChange={(e) => setFormData({...formData, min_quests: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum XP *
              </label>
              <input
                type="number"
                required
                min="500"
                max="10000"
                step="50"
                value={formData.min_xp}
                onChange={(e) => setFormData({...formData, min_xp: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="flex-1 px-4 py-2 bg-gradient-primary-reverse text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity font-medium"
            >
              {isProcessing ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default BadgeEditorModal
