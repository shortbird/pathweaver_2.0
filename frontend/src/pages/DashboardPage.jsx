import React, { useEffect, useState, useMemo, useCallback, memo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useUserDashboard } from '../hooks/api/useUserData'
import { usePortfolio } from '../hooks/api/usePortfolio'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { DIPLOMA_PILLARS, getPillarName, getPillarData, getPillarGradient } from '../utils/pillarMappings'
import { getTierDisplayName } from '../utils/tierMapping'

// Memoized component for Active Quests section
const ActiveQuests = memo(({ activeQuests }) => {
  const navigate = useNavigate()
  
  // Filter out completed and ended quests
  const filteredQuests = activeQuests?.filter(quest => {
    const tasksCompleted = quest.tasks_completed || quest.completed_tasks || 0
    const totalTasks = quest.quests?.task_count || quest.quests?.total_tasks || quest.task_count || quest.total_tasks || 1
    const progressPercent = totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0
    
    const isCompleted = progressPercent === 100 || quest.status === 'completed' || quest.completed_at
    const isEnded = quest.status === 'ended' || quest.ended_at
    
    return !isCompleted && !isEnded // Only show truly active quests
  }) || []
  
  if (filteredQuests.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 mb-4">No active quests yet.</p>
        <Link 
          to="/quests" 
          className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white rounded-lg font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Start Your First Quest
        </Link>
      </div>
    )
  }
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {filteredQuests.map(quest => {
        const questId = quest.quest_id || quest.quests?.id
        const questData = quest.quests || quest
        
        if (!questId) {
          return null
        }
        
        // Calculate progress
        const tasksCompleted = quest.tasks_completed || quest.completed_tasks || 0
        const totalTasks = questData.task_count || questData.total_tasks || 1
        const progressPercent = totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0
        
        // Determine quest status
        const isCompleted = progressPercent === 100 || quest.status === 'completed' || quest.completed_at
        const isEnded = quest.status === 'ended' || quest.ended_at
        const isActive = !isCompleted && !isEnded
        
        // Get pillar breakdown
        const pillarBreakdown = questData.pillar_breakdown || {}
        const totalXP = questData.total_xp || 0
        
        // Get dominant pillar for visual accent
        const dominantPillar = Object.entries(pillarBreakdown).reduce((max, [pillar, xp]) => 
          xp > (max.xp || 0) ? { pillar, xp } : max, {}).pillar || 'arts_creativity'
        
        // Get pillar gradient safely
        const dominantPillarGradient = getPillarGradient(dominantPillar)
        
        const handleCardClick = () => {
          navigate(`/quests/${questId}`)
        }
        
        return (
          <div
            key={quest.id}
            className="group bg-white rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-gray-100"
            onClick={handleCardClick}
          >
            {/* Visual Header - Colored bar at top */}
            <div className={`h-2 bg-gradient-to-r ${dominantPillarGradient}`} />
            
            {/* Content Section */}
            <div className="p-6">
              {/* Title and Description */}
              <div className="mb-4">
                <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-[#6d469b] transition-colors line-clamp-2">
                  {questData.title || 'Untitled Quest'}
                </h3>
                <p className="text-gray-600 text-sm line-clamp-3 leading-relaxed">
                  {questData.big_idea || questData.description || 'Continue your learning journey'}
                </p>
              </div>

              {/* Meta Information */}
              <div className="flex items-center gap-4 mb-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span className="text-gray-600">{tasksCompleted}/{totalTasks} Tasks</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-gray-600">
                    {quest.started_at ? new Date(quest.started_at).toLocaleDateString() : 'Recently'}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium text-gray-600">Progress</span>
                  <span className="text-sm font-bold text-gray-900">{progressPercent}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full bg-gradient-to-r ${dominantPillarGradient} rounded-full transition-all duration-500`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Pillars with XP */}
              <div className="mb-5">
                {/* Total XP Badge */}
                <div className="flex items-center gap-2 mb-3">
                  <div className={`px-3 py-1.5 rounded-full bg-gradient-to-r ${dominantPillarGradient} text-white text-sm font-bold shadow-md`}>
                    {totalXP} Total XP
                  </div>
                </div>
                
                {/* Individual Pillar XP Breakdown */}
                {Object.keys(pillarBreakdown).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(pillarBreakdown)
                      .filter(([_, xp]) => xp > 0)
                      .sort(([_, a], [__, b]) => b - a)
                      .map(([pillar, xp]) => {
                        const pillarData = getPillarData(pillar)
                        return (
                          <div 
                            key={pillar}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md ${pillarData.bg} ${pillarData.text} text-xs font-medium`}
                          >
                            <span>{pillarData.name}</span>
                            <span className="font-bold">+{xp}</span>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>

              {/* Continue Button */}
              {isCompleted ? (
                <button
                  className="w-full px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-lg font-semibold hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate('/diploma')
                  }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.5-2A11.95 11.95 0 0010 20c-7.18 0-13-5.82-13-13s5.82-13 13-13 13 5.82 13 13c0 2.485-.696 4.813-1.904 6.804L16.5 12" />
                  </svg>
                  Quest Complete - View Diploma
                </button>
              ) : isEnded ? (
                <button
                  className="w-full px-4 py-2 bg-gray-400 text-white rounded-lg font-semibold cursor-not-allowed flex items-center justify-center gap-2"
                  disabled
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Quest Ended
                </button>
              ) : (
                <button
                  className="w-full px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-semibold hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/quests/${questId}`)
                  }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Continue Quest
                </button>
              )}

              {/* Status Indicator */}
              <div className="mt-3 flex items-center gap-2 text-xs">
                {isCompleted ? (
                  <>
                    <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                    <span className="text-emerald-600 font-medium">Completed</span>
                  </>
                ) : isEnded ? (
                  <>
                    <div className="w-2 h-2 bg-gray-400 rounded-full" />
                    <span className="text-gray-600">Ended Early</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-green-600">In Progress</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
})

// Memoized component for Recent Completions section (both tasks and quests) 
const RecentCompletions = memo(({ recentItems }) => {
  if (!recentItems || recentItems.length === 0) {
    return <p className="text-gray-600">No recent completions. Go complete a task or quest!</p>
  }
  
  return (
    <div className="space-y-3">
      {recentItems.map((item, idx) => {
        const isTask = item.type === 'task'
        const pillarData = isTask ? getPillarData(item.pillar) : getPillarData('creativity') // Default for quests
        const pillarStyle = { 
          bg: pillarData.bg, 
          text: pillarData.text, 
          border: pillarData.bg.replace('bg-', 'border-').replace('100', '200') 
        }

        return (
          <div
            key={item.id || idx}
            className={`p-4 rounded-xl border ${pillarStyle.bg} ${pillarStyle.border}`}>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-medium text-sm text-gray-900">
                  {item.title}
                </h3>
                {isTask && (
                  <p className="text-xs text-gray-600 mt-1">
                    Quest: <span className="font-medium">{item.quest_title || 'Unknown Quest'}</span>
                  </p>
                )}
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${pillarStyle.bg} ${pillarStyle.text} ml-2`}>
                {isTask ? item.pillar.replace('_', ' ') : 'Quest'}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm font-bold text-green-600">
                +{item.xp || item.xp_awarded} XP
              </span>
              <span className="text-xs text-gray-500 ml-auto">
                {item.completed_at ? new Date(item.completed_at).toLocaleDateString() : 'Recently'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
})

// Memoized component for Completed Quests section
const CompletedQuests = memo(({ activeQuests }) => {
  const navigate = useNavigate()
  
  // Filter to show only completed quests
  const completedQuests = activeQuests?.filter(quest => {
    const tasksCompleted = quest.tasks_completed || quest.completed_tasks || 0
    const totalTasks = quest.quests?.task_count || quest.quests?.total_tasks || quest.task_count || quest.total_tasks || 1
    const progressPercent = totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0
    
    return progressPercent === 100 || quest.status === 'completed' || quest.completed_at
  }) || []
  
  if (completedQuests.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">Complete your first quest to see it here!</p>
      </div>
    )
  }
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {completedQuests.slice(0, 6).map(quest => { // Show max 6 completed quests
        const questId = quest.quest_id || quest.quests?.id
        const questData = quest.quests || quest
        
        if (!questId) return null
        
        const pillarBreakdown = questData.pillar_breakdown || {}
        const totalXP = questData.total_xp || 0
        const dominantPillar = Object.entries(pillarBreakdown).reduce((max, [pillar, xp]) => 
          xp > (pillarBreakdown[max] || 0) ? pillar : max, 'life_wellness')
        const dominantPillarGradient = getPillarGradient(dominantPillar)
        
        return (
          <div 
            key={questId}
            className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden cursor-pointer group border-2 border-emerald-200"
            onClick={() => navigate('/diploma')}
          >
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-emerald-600 transition-colors">
                {questData.title}
              </h3>
              
              <div className="flex items-center gap-2 mb-4">
                <div className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-sm font-medium">
                  ✓ Completed
                </div>
                <div className={`px-3 py-1.5 rounded-full bg-gradient-to-r ${dominantPillarGradient} text-white text-sm font-bold`}>
                  {totalXP} XP
                </div>
              </div>
              
              <button
                className="w-full px-4 py-2 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600 transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate('/diploma')
                }}
              >
                View on Diploma
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
})

const DashboardPage = () => {
  const { user, loginTimestamp } = useAuth()

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

  const {
    data: portfolioData,
    isLoading: portfolioLoading,
  } = usePortfolio(user?.id, {
    enabled: !!user?.id && !dashboardData?.skill_xp?.length, // Only fetch if dashboard lacks XP data
  })

  const loading = dashboardLoading || portfolioLoading

  // Use the 5 Diploma Pillars with updated keys
  const skillCategoryNames = useMemo(() => {
    return {
      arts_creativity: 'Arts & Creativity',
      stem_logic: 'STEM & Logic',
      life_wellness: 'Life & Wellness',
      language_communication: 'Language & Communication',
      society_culture: 'Society & Culture'
    }
  }, [])

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

  // Transform skill XP data for charts using memoization
  // IMPORTANT: All hooks must be called before any conditional returns
  const { skillXPData, totalXP, maxCategoryXP } = useMemo(() => {
    // Start with all categories initialized to 0
    const xpByCategory = {}
    Object.keys(skillCategoryNames).forEach(key => {
      xpByCategory[key] = 0
    })
    
    let totalXP = 0
    let maxCategoryXP = 0
    let dataSource = null
    
    
    // Always use dashboard xp_by_category if available - it's the most reliable
    if (dashboardData?.xp_by_category) {
      
      // Check if we have actual XP data
      let hasXP = false
      Object.entries(dashboardData.xp_by_category).forEach(([category, xp]) => {
        // The backend now sends new pillar keys, so they should match directly
        if (category in xpByCategory) {
          xpByCategory[category] = xp || 0
          if (xp > 0) hasXP = true
        } else {
        }
      })
      
      // Only update totalXP if we have data
      if (hasXP || dashboardData.stats?.total_xp > 0) {
        totalXP = dashboardData.stats?.total_xp || dashboardData.total_xp || Object.values(xpByCategory).reduce((sum, xp) => sum + xp, 0)
        dataSource = 'dashboard'
      }
    }
    
    // Only use portfolio as fallback if dashboard has no data
    if (dataSource !== 'dashboard' && portfolioData?.skill_xp && Array.isArray(portfolioData.skill_xp)) {
      
      // Handle pillar key mapping for portfolio data (may contain old keys)
      const pillarMapping = {
        'creativity': 'arts_creativity',
        'critical_thinking': 'stem_logic',
        'practical_skills': 'life_wellness',
        'communication': 'language_communication',
        'cultural_literacy': 'society_culture'
      }
      
      // Portfolio uses 'pillar' field, not 'skill_category'
      portfolioData.skill_xp.forEach(skill => {
        const category = skill.pillar || skill.skill_category
        const xp = skill.xp_amount ?? skill.total_xp ?? 0
        
        // Normalize pillar key
        const normalizedCategory = pillarMapping[category] || category
        
        if (normalizedCategory && normalizedCategory in xpByCategory) {
          xpByCategory[normalizedCategory] = xp
        }
      })
      
      // Only update totalXP if we got data
      const portfolioTotal = Object.values(xpByCategory).reduce((sum, xp) => sum + xp, 0)
      if (portfolioTotal > 0) {
        totalXP = portfolioData.total_xp || portfolioTotal
      }
    }
    
    // Calculate max XP for scaling
    maxCategoryXP = Math.max(...Object.values(xpByCategory), 100)
    
    // Convert to chart data format - include ALL categories
    const skillXPData = Object.entries(xpByCategory).map(([category, xp]) => ({
      category: skillCategoryNames[category] || category,
      xp: xp,
      fullMark: maxCategoryXP + 100  // Add buffer for better visualization
    }))
    
    
    return { skillXPData, totalXP, maxCategoryXP }
  }, [dashboardData, portfolioData, skillCategoryNames])

  // Get least developed skills for recommendations
  const leastDevelopedSkills = useMemo(() => {
    return skillXPData
      .sort((a, b) => a.xp - b.xp)
      .slice(0, 2)
      .map(s => {
        // Find the original category key
        for (const [key, value] of Object.entries(skillCategoryNames)) {
          if (value === s.category || key === s.category) {
            return key
          }
        }
        return s.category
      })
  }, [skillXPData, skillCategoryNames])

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

  // Early return for loading state - MUST be after all hooks
  if (loading) {
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
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          {isNewUser ? `Welcome to Optio, ${user?.first_name}!` : `Welcome back, ${user?.first_name}!`}
        </h1>
        <p className="text-gray-600 mt-2">
          {isNewUser ? 
            'Start your learning journey by completing quests and earning XP!' :
            'Choose a quest that calls to you and see where it leads.'}
        </p>
      </div>

      {/* Active Quests - Moved to top */}
      <div className="mb-8">
        <div className="card bg-gradient-to-br from-green-50 to-white border-green-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold flex items-center">
              <svg className="w-6 h-6 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Your Active Quests
            </h2>
            <Link 
              to="/quests" 
              className="text-sm text-primary hover:text-purple-700 font-medium"
            >
              Browse All Quests →
            </Link>
          </div>
          <ActiveQuests activeQuests={dashboardData?.active_quests} />
        </div>
        
      </div>



      {/* Skill Development Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Bar Chart */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Skill Category Progress</h2>
          {totalXP > 0 ? (
            <ResponsiveContainer width="100%" height={420}>
              <BarChart data={skillXPData} margin={{ top: 10, right: 10, bottom: 70, left: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="category" 
                  tick={{ fontSize: 12, fill: '#374151', fontWeight: 500 }}
                  angle={-35}
                  textAnchor="end"
                  height={100}
                  interval={0}
                />
                <YAxis 
                  tick={{ fontSize: 12, fill: '#374151' }}
                  domain={[0, maxCategoryXP + 100]}
                  label={{ value: 'XP', angle: -90, position: 'insideLeft', style: { fontSize: 14, fill: '#374151', fontWeight: 500 } }}
                />
                <Tooltip 
                  contentStyle={{ fontSize: 14, backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  labelStyle={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}
                />
                <Bar dataKey="xp" fill="#6A4C93" name="XP Earned" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-600">Complete quests to see your skill progress!</p>
          )}
        </div>

        {/* Radar Chart */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Skill Balance</h2>
          {totalXP > 0 ? (
            <ResponsiveContainer width="100%" height={420}>
              <RadarChart data={skillXPData} margin={{ top: 30, right: 50, bottom: 30, left: 50 }}>
                <PolarGrid 
                  stroke="#e5e7eb"
                  strokeWidth={1.5}
                />
                <PolarAngleAxis 
                  dataKey="category" 
                  tick={{ fontSize: 14, fill: '#374151', fontWeight: 500, dy: 5 }}
                  className="text-gray-700"
                />
                <PolarRadiusAxis 
                  angle={90} 
                  domain={[0, maxCategoryXP + 100]} 
                  tick={false}
                  axisLine={false}
                />
                <Radar 
                  name="XP" 
                  dataKey="xp" 
                  stroke="#6A4C93" 
                  fill="#6A4C93" 
                  fillOpacity={0.6}
                  strokeWidth={2}
                />
                <Tooltip 
                  contentStyle={{ fontSize: 14, backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  labelStyle={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-600">Your skill radar will appear here as you progress!</p>
          )}
        </div>
      </div>



      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Recent Completions</h2>
          <RecentCompletions 
            recentItems={dashboardData?.recent_completions} 
          />
        </div>
        
        {/* Keep a simplified stats card */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Your Stats</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-700">Total XP</span>
              <span className="text-xl font-bold text-primary">{totalXP}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-700">Quests Completed</span>
              <span className="text-xl font-bold text-green-600">
                {portfolioData?.total_quests_completed || dashboardData?.stats?.quests_completed || 0}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-700">Tasks Completed</span>
              <span className="text-xl font-bold text-purple-600">
                {dashboardData?.stats?.tasks_completed || 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {user?.subscription_tier === 'explorer' && (
        <div className="mt-8 bg-gradient-to-r from-primary to-purple-700 text-white rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-2">Upgrade to Supported</h2>
          <p className="mb-4">
            Get unlimited quest attempts, priority educator reviews, and exclusive content!
          </p>
          <Link
            to="/subscription"
            className="inline-block bg-white text-primary px-6 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            View Plans
          </Link>
        </div>
      )}
    </div>
  )
}

export default DashboardPage