import React, { useState, useEffect } from 'react'
import api from '../../services/api'

const AIPromptVersionManager = () => {
  const [promptVersions, setPromptVersions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState(null)

  useEffect(() => {
    loadPromptVersions()
  }, [])

  const loadPromptVersions = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await api.get('/api/v3/admin/ai-analytics/prompt-performance')
      if (response.data.success) {
        setPromptVersions(response.data.prompt_versions || [])
      } else {
        throw new Error(response.data.error)
      }
    } catch (err) {
      setError(err.message || 'Failed to load prompt versions')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString()
  }

  const formatPercentage = (value) => {
    if (value === null || value === undefined) return 'N/A'
    return `${(value * 100).toFixed(1)}%`
  }

  const formatRating = (value) => {
    if (value === null || value === undefined) return 'N/A'
    return `${parseFloat(value).toFixed(2)}/5`
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">AI Prompt Version Manager</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90"
        >
          Create New Version
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">Loading prompt versions...</div>
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Gens</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Quality</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approval Rate</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Completion</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Rating</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {promptVersions.map((prompt) => (
                <tr key={prompt.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{prompt.version_name}</div>
                    {prompt.notes && (
                      <div className="text-xs text-gray-500 mt-1">{prompt.notes}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                      {prompt.prompt_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {prompt.is_active ? (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">{prompt.total_generations || 0}</td>
                  <td className="px-4 py-3 text-sm">
                    {prompt.avg_quality_score ? `${parseFloat(prompt.avg_quality_score).toFixed(2)}/10` : 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm">{formatPercentage(prompt.approval_rate)}</td>
                  <td className="px-4 py-3 text-sm">{formatPercentage(prompt.avg_completion_rate)}</td>
                  <td className="px-4 py-3 text-sm">{formatRating(prompt.avg_student_rating)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDate(prompt.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => setEditingPrompt(prompt)}
                      className="text-[#ef597b] hover:text-[#6d469b] font-medium"
                    >
                      View/Edit
                    </button>
                  </td>
                </tr>
              ))}
              {promptVersions.length === 0 && (
                <tr>
                  <td colSpan="10" className="px-4 py-8 text-center text-gray-500">
                    No prompt versions found. Create one to get started with A/B testing.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">About Prompt Versions</h3>
        <p className="text-sm text-blue-800">
          Prompt versions allow you to A/B test different AI generation approaches. Create multiple versions
          and activate one at a time to compare performance metrics like quality scores, approval rates,
          and student engagement. The system automatically tracks which version was used for each generation.
        </p>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Create New Prompt Version</h3>
            <p className="text-gray-600 mb-4">
              This feature is coming soon. Prompt versions will be manageable through the database
              or a future admin interface. For now, you can create versions directly in the
              ai_prompt_versions table.
            </p>
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {editingPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Prompt Version Details</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Version Name</label>
                <input
                  type="text"
                  value={editingPrompt.version_name}
                  disabled
                  className="w-full px-3 py-2 border rounded bg-gray-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <input
                  type="text"
                  value={editingPrompt.prompt_type}
                  disabled
                  className="w-full px-3 py-2 border rounded bg-gray-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <div className="text-sm">
                  {editingPrompt.is_active ? (
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded font-medium">Active</span>
                  ) : (
                    <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded">Inactive</span>
                  )}
                </div>
              </div>

              {editingPrompt.system_prompt && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
                  <textarea
                    value={editingPrompt.system_prompt}
                    disabled
                    rows={6}
                    className="w-full px-3 py-2 border rounded bg-gray-50 font-mono text-sm"
                  />
                </div>
              )}

              {editingPrompt.user_prompt_template && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">User Prompt Template</label>
                  <textarea
                    value={editingPrompt.user_prompt_template}
                    disabled
                    rows={8}
                    className="w-full px-3 py-2 border rounded bg-gray-50 font-mono text-sm"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Generations</label>
                  <div className="text-lg font-semibold">{editingPrompt.total_generations || 0}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Avg Quality Score</label>
                  <div className="text-lg font-semibold">
                    {editingPrompt.avg_quality_score ? `${parseFloat(editingPrompt.avg_quality_score).toFixed(2)}/10` : 'N/A'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Approval Rate</label>
                  <div className="text-lg font-semibold">{formatPercentage(editingPrompt.approval_rate)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Avg Student Rating</label>
                  <div className="text-lg font-semibold">{formatRating(editingPrompt.avg_student_rating)}</div>
                </div>
              </div>

              {editingPrompt.notes && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">{editingPrompt.notes}</p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditingPrompt(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AIPromptVersionManager
