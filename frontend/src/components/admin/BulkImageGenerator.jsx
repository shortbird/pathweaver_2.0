import React, { useState, useEffect } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

const BulkImageGenerator = () => {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [selectedQuests, setSelectedQuests] = useState(new Set())
  const [apiUsage, setApiUsage] = useState({ used: 0, limit: 200, remaining: 200, resets_at: '' })
  const [filter, setFilter] = useState('missing') // 'missing' or 'all'
  const [processResults, setProcessResults] = useState(null)

  useEffect(() => {
    fetchQuests()
    fetchApiUsage()
  }, [filter])

  const fetchQuests = async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/v3/admin/quests', {
        params: { per_page: 100 }
      })

      let questsData = response.data.quests || []

      // Filter based on current filter
      if (filter === 'missing') {
        questsData = questsData.filter(q => !q.image_url && !q.header_image_url)
      }

      setQuests(questsData)
    } catch (error) {
      toast.error('Failed to load quests')
    } finally {
      setLoading(false)
    }
  }

  const fetchApiUsage = async () => {
    try {
      const response = await api.get('/api/v3/admin/pexels/usage')
      if (response.data.success) {
        setApiUsage({
          used: response.data.used,
          limit: response.data.limit,
          remaining: response.data.remaining,
          resets_at: response.data.resets_at
        })
      }
    } catch (error) {
      console.error('Failed to fetch API usage')
    }
  }

  const toggleQuest = (questId) => {
    const newSelected = new Set(selectedQuests)
    if (newSelected.has(questId)) {
      newSelected.delete(questId)
    } else {
      newSelected.add(questId)
    }
    setSelectedQuests(newSelected)
  }

  const selectAll = () => {
    if (selectedQuests.size === quests.length) {
      setSelectedQuests(new Set())
    } else {
      setSelectedQuests(new Set(quests.map(q => q.id)))
    }
  }

  const handleGenerate = async (regenerate = false) => {
    const count = selectedQuests.size

    if (count === 0) {
      toast.error('Please select at least one quest')
      return
    }

    if (apiUsage.remaining < count) {
      toast.error(`Not enough API calls remaining. You need ${count} but only have ${apiUsage.remaining} remaining.`)
      return
    }

    const confirmed = window.confirm(
      `This will use ${count} API calls (${apiUsage.remaining - count} will remain).\n\nContinue?`
    )

    if (!confirmed) return

    try {
      setProcessing(true)
      setProcessResults(null)

      const response = await api.post('/api/v3/admin/quests/bulk-generate-images', {
        quest_ids: Array.from(selectedQuests),
        skip_existing: !regenerate,
        max_count: count
      })

      if (response.data.success) {
        setProcessResults(response.data)
        toast.success(response.data.message)

        // Update API usage
        if (response.data.usage) {
          setApiUsage(response.data.usage)
        }

        // Refresh quests
        fetchQuests()
        setSelectedQuests(new Set())
      } else {
        toast.error(response.data.error || 'Failed to generate images')
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to generate images')
    } finally {
      setProcessing(false)
    }
  }

  const getMissingCount = () => {
    return quests.filter(q => !q.image_url && !q.header_image_url).length
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2">Bulk Quest Image Generator</h2>
        <p className="text-gray-600">Generate images for multiple quests using AI-enhanced search</p>
      </div>

      {/* API Usage Panel */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Pexels API Usage</h3>
            <p className="text-sm text-gray-600 mt-1">
              {apiUsage.used} / {apiUsage.limit} calls used • {apiUsage.remaining} remaining
            </p>
            <p className="text-xs text-gray-500 mt-1">Resets at {apiUsage.resets_at}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">{apiUsage.remaining}</div>
            <div className="text-xs text-gray-500">calls left</div>
          </div>
        </div>
        <div className="mt-3 bg-gray-200 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
            style={{ width: `${(apiUsage.used / apiUsage.limit) * 100}%` }}
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setFilter('missing')}
          className={`pb-2 px-4 ${
            filter === 'missing'
              ? 'border-b-2 border-purple-600 text-purple-600 font-medium'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Missing Images ({getMissingCount()})
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`pb-2 px-4 ${
            filter === 'all'
              ? 'border-b-2 border-purple-600 text-purple-600 font-medium'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          All Quests ({quests.length})
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={selectAll}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            {selectedQuests.size === quests.length ? 'Deselect All' : 'Select All'}
          </button>
          <span className="text-sm text-gray-600">
            {selectedQuests.size} selected
            {selectedQuests.size > 0 && ` = ${selectedQuests.size} API calls`}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleGenerate(false)}
            disabled={processing || selectedQuests.size === 0 || apiUsage.remaining < selectedQuests.size}
            className="bg-gradient-to-r bg-gradient-primary-reverse text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {processing ? 'Generating...' : 'Generate Selected'}
          </button>
          <button
            onClick={() => handleGenerate(true)}
            disabled={processing || selectedQuests.size === 0 || apiUsage.remaining < selectedQuests.size}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Regenerate Selected
          </button>
        </div>
      </div>

      {/* Results Summary */}
      {processResults && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-900 mb-2">Generation Complete</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-green-600 font-medium">Processed:</span> {processResults.processed}
            </div>
            <div>
              <span className="text-yellow-600 font-medium">Skipped:</span> {processResults.skipped}
            </div>
            <div>
              <span className="text-red-600 font-medium">Failed:</span> {processResults.failed}
            </div>
          </div>
        </div>
      )}

      {/* Quests Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      ) : quests.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600">
            {filter === 'missing' ? 'All quests have images!' : 'No quests found'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                  <input
                    type="checkbox"
                    checked={selectedQuests.size === quests.length && quests.length > 0}
                    onChange={selectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Image</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quest Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {quests.map((quest) => (
                <tr
                  key={quest.id}
                  className={`hover:bg-gray-50 ${selectedQuests.has(quest.id) ? 'bg-purple-50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedQuests.has(quest.id)}
                      onChange={() => toggleQuest(quest.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    {quest.image_url || quest.header_image_url ? (
                      <img
                        src={quest.image_url || quest.header_image_url}
                        alt={quest.title}
                        className="w-16 h-16 object-cover rounded"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs">
                        No Image
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{quest.title}</div>
                    <div className="text-sm text-gray-500 line-clamp-1">
                      {quest.big_idea || quest.description || 'No description'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {quest.image_url || quest.header_image_url ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Has Image
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Missing
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {quest.image_generated_at
                      ? new Date(quest.image_generated_at).toLocaleDateString()
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default BulkImageGenerator
