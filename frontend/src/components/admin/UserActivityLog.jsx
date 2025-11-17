import React, { useState, useEffect } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

// Icon components
const ClockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const ListIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
)

const CalendarIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const FilterIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
)

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const ChevronRightIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

/**
 * User Activity Log Component
 *
 * Displays individual user activity logs for admin review.
 * Features:
 * - Table view (default) and Timeline view toggle
 * - Date range filtering
 * - Event type filtering
 * - Real-time event descriptions
 * - Time on page tracking
 * - Navigation flow visualization
 */

const UserActivityLog = ({ userId, userName }) => {
  const [viewMode, setViewMode] = useState('table') // 'table' or 'timeline'
  const [events, setEvents] = useState([])
  const [userInfo, setUserInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    eventType: '',
    limit: 100
  })
  const [showFilters, setShowFilters] = useState(false)
  const [availableEventTypes, setAvailableEventTypes] = useState([])

  useEffect(() => {
    if (userId) {
      fetchActivityLogs()
    }
  }, [userId, filters])

  const fetchActivityLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.startDate) params.append('start_date', filters.startDate)
      if (filters.endDate) params.append('end_date', filters.endDate)
      if (filters.eventType) params.append('event_type', filters.eventType)
      params.append('limit', filters.limit)

      const response = await api.get(`/api/admin/analytics/user/${userId}/activity?${params}`)

      if (response.data.success) {
        setEvents(response.data.data.events)
        setUserInfo(response.data.data.user)

        // Extract unique event types for filter dropdown
        const types = [...new Set(response.data.data.events.map(e => e.event_type))]
        setAvailableEventTypes(types.sort())
      }
    } catch (error) {
      console.error('Error fetching activity logs:', error)
      toast.error('Failed to load activity logs')
    } finally {
      setLoading(false)
    }
  }

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const formatDuration = (ms) => {
    if (!ms) return 'N/A'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const getEventCategoryColor = (category) => {
    const colors = {
      auth: 'bg-blue-100 text-blue-800',
      quest: 'bg-green-100 text-green-800',
      badge: 'bg-yellow-100 text-yellow-800',
      tutor: 'bg-purple-100 text-purple-800',
      community: 'bg-pink-100 text-pink-800',
      parent: 'bg-indigo-100 text-indigo-800',
      navigation: 'bg-gray-100 text-gray-800',
      other: 'bg-gray-100 text-gray-800'
    }
    return colors[category] || colors.other
  }

  const resetFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      eventType: '',
      limit: 100
    })
  }

  const TableView = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Timestamp
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Activity
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Category
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Page
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Time on Page
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              From
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {events.map((event) => (
            <tr key={event.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatTimestamp(event.timestamp)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {event.description}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getEventCategoryColor(event.event_category)}`}>
                  {event.event_category}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                {event.page_url || 'N/A'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDuration(event.duration_ms)}
              </td>
              <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                {event.referrer_url || 'Direct'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const TimelineView = () => (
    <div className="space-y-4">
      {events.map((event, index) => (
        <div key={event.id} className="flex gap-4">
          {/* Timeline connector */}
          <div className="flex flex-col items-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getEventCategoryColor(event.event_category)}`}>
              <ClockIcon />
            </div>
            {index < events.length - 1 && (
              <div className="w-0.5 h-full bg-gray-200 flex-grow my-1"></div>
            )}
          </div>

          {/* Event details */}
          <div className="flex-1 bg-white rounded-lg shadow-sm p-4 mb-2">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-900">
                    {event.description}
                  </span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${getEventCategoryColor(event.event_category)}`}>
                    {event.event_category}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {formatTimestamp(event.timestamp)}
                </p>

                {/* Page navigation flow */}
                {event.referrer_url && event.page_url && (
                  <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                    <span className="truncate max-w-xs">{event.referrer_url}</span>
                    <ChevronRightIcon />
                    <span className="truncate max-w-xs font-medium">{event.page_url}</span>
                  </div>
                )}

                {/* Time on page */}
                {event.duration_ms && (
                  <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                    <ClockIcon />
                    Time on page: {formatDuration(event.duration_ms)}
                  </div>
                )}

                {/* Additional event data */}
                {event.event_data && Object.keys(event.event_data).length > 0 && (
                  <div className="mt-2">
                    <details className="text-xs text-gray-600">
                      <summary className="cursor-pointer font-medium">Event Data</summary>
                      <pre className="mt-1 p-2 bg-gray-50 rounded overflow-auto">
                        {JSON.stringify(event.event_data, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Activity Log</h2>
            {userInfo && (
              <p className="text-sm text-gray-600 mt-1">
                {userInfo.name} ({userInfo.email}) - {userInfo.role}
              </p>
            )}
          </div>

          {/* View mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('table')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                viewMode === 'table'
                  ? 'bg-optio-purple text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <ListIcon /> Table
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                viewMode === 'timeline'
                  ? 'bg-optio-purple text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <CalendarIcon /> Timeline
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="border-t pt-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-optio-purple"
          >
            <FilterIcon /> {showFilters ? 'Hide' : 'Show'} Filters
          </button>

          {showFilters && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-optio-purple focus:ring-optio-purple"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-optio-purple focus:ring-optio-purple"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Event Type
                </label>
                <select
                  value={filters.eventType}
                  onChange={(e) => setFilters({ ...filters, eventType: e.target.value })}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-optio-purple focus:ring-optio-purple"
                >
                  <option value="">All Events</option>
                  {availableEventTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Limit
                </label>
                <select
                  value={filters.limit}
                  onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value) })}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-optio-purple focus:ring-optio-purple"
                >
                  <option value="50">50 events</option>
                  <option value="100">100 events</option>
                  <option value="250">250 events</option>
                  <option value="500">500 events</option>
                </select>
              </div>

              <div className="md:col-span-4 flex gap-2">
                <button
                  onClick={resetFilters}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                >
                  <XIcon /> Reset Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Event count */}
        <div className="mt-4 text-sm text-gray-600">
          Showing {events.length} event{events.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        {events.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No activity found for the selected filters.
          </div>
        ) : viewMode === 'table' ? (
          <TableView />
        ) : (
          <TimelineView />
        )}
      </div>
    </div>
  )
}

export default UserActivityLog
