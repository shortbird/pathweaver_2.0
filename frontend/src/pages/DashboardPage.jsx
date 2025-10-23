import React, { useEffect, memo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useUserDashboard } from '../hooks/api/useUserData'
import QuestCardSimple from '../components/quest/QuestCardSimple'
import LearningEventModal from '../components/learning-events/LearningEventModal'
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
          className="inline-flex items-center px-6 py-3 bg-gradient-primary text-white rounded-lg font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          <RocketLaunchIcon className="w-5 h-5 mr-2" />
          Start Your First Quest
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {allQuests.slice(0, 6).map(quest => {
        // Transform quest data to match QuestCardSimple expectations
        const questData = quest.quests || quest;
        const completedTasks = quest.tasks_completed || quest.completed_tasks || 0;
        const totalTasks = questData.task_count || questData.total_tasks || 1;

        const transformedQuest = {
          id: quest.quest_id || quest.id,
          title: questData.title,
          description: questData.description || questData.big_idea,
          image_url: questData.image_url,
          header_image_url: questData.header_image_url,
          user_enrollment: true, // Dashboard only shows enrolled quests
          completed_enrollment: quest.status === 'completed' || quest.completed_at,
          progress: {
            completed_tasks: completedTasks,
            total_tasks: totalTasks,
            percentage: totalTasks > 0
              ? Math.round((completedTasks / totalTasks) * 100)
              : 0
          },
          quest_tasks: questData.quest_tasks || []
        };
        return <QuestCardSimple key={transformedQuest.id} quest={transformedQuest} />;
      })}
    </div>
  )
})


const DashboardPage = () => {
  const { user } = useAuth()
  const [showLearningEventModal, setShowLearningEventModal] = useState(false)

  // Redirect parents to their dedicated dashboard
  if (user?.role === 'parent') {
    return <Navigate to="/parent/dashboard" replace />
  }

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
  // React Query will automatically refetch dashboard data when quest data is invalidated
  // No need for custom window events

  // Show error state if dashboard fails to load
  if (dashboardError) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Unable to load dashboard</h2>
          <p className="text-gray-600 mb-4">Please try refreshing the page</p>
          <button
            onClick={() => refetchDashboard()}
            className="px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-lg transition-all"
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
      {/* Header Section with Capture Button */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isNewUser ? `Welcome to Optio, ${user?.first_name}!` : `Welcome back, ${user?.first_name}!`}
          </h1>
          <p className="text-gray-600 mt-2">
            {isNewUser ?
              'Start your learning journey by completing quests and earning XP!' :
              'Choose a quest that calls to you and see where it leads.'}
          </p>
        </div>
        <button
          onClick={() => setShowLearningEventModal(true)}
          className="flex-shrink-0 bg-gradient-primary text-white px-4 py-2 rounded-lg hover:shadow-lg transition-all duration-300 flex items-center gap-2 font-medium text-sm"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Capture Moment
        </button>
      </div>

      {/* Active Quests Panel */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 font-['Poppins']">Current Quests</h2>
          <Link
            to="/quests"
            className="text-sm text-purple-600 hover:text-purple-800 font-medium transition-colors"
          >
            Browse All Quests →
          </Link>
        </div>
        <ActiveQuests activeQuests={dashboardData?.active_quests} />
      </div>

      {/* Learning Event Modal */}
      <LearningEventModal
        isOpen={showLearningEventModal}
        onClose={() => setShowLearningEventModal(false)}
        onSuccess={() => {
          setShowLearningEventModal(false);
          // Optionally refetch dashboard data here if needed
        }}
      />
    </div>
  )
}

export default DashboardPage