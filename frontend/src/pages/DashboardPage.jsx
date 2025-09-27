import React, { useEffect, useState, useMemo, useCallback, memo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useUserDashboard } from '../hooks/api/useUserData'
import { usePortfolio } from '../hooks/api/usePortfolio'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts'
import { DIPLOMA_PILLARS, getPillarName, getPillarData, getPillarGradient } from '../utils/pillarMappings'
import { getTierDisplayName } from '../utils/tierMapping'
import CompactQuestCard from '../components/dashboard/CompactQuestCard'
import StatsCard from '../components/dashboard/StatsCard'
import RecentCompletions from '../components/dashboard/RecentCompletions'
import {
  RocketLaunchIcon,
  ChartBarIcon,
  TrophyIcon,
  StarIcon
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

      {/* Stacked Content Layout */}
      <div className="space-y-8">

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

        {/* Enhanced Stats Card */}
        <StatsCard stats={dashboardData?.stats} />

        {/* Skills Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                <ChartBarIcon className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Skill Progress</h2>
            </div>
{totalXP > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={skillXPData} margin={{ top: 10, right: 10, bottom: 70, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                    angle={-35}
                    textAnchor="end"
                    height={80}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    domain={[0, maxCategoryXP + 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <defs>
                    <linearGradient id="artsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#a855f7" />
                      <stop offset="100%" stopColor="#ec4899" />
                    </linearGradient>
                    <linearGradient id="stemGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                    <linearGradient id="languageGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                    <linearGradient id="societyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#f97316" />
                      <stop offset="100%" stopColor="#eab308" />
                    </linearGradient>
                    <linearGradient id="lifeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#ef4444" />
                      <stop offset="100%" stopColor="#f43f5e" />
                    </linearGradient>
                  </defs>
                  <Bar dataKey="xp" radius={[4, 4, 0, 0]}>
                    {skillXPData.map((entry, index) => {
                      let fillColor = "#6d469b"; // fallback
                      if (entry.category === 'Arts & Creativity') fillColor = "url(#artsGradient)";
                      else if (entry.category === 'STEM & Logic') fillColor = "url(#stemGradient)";
                      else if (entry.category === 'Language & Communication') fillColor = "url(#languageGradient)";
                      else if (entry.category === 'Society & Culture') fillColor = "url(#societyGradient)";
                      else if (entry.category === 'Life & Wellness') fillColor = "url(#lifeGradient)";

                      return <Cell key={`cell-${index}`} fill={fillColor} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12">
                <ChartBarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600">Complete quests to see your skill progress!</p>
              </div>
            )}
          </div>

          {/* Radar Chart */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                <StarIcon className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Skill Balance</h2>
            </div>
            {totalXP > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={skillXPData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <PolarGrid stroke="#f1f5f9" strokeWidth={1} />
                  <PolarAngleAxis
                    dataKey="category"
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, maxCategoryXP + 100]}
                    tick={false}
                    axisLine={false}
                  />
                  <defs>
                    <linearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#ef597b" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#6d469b" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <Radar
                    name="XP"
                    dataKey="xp"
                    stroke="#6d469b"
                    fill="url(#radarGradient)"
                    strokeWidth={2}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12">
                <StarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600">Your skill radar will appear as you progress!</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Completions */}
        <RecentCompletions recentItems={dashboardData?.recent_completions} />

      </div>

      {/* Upgrade Prompt for Explorer Tier */}
      {user?.subscription_tier === 'explorer' && (
        <div className="mt-8 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-xl p-6 shadow-lg">
          <div className="flex items-center gap-4">
            <TrophyIcon className="w-12 h-12 text-white" />
            <div>
              <h2 className="text-xl font-semibold mb-2">Upgrade to Supported</h2>
              <p className="mb-4 opacity-90">
                Get unlimited quest attempts, priority educator reviews, and exclusive content!
              </p>
              <Link
                to="/subscription"
                className="inline-block bg-white text-purple-600 px-6 py-2 rounded-lg hover:bg-gray-100 transition-colors font-semibold"
              >
                View Plans
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DashboardPage