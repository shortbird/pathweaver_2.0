import React, { useState, useEffect } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

/**
 * Observer Audit Log Component - COPPA/FERPA Compliance
 *
 * Admin interface for viewing observer access audit logs.
 * Features:
 * - Paginated audit log viewing
 * - Filtering by observer, student, action type, date range
 * - Platform-wide statistics
 * - Export capabilities (future)
 */

const ObserverAuditLog = () => {
  const [logs, setLogs] = useState([])
  const [statistics, setStatistics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0
  })
  const [filters, setFilters] = useState({
    observer_id: '',
    student_id: '',
    action_type: '',
    start_date: '',
    end_date: ''
  })
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState(window.innerWidth < 768 ? 'cards' : 'table')

  // Auto-switch viewMode on resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768 && viewMode === 'table') {
        setViewMode('cards')
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [viewMode])

  useEffect(() => {
    fetchAuditLogs()
  }, [pagination.page, pagination.limit])

  useEffect(() => {
    fetchStatistics()
  }, [filters.start_date, filters.end_date])

  const fetchAuditLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit
      })

      // Add filters if set
      if (filters.observer_id) params.append('observer_id', filters.observer_id)
      if (filters.student_id) params.append('student_id', filters.student_id)
      if (filters.action_type) params.append('action_type', filters.action_type)
      if (filters.start_date) params.append('start_date', filters.start_date)
      if (filters.end_date) params.append('end_date', filters.end_date)

      const response = await api.get(`/api/admin/observer-audit/logs?${params}`)

      setLogs(response.data.logs)
      setPagination(prev => ({
        ...prev,
        total: response.data.pagination.total,
        pages: response.data.pagination.pages
      }))
    } catch (error) {
      console.error('Error fetching audit logs:', error)
      toast.error('Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }

  const fetchStatistics = async () => {
    setStatsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.start_date) params.append('start_date', filters.start_date)
      if (filters.end_date) params.append('end_date', filters.end_date)

      const response = await api.get(`/api/admin/observer-audit/statistics?${params}`)
      setStatistics(response.data)
    } catch (error) {
      console.error('Error fetching statistics:', error)
    } finally {
      setStatsLoading(false)
    }
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const applyFilters = () => {
    setPagination(prev => ({ ...prev, page: 1 }))
    fetchAuditLogs()
    fetchStatistics()
  }

  const clearFilters = () => {
    setFilters({
      observer_id: '',
      student_id: '',
      action_type: '',
      start_date: '',
      end_date: ''
    })
    setPagination(prev => ({ ...prev, page: 1 }))
    setTimeout(() => {
      fetchAuditLogs()
      fetchStatistics()
    }, 0)
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  }

  const getActionTypeBadge = (actionType) => {
    const types = {
      'view_portfolio': 'bg-blue-100 text-blue-800',
      'view_quest': 'bg-green-100 text-green-800',
      'view_task': 'bg-yellow-100 text-yellow-800',
      'view_comments': 'bg-purple-100 text-purple-800',
      'post_comment': 'bg-pink-100 text-pink-800'
    }
    return types[actionType] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Observer Access Audit Log</h2>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setViewMode('table')}
                className={`min-h-[44px] min-w-[44px] p-2 flex items-center justify-center transition-colors ${
                  viewMode === 'table'
                    ? 'bg-optio-purple text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="Table view"
                aria-label="Table view"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`min-h-[44px] min-w-[44px] p-2 flex items-center justify-center transition-colors ${
                  viewMode === 'cards'
                    ? 'bg-optio-purple text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="Card view"
                aria-label="Card view"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
            </div>
            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="min-h-[44px] px-4 py-2 bg-optio-purple text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="hidden sm:inline">{showFilters ? 'Hide Filters' : 'Show Filters'}</span>
            </button>
          </div>
        </div>

        {/* Statistics Overview */}
        {statistics && !statsLoading && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-blue-600 font-medium">Total Accesses</div>
              <div className="text-2xl font-bold text-blue-900">{statistics.total_accesses}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-green-600 font-medium">Unique Observers</div>
              <div className="text-2xl font-bold text-green-900">{statistics.unique_observers}</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-sm text-purple-600 font-medium">Unique Students</div>
              <div className="text-2xl font-bold text-purple-900">{statistics.unique_students}</div>
            </div>
            <div className="bg-pink-50 rounded-lg p-4">
              <div className="text-sm text-pink-600 font-medium">Most Common Action</div>
              <div className="text-lg font-bold text-pink-900">
                {statistics.action_breakdown && Object.keys(statistics.action_breakdown).length > 0
                  ? Object.entries(statistics.action_breakdown).reduce((a, b) => a[1] > b[1] ? a : b)[0].replace(/_/g, ' ')
                  : 'N/A'}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        {showFilters && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observer ID</label>
                <input
                  type="text"
                  value={filters.observer_id}
                  onChange={(e) => handleFilterChange('observer_id', e.target.value)}
                  placeholder="UUID of observer"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Student ID</label>
                <input
                  type="text"
                  value={filters.student_id}
                  onChange={(e) => handleFilterChange('student_id', e.target.value)}
                  placeholder="UUID of student"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action Type</label>
                <select
                  value={filters.action_type}
                  onChange={(e) => handleFilterChange('action_type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] text-base"
                >
                  <option value="">All Actions</option>
                  <option value="view_portfolio">View Portfolio</option>
                  <option value="view_quest">View Quest</option>
                  <option value="view_task">View Task</option>
                  <option value="view_comments">View Comments</option>
                  <option value="post_comment">Post Comment</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={filters.start_date}
                  onChange={(e) => handleFilterChange('start_date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={filters.end_date}
                  onChange={(e) => handleFilterChange('end_date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] text-base"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={applyFilters}
                className="min-h-[44px] w-full sm:w-auto px-4 py-2 bg-optio-purple text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Apply Filters
              </button>
              <button
                onClick={clearFilters}
                className="min-h-[44px] w-full sm:w-auto px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Audit Logs */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Mobile Card View */}
        {viewMode === 'cards' && (
          <div className="divide-y divide-gray-100">
            {loading ? (
              <div className="px-4 py-12 text-center text-gray-500">
                <div className="flex justify-center items-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
                  <span className="ml-3">Loading audit logs...</span>
                </div>
              </div>
            ) : logs.length === 0 ? (
              <div className="px-4 py-12 text-center text-gray-500">
                No audit logs found
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="p-4 border-l-4 border-optio-purple">
                  {/* Date/Time - Top Right */}
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getActionTypeBadge(log.action_type)}`}>
                        {log.action_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(log.created_at)}</span>
                  </div>

                  {/* Observer -> Student */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{log.observer?.display_name || 'Unknown'}</div>
                      <div className="text-xs text-gray-500">{log.observer?.email}</div>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <div className="flex-1 text-right">
                      <div className="font-medium text-gray-900">{log.student?.display_name || 'Unknown'}</div>
                      <div className="text-xs text-gray-500">{log.student?.email}</div>
                    </div>
                  </div>

                  {/* Resource & IP - Bottom */}
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{log.resource_type || 'N/A'}</span>
                    <span>IP: {log.ip_address || 'N/A'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Desktop Table View */}
        {viewMode === 'table' && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date/Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Observer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Student
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Resource
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  IP Address
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
                      <span className="ml-3">Loading audit logs...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div>
                        <div className="font-medium text-gray-900">
                          {log.observer?.display_name || 'Unknown'}
                        </div>
                        <div className="text-gray-500 text-xs">{log.observer?.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div>
                        <div className="font-medium text-gray-900">
                          {log.student?.display_name || 'Unknown'}
                        </div>
                        <div className="text-gray-500 text-xs">{log.student?.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getActionTypeBadge(log.action_type)}`}>
                        {log.action_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {log.resource_type ? (
                        <div>
                          <div className="font-medium">{log.resource_type}</div>
                          {log.metadata && log.metadata.student_name && (
                            <div className="text-xs text-gray-400">{log.metadata.student_name}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.ip_address || 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="bg-gray-50 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200">
            <div className="text-sm text-gray-700 text-center sm:text-left">
              Showing page {pagination.page} of {pagination.pages} ({pagination.total} total records)
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={pagination.page === 1}
                className="min-h-[44px] px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: Math.min(prev.pages, prev.page + 1) }))}
                disabled={pagination.page === pagination.pages}
                className="min-h-[44px] px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ObserverAuditLog
