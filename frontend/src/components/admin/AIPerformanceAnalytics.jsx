import React, { useState, useEffect } from 'react'
import api from '../../services/api'

const AIPerformanceAnalytics = () => {
  const [activeTab, setActiveTab] = useState('quest-performance')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Quest Performance state
  const [questPerformanceData, setQuestPerformanceData] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [filters, setFilters] = useState({
    quality_score_min: '',
    generation_source: '',
    sort_by: 'created_at',
    sort_direction: 'desc'
  })

  // AI vs Human state
  const [comparisonData, setComparisonData] = useState(null)
  const [daysBack, setDaysBack] = useState(30)

  // Prompt Performance state
  const [promptPerformanceData, setPromptPerformanceData] = useState([])

  // Quality Trends state
  const [qualityTrends, setQualityTrends] = useState([])
  const [trendGranularity, setTrendGranularity] = useState('daily')
  const [trendDaysBack, setTrendDaysBack] = useState(30)

  useEffect(() => {
    loadData()
  }, [activeTab, filters, daysBack, trendGranularity, trendDaysBack])

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      if (activeTab === 'quest-performance') {
        await loadQuestPerformance()
      } else if (activeTab === 'ai-vs-human') {
        await loadAIvsHumanComparison()
      } else if (activeTab === 'prompt-performance') {
        await loadPromptPerformance()
      } else if (activeTab === 'quality-trends') {
        await loadQualityTrends()
      }
    } catch (err) {
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const loadQuestPerformance = async () => {
    const params = new URLSearchParams({
      limit: '50',
      offset: '0',
      ...filters
    })

    const response = await api.get(`/api/admin/ai-analytics/quest-performance?${params}`)
    if (response.data.success) {
      setQuestPerformanceData(response.data.data)
      setTotalCount(response.data.total_count)
    } else {
      throw new Error(response.data.error)
    }
  }

  const loadAIvsHumanComparison = async () => {
    const response = await api.get(`/api/admin/ai-analytics/ai-vs-human?days_back=${daysBack}`)
    if (response.data.success) {
      setComparisonData(response.data)
    } else {
      throw new Error(response.data.error)
    }
  }

  const loadPromptPerformance = async () => {
    const response = await api.get('/api/admin/ai-analytics/prompt-performance')
    if (response.data.success) {
      setPromptPerformanceData(response.data.performance_data)
    } else {
      throw new Error(response.data.error)
    }
  }

  const loadQualityTrends = async () => {
    const params = new URLSearchParams({
      days_back: trendDaysBack.toString(),
      granularity: trendGranularity
    })

    const response = await api.get(`/api/admin/ai-analytics/quality-trends?${params}`)
    if (response.data.success) {
      setQualityTrends(response.data.trends)
    } else {
      throw new Error(response.data.error)
    }
  }

  const handleRefreshMetrics = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await api.post('/api/admin/ai-analytics/refresh-metrics', {})
      if (response.data.success) {
        alert(`Successfully updated ${response.data.updated_count} quest metrics`)
        loadData()
      } else {
        throw new Error(response.data.error)
      }
    } catch (err) {
      setError(err.message || 'Failed to refresh metrics')
    } finally {
      setLoading(false)
    }
  }

  const formatPercentage = (value) => {
    if (value === null || value === undefined) return 'N/A'
    return `${(value * 100).toFixed(1)}%`
  }

  const formatRating = (value) => {
    if (value === null || value === undefined) return 'N/A'
    return `${parseFloat(value).toFixed(2)}/5`
  }

  const getQualityBadge = (score) => {
    if (!score) return <span className="text-gray-400">No score</span>
    if (score >= 8) return <span className="text-green-600 font-semibold">{score}/10</span>
    if (score >= 6) return <span className="text-yellow-600 font-semibold">{score}/10</span>
    return <span className="text-red-600 font-semibold">{score}/10</span>
  }

  const getDiffColor = (diff) => {
    if (diff > 0) return 'text-green-600'
    if (diff < 0) return 'text-red-600'
    return 'text-gray-600'
  }

  const getDiffSymbol = (diff) => {
    if (diff > 0) return '+'
    return ''
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">AI Performance Analytics</h2>
        <button
          onClick={handleRefreshMetrics}
          disabled={loading}
          className="px-4 py-2 bg-gradient-primary-reverse text-white rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh Metrics'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('quest-performance')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'quest-performance'
              ? 'border-b-2 border-optio-pink text-optio-pink'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Quest Performance
        </button>
        <button
          onClick={() => setActiveTab('ai-vs-human')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'ai-vs-human'
              ? 'border-b-2 border-optio-pink text-optio-pink'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          AI vs Human
        </button>
        <button
          onClick={() => setActiveTab('prompt-performance')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'prompt-performance'
              ? 'border-b-2 border-optio-pink text-optio-pink'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Prompt Performance
        </button>
        <button
          onClick={() => setActiveTab('quality-trends')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'quality-trends'
              ? 'border-b-2 border-optio-pink text-optio-pink'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Quality Trends
        </button>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {loading && <div className="text-center py-8">Loading...</div>}

        {/* Quest Performance Tab */}
        {activeTab === 'quest-performance' && !loading && (
          <div className="space-y-4">
            <div className="flex gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Quality Score
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={filters.quality_score_min}
                  onChange={(e) => setFilters({ ...filters, quality_score_min: e.target.value })}
                  className="px-3 py-2 border rounded"
                  placeholder="All"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source
                </label>
                <select
                  value={filters.generation_source}
                  onChange={(e) => setFilters({ ...filters, generation_source: e.target.value })}
                  className="px-3 py-2 border rounded"
                >
                  <option value="">All Sources</option>
                  <option value="manual">Manual</option>
                  <option value="batch">Batch</option>
                  <option value="student_idea">Student Idea</option>
                  <option value="badge_aligned">Badge Aligned</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sort By
                </label>
                <select
                  value={filters.sort_by}
                  onChange={(e) => setFilters({ ...filters, sort_by: e.target.value })}
                  className="px-3 py-2 border rounded"
                >
                  <option value="created_at">Created Date</option>
                  <option value="completion_rate">Completion Rate</option>
                  <option value="average_rating">Average Rating</option>
                  <option value="engagement_score">Engagement Score</option>
                  <option value="quality_score">Quality Score</option>
                </select>
              </div>
            </div>

            <div className="bg-white rounded-lg border overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quest</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quality</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completion Rate</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Rating</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Engagement</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {questPerformanceData.map((quest) => (
                    <tr key={quest.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{quest.quests?.title || 'Unknown Quest'}</div>
                        <div className="text-sm text-gray-500">{quest.model_name}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                          {quest.generation_source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">{getQualityBadge(quest.quality_score)}</td>
                      <td className="px-4 py-3 text-sm">{formatPercentage(quest.completion_rate)}</td>
                      <td className="px-4 py-3 text-sm">{formatRating(quest.average_rating)}</td>
                      <td className="px-4 py-3 text-sm">{formatPercentage(quest.engagement_score)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(quest.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {questPerformanceData.length === 0 && (
                    <tr>
                      <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                        No quest performance data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="text-sm text-gray-600">
              Showing {questPerformanceData.length} of {totalCount} quests
            </div>
          </div>
        )}

        {/* AI vs Human Tab */}
        {activeTab === 'ai-vs-human' && !loading && comparisonData && (
          <div className="space-y-6">
            <div className="flex gap-4 items-center">
              <label className="text-sm font-medium text-gray-700">
                Time Period:
              </label>
              <select
                value={daysBack}
                onChange={(e) => setDaysBack(parseInt(e.target.value))}
                className="px-3 py-2 border rounded"
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="180">Last 6 months</option>
                <option value="365">Last year</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* AI Metrics */}
              <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-semibold mb-4 text-optio-pink">AI-Generated Quests</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Quests:</span>
                    <span className="font-semibold">{comparisonData.ai_metrics.total_quests}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Completion Rate:</span>
                    <span className="font-semibold">{formatPercentage(comparisonData.ai_metrics.avg_completion_rate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Rating:</span>
                    <span className="font-semibold">{formatRating(comparisonData.ai_metrics.avg_rating)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Engagement:</span>
                    <span className="font-semibold">{formatPercentage(comparisonData.ai_metrics.avg_engagement_score)}</span>
                  </div>
                </div>
              </div>

              {/* Human Metrics */}
              <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-semibold mb-4 text-optio-purple">Human-Created Quests</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Quests:</span>
                    <span className="font-semibold">{comparisonData.human_metrics.total_quests}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Completion Rate:</span>
                    <span className="font-semibold">{formatPercentage(comparisonData.human_metrics.avg_completion_rate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Rating:</span>
                    <span className="font-semibold">{formatRating(comparisonData.human_metrics.avg_rating)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Engagement:</span>
                    <span className="font-semibold">{formatPercentage(comparisonData.human_metrics.avg_engagement_score)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Comparison Summary */}
            <div className="bg-gray-50 rounded-lg border p-6">
              <h3 className="text-lg font-semibold mb-4">Performance Difference (AI - Human)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-sm text-gray-600 mb-1">Completion Rate</div>
                  <div className={`text-2xl font-bold ${getDiffColor(comparisonData.comparison.completion_rate_diff)}`}>
                    {getDiffSymbol(comparisonData.comparison.completion_rate_diff)}
                    {formatPercentage(Math.abs(comparisonData.comparison.completion_rate_diff))}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600 mb-1">Average Rating</div>
                  <div className={`text-2xl font-bold ${getDiffColor(comparisonData.comparison.rating_diff)}`}>
                    {getDiffSymbol(comparisonData.comparison.rating_diff)}
                    {Math.abs(comparisonData.comparison.rating_diff).toFixed(2)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600 mb-1">Engagement</div>
                  <div className={`text-2xl font-bold ${getDiffColor(comparisonData.comparison.engagement_diff)}`}>
                    {getDiffSymbol(comparisonData.comparison.engagement_diff)}
                    {formatPercentage(Math.abs(comparisonData.comparison.engagement_diff))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Prompt Performance Tab */}
        {activeTab === 'prompt-performance' && !loading && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Gens</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approval Rate</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Quality</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completion Rate</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Rating</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gen Time (ms)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {promptPerformanceData.map((prompt, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{prompt.prompt_version}</td>
                      <td className="px-4 py-3 text-sm">{prompt.total_generations}</td>
                      <td className="px-4 py-3 text-sm">{formatPercentage(prompt.approval_rate)}</td>
                      <td className="px-4 py-3 text-sm">{getQualityBadge(prompt.avg_quality_score)}</td>
                      <td className="px-4 py-3 text-sm">{formatPercentage(prompt.avg_completion_rate)}</td>
                      <td className="px-4 py-3 text-sm">{formatRating(prompt.avg_rating)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {prompt.avg_generation_time_ms ? Math.round(prompt.avg_generation_time_ms) : 'N/A'}
                      </td>
                    </tr>
                  ))}
                  {promptPerformanceData.length === 0 && (
                    <tr>
                      <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                        No prompt performance data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Quality Trends Tab */}
        {activeTab === 'quality-trends' && !loading && (
          <div className="space-y-4">
            <div className="flex gap-4 items-center">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time Period
                </label>
                <select
                  value={trendDaysBack}
                  onChange={(e) => setTrendDaysBack(parseInt(e.target.value))}
                  className="px-3 py-2 border rounded"
                >
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="180">Last 6 months</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Granularity
                </label>
                <select
                  value={trendGranularity}
                  onChange={(e) => setTrendGranularity(e.target.value)}
                  className="px-3 py-2 border rounded"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>

            <div className="bg-white rounded-lg border overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Gens</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approved</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approval Rate</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Quality</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Gen Time (ms)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {qualityTrends.map((trend, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{trend.period}</td>
                      <td className="px-4 py-3 text-sm">{trend.total_generations}</td>
                      <td className="px-4 py-3 text-sm">{trend.approved_count}</td>
                      <td className="px-4 py-3 text-sm">{formatPercentage(trend.approval_rate)}</td>
                      <td className="px-4 py-3 text-sm">{getQualityBadge(trend.avg_quality_score)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {trend.avg_generation_time_ms ? Math.round(trend.avg_generation_time_ms) : 'N/A'}
                      </td>
                    </tr>
                  ))}
                  {qualityTrends.length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                        No trend data available for this time period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AIPerformanceAnalytics
