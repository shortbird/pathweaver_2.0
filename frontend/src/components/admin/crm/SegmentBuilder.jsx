import React, { useState, useEffect } from 'react'
import { crmAPI } from '../../../services/crmAPI'
import toast from 'react-hot-toast'

const SegmentBuilder = () => {
  const [segments, setSegments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingSegment, setEditingSegment] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    filter_rules: {}
  })
  const [previewCount, setPreviewCount] = useState(0)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    fetchSegments()
  }, [])

  useEffect(() => {
    if (Object.keys(formData.filter_rules).length > 0) {
      const timer = setTimeout(() => {
        previewSegment()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [formData.filter_rules])

  const fetchSegments = async () => {
    try {
      setLoading(true)
      const response = await crmAPI.getSegments()
      setSegments(response.data.segments || [])
    } catch (error) {
      toast.error('Failed to load segments')
      console.error(error)
      setSegments([])
    } finally {
      setLoading(false)
    }
  }

  const previewSegment = async () => {
    try {
      setPreviewLoading(true)
      const response = await crmAPI.previewSegment(formData.filter_rules)
      setPreviewCount(response.data.count)
    } catch (error) {
      console.error('Failed to preview segment:', error)
      setPreviewCount(0)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleSaveSegment = async () => {
    if (!formData.name) {
      toast.error('Please enter a segment name')
      return
    }

    try {
      if (editingSegment) {
        await crmAPI.updateSegment(editingSegment.id, formData)
        toast.success('Segment updated!')
      } else {
        await crmAPI.createSegment(formData)
        toast.success('Segment saved!')
      }
      setShowBuilder(false)
      setEditingSegment(null)
      setFormData({ name: '', description: '', filter_rules: {} })
      fetchSegments()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save segment')
    }
  }

  const handleDeleteSegment = async (segment) => {
    const confirmed = window.confirm(`Delete segment "${segment.name}"? This cannot be undone.`)
    if (!confirmed) return

    try {
      await crmAPI.deleteSegment(segment.id)
      toast.success('Segment deleted')
      fetchSegments()
    } catch (error) {
      toast.error('Failed to delete segment')
    }
  }

  const handleEditSegment = (segment) => {
    setEditingSegment(segment)
    setFormData({
      name: segment.name,
      description: segment.description || '',
      filter_rules: segment.filter_rules || {}
    })
    setShowBuilder(true)
  }

  const updateFilterRule = (key, value) => {
    setFormData(prev => ({
      ...prev,
      filter_rules: { ...prev.filter_rules, [key]: value }
    }))
  }

  const removeFilterRule = (key) => {
    setFormData(prev => {
      const newRules = { ...prev.filter_rules }
      delete newRules[key]
      return { ...prev, filter_rules: newRules }
    })
  }

  if (showBuilder) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <h2 className="text-2xl font-bold">
            {editingSegment ? 'Edit Segment' : 'Create Segment'}
          </h2>
          <button
            onClick={() => {
              setShowBuilder(false)
              setEditingSegment(null)
              setFormData({ name: '', description: '', filter_rules: {} })
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Segment Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Active Students"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Description (Optional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe this segment..."
              rows={2}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Filters</label>

            <div className="mb-4">
              <select
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
                onChange={(e) => {
                  const field = e.target.value
                  if (field) {
                    updateFilterRule(field, '')
                    e.target.value = ''
                  }
                }}
                value=""
              >
                <option value="">Add filter...</option>
                <option value="role">User Role</option>
                <option value="last_active_days">Days Since Last Active</option>
                <option value="min_quest_completions">Min Quests Completed</option>
                <option value="max_quest_completions">Max Quests Completed</option>
                <option value="min_xp">Min XP</option>
                <option value="max_xp">Max XP</option>
                <option value="registered_after">Registered After (YYYY-MM-DD)</option>
                <option value="registered_before">Registered Before (YYYY-MM-DD)</option>
                <option value="email_verified">Email Verified (true/false)</option>
              </select>
            </div>

            <div className="space-y-3">
              {Object.entries(formData.filter_rules).map(([key, value]) => (
                <div key={key} className="flex gap-2 items-center p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-gray-700 block mb-1">
                      {key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </span>
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => updateFilterRule(key, e.target.value)}
                      className="w-full px-3 py-1 border rounded"
                      placeholder="Enter value..."
                    />
                  </div>
                  <button
                    onClick={() => removeFilterRule(key)}
                    className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {Object.keys(formData.filter_rules).length === 0 && (
              <p className="text-sm text-gray-500 italic mt-2">No filters added yet. Select from the dropdown above.</p>
            )}
          </div>

          {/* Live preview */}
          {Object.keys(formData.filter_rules).length > 0 && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-blue-900">Live Preview</p>
                  <p className="text-xs text-blue-700">Matching users in database</p>
                </div>
                <div className="text-right">
                  {previewLoading ? (
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  ) : (
                    <p className="text-2xl font-bold text-blue-900">{previewCount}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={() => {
                setShowBuilder(false)
                setEditingSegment(null)
                setFormData({ name: '', description: '', filter_rules: {} })
              }}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveSegment}
              className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90"
            >
              Save Segment
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Saved Segments</h2>
          <p className="text-sm text-gray-600 mt-1">Create reusable audience segments for campaigns</p>
        </div>
        <button
          onClick={() => setShowBuilder(true)}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:opacity-90"
        >
          Create Segment
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        </div>
      ) : segments.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No segments created yet. Create your first segment to get started!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {segments.map(segment => (
            <div key={segment.id} className="bg-white border rounded-lg p-4 hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-lg">{segment.name}</h3>
                  {segment.description && (
                    <p className="text-sm text-gray-600 mt-1">{segment.description}</p>
                  )}
                </div>
              </div>

              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">Filters:</p>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(segment.filter_rules || {}).map(key => (
                    <span key={key} className="px-2 py-1 bg-gray-100 text-xs rounded">
                      {key}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t">
                <button
                  onClick={() => handleEditSegment(segment)}
                  className="text-sm text-optio-purple hover:text-optio-purple-dark font-semibold"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteSegment(segment)}
                  className="text-sm text-red-600 hover:text-red-900 font-semibold"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SegmentBuilder
