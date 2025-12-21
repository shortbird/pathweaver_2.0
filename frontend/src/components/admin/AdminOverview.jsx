import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { BookOpenIcon, DocumentTextIcon, ExclamationCircleIcon, PlusIcon, TrophyIcon, UserPlusIcon, UsersIcon } from '@heroicons/react/24/outline'

const AdminOverview = () => {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [recentActivity, setRecentActivity] = useState([])
  const [needsAttention, setNeedsAttention] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOverviewData()
  }, [])

  const fetchOverviewData = async () => {
    try {
      setLoading(true)
      const [overviewRes, activityRes] = await Promise.all([
        api.get('/api/admin/analytics/overview'),
        api.get('/api/admin/analytics/activity')
      ])

      setStats(overviewRes.data.data)
      setRecentActivity(activityRes.data.data?.recent_events || [])

      // Build needs attention items (quest suggestions feature removed)
      const attention = []

      setNeedsAttention(attention)
    } catch (error) {
      console.error('Failed to load overview data:', error)
      toast.error('Failed to load dashboard overview')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Overview
        </h1>
        <p className="text-gray-600 mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Welcome to your admin dashboard
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Students"
          value={stats?.total_users || 0}
          icon={<UsersIcon className="w-8 h-8" />}
          gradient="from-blue-500 to-blue-600"
        />
        <StatCard
          title="Active Quests"
          value={stats?.active_quests || 0}
          icon={<BookOpenIcon className="w-8 h-8" />}
          gradient="from-purple-500 to-purple-600"
        />
        <StatCard
          title="Badges Created"
          value={stats?.total_badges || 0}
          icon={<TrophyIcon className="w-8 h-8" />}
          gradient="from-pink-500 to-optio-pink"
        />
        <StatCard
          title="Pending Reviews"
          value={stats?.pending_submissions || 0}
          icon={<ExclamationCircleIcon className="w-8 h-8" />}
          gradient="from-orange-500 to-orange-600"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <QuickActionButton
            icon={<PlusIcon className="w-5 h-5" />}
            label="Create Quest"
            onClick={() => navigate('/admin/quests')}
            color="purple"
          />
          <QuickActionButton
            icon={<UserPlusIcon className="w-5 h-5" />}
            label="Add User"
            onClick={() => navigate('/admin/users')}
            color="blue"
          />
          <QuickActionButton
            icon={<DocumentTextIcon className="w-5 h-5" />}
            label="Review Suggestions"
            onClick={() => navigate('/admin/quests')}
            color="green"
          />
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Recent Activity
          </h2>
          {recentActivity.length === 0 ? (
            <p className="text-gray-500 text-center py-8" style={{ fontFamily: 'Poppins, sans-serif' }}>
              No recent activity
            </p>
          ) : (
            <div className="space-y-3">
              {recentActivity.slice(0, 5).map((event, index) => (
                <ActivityItem key={index} event={event} />
              ))}
            </div>
          )}
          <button
            onClick={() => navigate('/admin/analytics')}
            className="mt-4 text-optio-purple hover:text-purple-700 font-medium text-sm"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            View Full Analytics →
          </button>
        </div>

        {/* Needs Attention */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Needs Attention
          </h2>
          {needsAttention.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                All caught up!
              </p>
              <p className="text-gray-500 text-sm mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                No pending items requiring attention
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {needsAttention.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between p-4 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors cursor-pointer"
                  onClick={item.action}
                >
                  <div className="flex items-start gap-3">
                    <ExclamationCircleIcon className="w-5 h-5 text-orange-600 mt-0.5" />
                    <p className="text-sm font-medium text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {item.title}
                    </p>
                  </div>
                  <button className="text-optio-purple hover:text-purple-700 font-medium text-sm whitespace-nowrap" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Review →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Stat Card Component
const StatCard = ({ title, value, icon, gradient }) => (
  <div className={`bg-gradient-to-r ${gradient} rounded-lg p-6 text-white shadow-md`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm opacity-90 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>{title}</p>
        <p className="text-4xl font-bold" style={{ fontFamily: 'Poppins, sans-serif' }}>{value}</p>
      </div>
      <div className="opacity-80">
        {icon}
      </div>
    </div>
  </div>
)

// Quick Action Button Component
const QuickActionButton = ({ icon, label, onClick, color }) => {
  const colorClasses = {
    purple: 'bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90',
    blue: 'bg-blue-600 hover:bg-blue-700',
    green: 'bg-green-600 hover:bg-green-700'
  }

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 p-4 ${colorClasses[color]} text-white rounded-lg transition-all shadow-sm hover:shadow-md`}
    >
      {icon}
      <span className="font-semibold" style={{ fontFamily: 'Poppins, sans-serif' }}>{label}</span>
    </button>
  )
}

// Activity Item Component
const ActivityItem = ({ event }) => {
  const getEventIcon = (type) => {
    switch (type) {
      case 'quest_completion':
        return <BookOpenIcon className="w-5 h-5 text-green-600" />
      case 'user_signup':
        return <UserPlusIcon className="w-5 h-5 text-blue-600" />
      case 'badge_earned':
        return <TrophyIcon className="w-5 h-5 text-optio-purple" />
      default:
        return <ExclamationCircleIcon className="w-5 h-5 text-gray-600" />
    }
  }

  const getTimeAgo = (timestamp) => {
    const now = new Date()
    const eventTime = new Date(timestamp)
    const diffInMinutes = Math.floor((now - eventTime) / (1000 * 60))

    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    return `${Math.floor(diffInMinutes / 1440)}d ago`
  }

  return (
    <div className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
      <div className="mt-0.5">
        {getEventIcon(event.type)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {event.description}
        </p>
        <p className="text-xs text-gray-500 mt-0.5" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {getTimeAgo(event.timestamp)}
        </p>
      </div>
    </div>
  )
}

export default AdminOverview
