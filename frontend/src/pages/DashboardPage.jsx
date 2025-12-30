import React, { useEffect, memo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useActingAs } from '../contexts/ActingAsContext'
import { useUserDashboard } from '../hooks/api/useUserData'
import QuestCardSimple from '../components/quest/QuestCardSimple'
import CourseCardWithQuests from '../components/course/CourseCardWithQuests'
// Deprecated: Keeping for potential future use
// import LearningEventModal from '../components/learning-events/LearningEventModal'
import {
  RocketLaunchIcon
} from '@heroicons/react/24/outline'

// Note: SSO token extraction now happens at App.jsx level before routing

// Memoized component for Active Quests section (now includes courses)
const ActiveQuests = memo(({ activeQuests, enrolledCourses, completedQuestsCount = 0 }) => {
  // Trust the backend's active_quests array - no need to filter
  // Backend already filters by is_active=True, which is the source of truth
  // Restarted quests have both is_active=True AND completed_at set from previous completion
  const allQuests = activeQuests || [];
  const allCourses = enrolledCourses || [];

  // Check if there's any content to display
  const hasContent = allCourses.length > 0 || allQuests.length > 0;

  if (!hasContent) {
    const isFirstQuest = completedQuestsCount === 0;
    const buttonText = isFirstQuest ? 'Pick Up Your First Quest' : 'Pick Up a New Quest';
    const emptyMessage = isFirstQuest ? 'No quests yet.' : 'Ready for your next learning adventure?';

    return (
      <div className="text-center py-8">
        <RocketLaunchIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-600 mb-4">{emptyMessage}</p>
        <Link
          to="/quests"
          className="inline-flex items-center px-6 py-3 bg-gradient-primary text-white rounded-lg font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          <RocketLaunchIcon className="w-5 h-5 mr-2" />
          {buttonText}
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Render enrolled courses first */}
      {allCourses.map(course => (
        <CourseCardWithQuests key={`course-${course.id}`} course={course} />
      ))}

      {/* Then render standalone quests */}
      {allQuests.map(quest => {
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
          // IMPORTANT: Don't check completed_at alone - restarted quests have it set
          // A quest is only completed if is_active=False (properly ended)
          completed_enrollment: quest.status === 'completed' || (!quest.is_active && quest.completed_at),
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
  const { actingAsDependent } = useActingAs()
  // Deprecated: Keeping state for potential future use
  // const [showLearningEventModal, setShowLearningEventModal] = useState(false)

  // Determine which user ID to use: dependent if acting as one, otherwise logged-in user
  const effectiveUserId = actingAsDependent?.id || user?.id

  // ✅ SSO FIX: Clear sso_pending flag from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('sso_pending')) {
      params.delete('sso_pending')
      const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '')
      window.history.replaceState({}, '', newUrl)
    }
  }, [])

  // Use React Query hooks for data fetching
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard
  } = useUserDashboard(effectiveUserId, {
    enabled: !!effectiveUserId,
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

  // Determine display name: dependent's name if acting as one, otherwise logged-in user
  const displayName = actingAsDependent?.display_name?.split(' ')[0] || user?.first_name

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Section with Capture Button */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {isNewUser ? `Welcome to Optio, ${displayName}!` : `Welcome back, ${displayName}!`}
          </h1>
          <p className="text-gray-600 mt-2">
            {isNewUser ?
              'Start your learning journey by completing quests and earning XP!' :
              'Choose a quest that calls to you and see where it leads.'}
          </p>
        </div>
        <Link
          to="/diploma"
          className="flex-shrink-0 bg-gradient-primary text-white px-4 py-2 rounded-lg hover:shadow-lg transition-all duration-300 flex items-center gap-2 font-medium text-sm"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          View Portfolio
        </Link>
        {/* Deprecated: Capture Moment button - keeping for potential future use
        <button
          onClick={() => setShowLearningEventModal(true)}
          className="flex-shrink-0 bg-gradient-primary text-white px-4 py-2 rounded-lg hover:shadow-lg transition-all duration-300 flex items-center gap-2 font-medium text-sm"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Capture Moment
        </button>
        */}
      </div>

      {/* Active Quests Panel */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 font-['Poppins']">Current Quests</h2>
          <Link
            to="/quests"
            className="text-sm text-optio-purple hover:text-purple-800 font-medium transition-colors"
          >
            Browse All Quests →
          </Link>
        </div>
        <ActiveQuests
          activeQuests={dashboardData?.active_quests}
          enrolledCourses={dashboardData?.enrolled_courses}
          completedQuestsCount={dashboardData?.stats?.completed_quests_count || 0}
        />
      </div>

      {/* Completed Quests Section */}
      {dashboardData?.recent_completed_quests && dashboardData.recent_completed_quests.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Poppins' }}>
              Recently Completed
            </h2>
          </div>

          <div className="space-y-3">
            {dashboardData.recent_completed_quests.map((completedQuest) => {
              const quest = completedQuest.quests;
              const completedDate = new Date(completedQuest.completed_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              });

              return (
                <Link
                  key={completedQuest.id}
                  to={`/quests/${completedQuest.quest_id}`}
                  className="flex items-center gap-4 p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group"
                >
                  {/* Quest Image */}
                  <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-200">
                    {quest.image_url || quest.header_image_url ? (
                      <img
                        src={quest.image_url || quest.header_image_url}
                        alt={quest.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Quest Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-800 group-hover:text-optio-purple transition-colors truncate" style={{ fontFamily: 'Poppins' }}>
                      {quest.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Completed on {completedDate}
                    </p>
                  </div>

                  {/* Checkmark Badge */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Deprecated: Learning Event Modal - keeping for potential future use
      <LearningEventModal
        isOpen={showLearningEventModal}
        onClose={() => setShowLearningEventModal(false)}
        onSuccess={() => {
          setShowLearningEventModal(false);
          // Optionally refetch dashboard data here if needed
        }}
      />
      */}
    </div>
  )
}

export default DashboardPage