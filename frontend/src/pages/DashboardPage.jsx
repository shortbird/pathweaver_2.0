import React, { useEffect, memo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useUserDashboard } from '../hooks/api/useUserData'
import CompactQuestCard from '../components/dashboard/CompactQuestCard'
import {
  RocketLaunchIcon
} from '@heroicons/react/24/outline'

// Memoized component for Active Quests section
const ActiveQuests = memo(({ activeQuests }) => {
  // Filter out completed and ended quests, but include all for compact view
  const allQuests = activeQuests || []

  if (allQuests.length === 0) {
    return (
      <div className="text-center py-8">
        <RocketLaunchIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-600 mb-4">No quests yet.</p>
        <Link
          to="/quests"
          className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
        >
          <RocketLaunchIcon className="w-5 h-5 mr-2" />
          Start Your First Quest
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {allQuests.slice(0, 6).map(quest => (
        <CompactQuestCard key={quest.id || quest.quest_id} quest={quest} />
      ))}
    </div>
  )
})


const DashboardPage = () => {
  const { user } = useAuth()

  // Use React Query hooks for data fetching
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard
  } = useUserDashboard(user?.id, {
    enabled: !!user?.id,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  })

  // Listen for task completion events to refresh data
  useEffect(() => {
    const handleTaskComplete = () => {
      refetchDashboard()
    }

    const handleQuestComplete = () => {
      refetchDashboard()
    }

    // Listen for custom events that could be triggered from task completion
    window.addEventListener('taskCompleted', handleTaskComplete)
    window.addEventListener('questCompleted', handleQuestComplete)

    return () => {
      window.removeEventListener('taskCompleted', handleTaskComplete)
      window.removeEventListener('questCompleted', handleQuestComplete)
    }
  }, [refetchDashboard])

  // Show error state if dashboard fails to load
  if (dashboardError) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Unable to load dashboard</h2>
          <p className="text-gray-600 mb-4">Please try refreshing the page</p>
          <button
            onClick={() => refetchDashboard()}
            className="px-4 py-2 bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white rounded-lg hover:shadow-lg transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Early return for loading state
  if (dashboardLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  // Check if user is new (created within the last 5 minutes)
  const isNewUser = user?.created_at ? 
    (new Date() - new Date(user.created_at)) < 5 * 60 * 1000 : false

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          {isNewUser ? `Welcome to Optio, ${user?.first_name}!` : `Welcome back, ${user?.first_name}!`}
        </h1>
        <p className="text-gray-600 mt-2">
          {isNewUser ?
            'Start your learning journey by completing quests and earning XP!' :
            'Choose a quest that calls to you and see where it leads.'}
        </p>
      </div>

      {/* Active Quests Panel */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
              <RocketLaunchIcon className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Your Quests</h2>
          </div>
          <Link
            to="/quests"
            className="text-sm text-purple-600 hover:text-purple-800 font-medium transition-colors"
          >
            Browse All Quests →
          </Link>
        </div>
        <ActiveQuests activeQuests={dashboardData?.active_quests} />
      </div>
    </div>
  )
}

export default DashboardPage