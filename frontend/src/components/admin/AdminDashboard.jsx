import React, { useState, useEffect, memo } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import MetricCard from './charts/MetricCard'
import ActivityFeed from './charts/ActivityFeed'
import BarChart from './charts/BarChart'
import LineChart from './charts/LineChart'

// Icon components for better consistency
const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)

const TrendUpIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
)

const AlertIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
  </svg>
)

const AdminDashboard = () => {
  const [overviewData, setOverviewData] = useState(null)
  const [activityData, setActivityData] = useState(null)
  const [trendsData, setTrendsData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchAllData()

    // Set up auto-refresh every 5 minutes
    const interval = setInterval(fetchAllData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchAllData = async () => {
    try {
      if (!loading) setRefreshing(true)
      setLoading(true)

      // Fetch all analytics data in parallel (simplified - no health endpoint)
      const [overviewRes, activityRes, trendsRes] = await Promise.all([
        api.get('/api/admin/analytics/overview'),
        api.get('/api/admin/analytics/activity'),
        api.get('/api/admin/analytics/trends')
      ])

      setOverviewData(overviewRes.data.data)
      setActivityData(activityRes.data.data)
      setTrendsData(trendsRes.data.data)
      setLastUpdated(new Date())

    } catch (error) {
      console.error('Failed to load dashboard data:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    toast.promise(fetchAllData(), {
      loading: 'Refreshing dashboard...',
      success: 'Dashboard updated!',
      error: 'Failed to refresh data'
    })
  }

  // Helper function to get priority level for alerts (simplified)
  const getPriorityLevel = () => {
    if (!overviewData) return 'normal'

    const { pending_submissions = 0 } = overviewData

    if (pending_submissions > 10) return 'high'
    if (pending_submissions > 5) return 'medium'
    return 'normal'
  }

  // Helper function to format numbers with appropriate units
  const formatMetricValue = (value, type = 'number') => {
    if (!value && value !== 0) return '0'

    switch (type) {
      case 'percentage':
        return `${value}%`
      case 'xp':
        return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toLocaleString()
      default:
        return value.toLocaleString()
    }
  }

  const priorityLevel = getPriorityLevel()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Platform Analytics</h1>
                <div className="flex items-center space-x-4 mt-2">
                  {lastUpdated && (
                    <p className="text-sm text-gray-500">
                      Last updated: {lastUpdated.toLocaleTimeString()}
                    </p>
                  )}
                  {priorityLevel !== 'normal' && (
                    <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
                      priorityLevel === 'high'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      <AlertIcon />
                      <span>{priorityLevel === 'high' ? 'Urgent Action Required' : 'Attention Needed'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className={`flex items-center space-x-2 px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-lg transition-all duration-200 ${
                  refreshing ? 'opacity-75 cursor-not-allowed' : ''
                }`}
              >
                <RefreshIcon />
                <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Dashboard Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">


        {/* Key Performance Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Active Students</p>
                <p className="text-3xl font-bold text-gray-900">{formatMetricValue(overviewData?.active_users)}</p>
                <p className="text-sm text-gray-500 mt-1">This week</p>
              </div>
              <div className="h-12 w-12 bg-gradient-primary rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Quest Completions</p>
                <p className="text-3xl font-bold text-gray-900">{formatMetricValue(overviewData?.quest_completions_today)}</p>
                <p className="text-sm text-gray-500 mt-1">Today</p>
              </div>
              <div className="h-12 w-12 bg-green-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">XP Earned</p>
                <p className="text-3xl font-bold text-gray-900">{formatMetricValue(overviewData?.total_xp_week, 'xp')}</p>
                <p className="text-sm text-gray-500 mt-1">This week</p>
              </div>
              <div className="h-12 w-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
            </div>
          </div>

          <div className={`rounded-xl shadow-sm border-2 p-6 ${
            (overviewData?.pending_submissions || 0) > 5
              ? 'bg-red-50 border-red-200'
              : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Pending Reviews</p>
                <p className={`text-3xl font-bold ${
                  (overviewData?.pending_submissions || 0) > 5 ? 'text-red-600' : 'text-gray-900'
                }`}>
                  {formatMetricValue(overviewData?.pending_submissions)}
                </p>
                <p className="text-sm text-gray-500 mt-1">Quest submissions</p>
              </div>
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                (overviewData?.pending_submissions || 0) > 5
                  ? 'bg-red-200'
                  : 'bg-blue-100'
              }`}>
                <svg className={`w-6 h-6 ${
                  (overviewData?.pending_submissions || 0) > 5 ? 'text-red-600' : 'text-blue-600'
                }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">User Growth</h3>
              <TrendUpIcon />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Users</span>
                <span className="font-semibold text-gray-900">{formatMetricValue(overviewData?.total_users)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">New This Week</span>
                <span className="font-semibold text-green-600">+{formatMetricValue(overviewData?.new_users_week)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Engagement Rate</span>
                <span className="font-semibold text-gray-900">{formatMetricValue(overviewData?.engagement_rate, 'percentage')}</span>
              </div>
            </div>
          </div>

          <ActivityFeed activities={activityData} loading={loading} />
        </div>

        {/* Analytics & Trends Section */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="text-xl font-semibold text-gray-900">Platform Analytics & Trends</h2>
            <div className="text-sm text-gray-500">Last 30 days</div>
          </div>

          {/* Trends Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">User Growth Trend</h3>
                <div className="flex items-center space-x-2 text-sm text-green-600">
                  <TrendUpIcon />
                  <span>Growing</span>
                </div>
              </div>
              <LineChart
                data={trendsData?.daily_signups}
                title=""
                loading={loading}
              />
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Quest Completion Trend</h3>
                <div className="text-sm text-gray-500">Daily completions</div>
              </div>
              <LineChart
                data={trendsData?.daily_completions}
                title=""
                loading={loading}
              />
            </div>
          </div>

          {/* Distribution Charts */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Learning Focus Areas</h3>
              <div className="text-sm text-gray-500">XP by skill pillar</div>
            </div>
            <BarChart
              data={trendsData?.xp_by_pillar}
              title=""
              xLabel=""
              yLabel="Total XP"
              loading={loading}
            />
          </div>
        </div>

        {/* Administrative Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Administrative Actions</h2>
            <div className="text-sm text-gray-500">Quick access to key functions</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* User Management */}
            <button
              onClick={() => window.location.href = '/admin/users'}
              className="group relative p-6 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl hover:from-blue-100 hover:to-blue-200 transition-all duration-200 text-left min-h-[44px]"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="p-3 bg-blue-500 rounded-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                </div>
                <svg className="w-5 h-5 text-blue-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">User Management</h3>
              <p className="text-sm text-gray-600">Manage accounts, roles, and subscriptions</p>
            </button>

            {/* Quest Management */}
            <button
              onClick={() => window.location.href = '/admin/quests'}
              className="group relative p-6 bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl hover:from-green-100 hover:to-green-200 transition-all duration-200 text-left min-h-[44px]"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="p-3 bg-green-500 rounded-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <svg className="w-5 h-5 text-green-400 group-hover:text-green-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Quest Management</h3>
              <p className="text-sm text-gray-600">Create, edit, and organize learning quests</p>
            </button>

            {/* Flagged Tasks Review */}
            <button
              onClick={() => window.location.href = '/admin/flagged-tasks'}
              className={`group relative p-6 rounded-xl transition-all duration-200 text-left border min-h-[44px] ${
                (overviewData?.flagged_tasks_count || 0) > 0
                  ? 'bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 hover:from-orange-100 hover:to-orange-200'
                  : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200 hover:from-gray-100 hover:to-gray-200'
              }`}
            >
              {(overviewData?.flagged_tasks_count || 0) > 0 && (
                <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-bold rounded-full w-8 h-8 flex items-center justify-center animate-pulse">
                  {overviewData.flagged_tasks_count}
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <div className={`p-3 rounded-lg ${
                  (overviewData?.flagged_tasks_count || 0) > 0 ? 'bg-orange-500' : 'bg-gray-400'
                }`}>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                  </svg>
                </div>
                <svg className={`w-5 h-5 transition-colors ${
                  (overviewData?.flagged_tasks_count || 0) > 0
                    ? 'text-orange-400 group-hover:text-orange-600'
                    : 'text-gray-400 group-hover:text-gray-600'
                }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Flagged Tasks</h3>
              <p className="text-sm text-gray-600">
                {(overviewData?.flagged_tasks_count || 0) > 0
                  ? `${overviewData.flagged_tasks_count} tasks flagged for review`
                  : 'No flagged tasks'
                }
              </p>
            </button>

            {/* AI Tools */}
            <button
              onClick={() => window.location.href = '/admin/ai-pipeline'}
              className="group relative p-6 bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-xl hover:from-indigo-100 hover:to-indigo-200 transition-all duration-200 text-left min-h-[44px]"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="p-3 bg-indigo-500 rounded-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <svg className="w-5 h-5 text-indigo-400 group-hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">AI Tools</h3>
              <p className="text-sm text-gray-600">Access AI content pipeline and analytics</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(AdminDashboard)