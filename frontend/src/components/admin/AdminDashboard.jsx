import React, { useState, useEffect, memo } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import MetricCard from './charts/MetricCard'
import ActivityFeed from './charts/ActivityFeed'
import BarChart from './charts/BarChart'
import LineChart from './charts/LineChart'
import HealthScore from './charts/HealthScore'

const AdminDashboard = () => {
  const [overviewData, setOverviewData] = useState(null)
  const [activityData, setActivityData] = useState(null)
  const [trendsData, setTrendsData] = useState(null)
  const [healthData, setHealthData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    fetchAllData()

    // Set up auto-refresh every 5 minutes
    const interval = setInterval(fetchAllData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchAllData = async () => {
    try {
      setLoading(true)

      // Fetch all analytics data in parallel
      const [overviewRes, activityRes, trendsRes, healthRes] = await Promise.all([
        api.get('/api/v3/admin/analytics/overview'),
        api.get('/api/v3/admin/analytics/activity'),
        api.get('/api/v3/admin/analytics/trends'),
        api.get('/api/v3/admin/analytics/health')
      ])

      setOverviewData(overviewRes.data.data)
      setActivityData(activityRes.data.data)
      setTrendsData(trendsRes.data.data)
      setHealthData(healthRes.data.data)
      setLastUpdated(new Date())

    } catch (error) {
      console.error('Failed to load dashboard data:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    toast.promise(fetchAllData(), {
      loading: 'Refreshing dashboard...',
      success: 'Dashboard updated!',
      error: 'Failed to refresh data'
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h2>
          {lastUpdated && (
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:shadow-lg transition-all duration-200"
        >
          Refresh Data
        </button>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Active Students"
          value={overviewData?.active_users}
          subtitle="This week"
          icon="👥"
          loading={loading}
        />
        <MetricCard
          title="Quest Completions"
          value={overviewData?.quest_completions_today}
          subtitle="Today"
          icon="✅"
          gradient={false}
          loading={loading}
        />
        <MetricCard
          title="XP Earned"
          value={overviewData?.total_xp_week}
          subtitle="This week"
          icon="⭐"
          loading={loading}
        />
        <MetricCard
          title="New Users"
          value={overviewData?.new_users_week}
          subtitle="This week"
          icon="👋"
          gradient={false}
          loading={loading}
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="Pending Reviews"
          value={overviewData?.pending_submissions}
          subtitle="Quest submissions"
          icon="📝"
          gradient={overviewData?.pending_submissions > 0}
          loading={loading}
        />
        <MetricCard
          title="Total Users"
          value={overviewData?.total_users}
          subtitle="All time"
          icon="🌟"
          gradient={false}
          loading={loading}
        />
        <MetricCard
          title="Engagement Rate"
          value={overviewData?.engagement_rate}
          subtitle="%"
          icon="📊"
          gradient={false}
          loading={loading}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Feed */}
        <ActivityFeed activities={activityData} loading={loading} />

        {/* System Health */}
        <HealthScore
          score={healthData?.health_score}
          alerts={healthData?.alerts}
          loading={loading}
        />
      </div>

      {/* Trends Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Growth Chart */}
        <LineChart
          data={trendsData?.daily_signups}
          title="Daily User Signups (Last 30 Days)"
          loading={loading}
        />

        {/* Quest Completions Chart */}
        <LineChart
          data={trendsData?.daily_completions}
          title="Daily Quest Completions (Last 30 Days)"
          loading={loading}
        />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* XP Distribution */}
        <BarChart
          data={trendsData?.xp_by_pillar}
          title="XP Distribution by Skill Pillar"
          xLabel="Skill Pillars"
          yLabel="Total XP"
          loading={loading}
        />

        {/* Subscription Distribution */}
        <BarChart
          data={overviewData?.subscription_distribution}
          title="User Subscription Distribution"
          xLabel="Subscription Tiers"
          yLabel="Number of Users"
          loading={loading}
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => window.location.href = '/admin/users'}
            className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors"
          >
            <div className="text-2xl mb-2">👥</div>
            <div className="text-sm font-medium">Manage Users</div>
            <div className="text-xs text-gray-500">View and edit user accounts</div>
          </button>

          <button
            onClick={() => window.location.href = '/admin/quests'}
            className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors"
          >
            <div className="text-2xl mb-2">🎯</div>
            <div className="text-sm font-medium">Manage Quests</div>
            <div className="text-xs text-gray-500">Create and edit quests</div>
          </button>

          <button
            onClick={() => window.location.href = '/admin/submissions'}
            className="relative p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors"
          >
            {overviewData?.pending_submissions > 0 && (
              <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                {overviewData.pending_submissions}
              </div>
            )}
            <div className="text-2xl mb-2">📝</div>
            <div className="text-sm font-medium">Review Submissions</div>
            <div className="text-xs text-gray-500">Approve custom quests</div>
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(AdminDashboard)