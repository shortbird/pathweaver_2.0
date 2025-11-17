import React, { useState, useEffect } from 'react'
import api from '../../services/api'

const SparkLogsPanel = () => {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)

  // Filters
  const [startDate, setStartDate] = useState(() => {
    // Default: 7 days ago
    const date = new Date()
    date.setDate(date.getDate() - 7)
    return date.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => {
    // Default: today
    return new Date().toISOString().split('T')[0]
  })
  const [eventType, setEventType] = useState('')
  const [status, setStatus] = useState('')
  const [limit, setLimit] = useState(100)

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false)

  useEffect(() => {
    fetchLogs()
  }, [startDate, endDate, eventType, status, limit])

  useEffect(() => {
    let interval
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchLogs()
      }, 30000) // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [autoRefresh, startDate, endDate, eventType, status, limit])

  const fetchLogs = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (startDate) params.append('start_date', `${startDate}T00:00:00Z`)
      if (endDate) params.append('end_date', `${endDate}T23:59:59Z`)
      if (eventType) params.append('event_type', eventType)
      if (status) params.append('status', status)
      params.append('limit', limit)

      const response = await api.get(`/api/admin/analytics/spark-logs?${params.toString()}`)

      if (response.data.success) {
        setLogs(response.data.data.events)
        setSummary(response.data.data.summary)
      } else {
        setError('Failed to fetch Spark logs')
      }
    } catch (err) {
      console.error('Error fetching Spark logs:', err)
      setError(err.response?.data?.error || 'Failed to fetch Spark logs')
    } finally {
      setLoading(false)
    }
  }

  const getEventColor = (eventType) => {
    if (eventType.includes('sso')) return 'bg-green-100 text-green-800 border-green-300'
    if (eventType.includes('token')) return 'bg-blue-100 text-blue-800 border-blue-300'
    if (eventType.includes('webhook')) return 'bg-purple-100 text-purple-800 border-purple-300'
    return 'bg-gray-100 text-gray-800 border-gray-300'
  }

  const getStatusColor = (status) => {
    return status === 'success'
      ? 'bg-green-500 text-white'
      : 'bg-red-500 text-white'
  }

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Spark Integration Logs</h1>
          <p className="text-gray-600 mt-1">Monitor all Spark platform communications</p>
        </div>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`px-4 py-2 rounded-lg font-medium ${
            autoRefresh
              ? 'bg-green-500 text-white hover:bg-green-600'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          {autoRefresh ? '✓ Auto-refresh ON' : 'Auto-refresh OFF'}
        </button>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Total Events</div>
            <div className="text-2xl font-bold">{logs.length}</div>
          </div>
          <div className="bg-green-50 rounded-lg shadow p-4">
            <div className="text-sm text-green-700">Successful</div>
            <div className="text-2xl font-bold text-green-700">{summary.success_count}</div>
          </div>
          <div className="bg-red-50 rounded-lg shadow p-4">
            <div className="text-sm text-red-700">Failed</div>
            <div className="text-2xl font-bold text-red-700">{summary.failed_count}</div>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-4">
            <div className="text-sm text-blue-700">Success Rate</div>
            <div className="text-2xl font-bold text-blue-700">{summary.success_rate}%</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="text-lg font-semibold mb-4">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Event Type
            </label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="">All Events</option>
              <option value="spark_sso_success">SSO Success</option>
              <option value="spark_sso_failed">SSO Failed</option>
              <option value="spark_token_exchange_success">Token Exchange Success</option>
              <option value="spark_token_exchange_failed">Token Exchange Failed</option>
              <option value="spark_webhook_success">Webhook Success</option>
              <option value="spark_webhook_failed">Webhook Failed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="">All</option>
              <option value="success">Success Only</option>
              <option value="failed">Failed Only</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Limit
            </label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="50">50 events</option>
              <option value="100">100 events</option>
              <option value="250">250 events</option>
              <option value="500">500 events</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Spark logs...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 font-medium">Error: {error}</p>
        </div>
      )}

      {/* Logs Timeline */}
      {!loading && !error && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Event Timeline</h2>
          </div>

          {logs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No logs found for the selected filters.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {logs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Header Row */}
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(log.status)}`}>
                          {log.status.toUpperCase()}
                        </span>
                        <span className={`px-3 py-1 rounded border text-xs font-medium ${getEventColor(log.event_type)}`}>
                          {log.event_type}
                        </span>
                        <span className="text-sm text-gray-500">{formatTimestamp(log.timestamp)}</span>
                        {log.duration_ms && (
                          <span className="text-sm text-gray-400">({log.duration_ms}ms)</span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-gray-900 mb-2">{log.description}</p>

                      {/* User Info */}
                      {log.user_name && log.user_name !== 'Anonymous' && (
                        <div className="text-sm text-gray-600">
                          User: <span className="font-medium">{log.user_name}</span>
                        </div>
                      )}

                      {/* Event Data (Collapsible) */}
                      {Object.keys(log.event_data).length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm text-purple-600 hover:text-purple-700 font-medium">
                            View Event Data
                          </summary>
                          <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-x-auto">
                            {JSON.stringify(log.event_data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
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

export default SparkLogsPanel
