import React, { useEffect, useState, useMemo, useCallback, memo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { DIPLOMA_PILLARS, getPillarName } from '../utils/pillarMappings'

// Memoized component for Active Quests section
const ActiveQuests = memo(({ activeQuests }) => {
  if (!activeQuests || activeQuests.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 mb-4">No active quests yet.</p>
        <Link 
          to="/quests" 
          className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-purple-700 transition-colors"
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
    <div className="space-y-4">
      {activeQuests.map(quest => {
        const questId = quest.quest_id || quest.quests?.id
        
        if (!questId) {
          return null
        }
        
        // Calculate progress percentage (placeholder - will need backend support)
        const tasksCompleted = quest.tasks_completed || 0
        const totalTasks = quest.quests?.total_tasks || quest.total_tasks || 5
        const progressPercent = totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0
        
        return (
          <div
            key={quest.id}
            className="bg-white border-2 border-green-400 rounded-xl p-4 shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <h3 className="font-semibold text-lg text-gray-900">
                  {quest.quests?.title || 'Untitled Quest'}
                </h3>
                <div className="flex items-center gap-3 mt-2">
                  {quest.quests?.difficulty_level && (
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      quest.quests.difficulty_level === 'beginner' ? 'bg-green-100 text-green-700' :
                      quest.quests.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {quest.quests.difficulty_level.charAt(0).toUpperCase() + quest.quests.difficulty_level.slice(1)}
                    </span>
                  )}
                  {quest.quests?.estimated_hours && (
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                      ⏱ {quest.quests.estimated_hours}h
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    Started {quest.started_at ? new Date(quest.started_at).toLocaleDateString() : 'Recently'}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-gray-600">Progress</span>
                <span className="text-xs font-bold text-gray-700">{progressPercent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-green-400 to-green-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            
            {/* XP Preview */}
            {quest.quests?.quest_skill_xp && quest.quests.quest_skill_xp.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {quest.quests.quest_skill_xp.slice(0, 3).map((xp, idx) => (
                  <span key={idx} className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded-full">
                    +{xp.xp_amount} {getPillarName(xp.skill_category)}
                  </span>
                ))}
              </div>
            )}
            
            {/* Continue Button */}
            <Link
              to={`/quests/${questId}`}
              className="w-full inline-flex justify-center items-center px-4 py-2.5 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition-colors shadow-sm"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              Continue Quest
            </Link>
          </div>
        )
      })}
    </div>
  )
})

// Memoized component for Recent Completions section  
const RecentCompletions = memo(({ recentCompletions }) => {
  if (!recentCompletions || recentCompletions.length === 0) {
    return <p className="text-gray-600">No completed quests yet. Keep going!</p>
  }
  
  return (
    <div className="space-y-3">
      {recentCompletions.slice(0, 3).map(quest => (
        <div
          key={quest.id}
          className="p-3 bg-green-50 rounded-lg"
        >
          <h3 className="font-medium">{quest.quests?.title}</h3>
          <div className="flex gap-2 mt-1">
            {quest.quests?.quest_skill_xp?.map((award, idx) => (
              <span key={idx} className="text-xs text-green-700">
                +{award.xp_amount} {getPillarName(award.skill_category)} XP
              </span>
            ))}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Completed {quest.completed_at ? new Date(quest.completed_at).toLocaleDateString() : 'Recently'}
          </p>
        </div>
      ))}
    </div>
  )
})

const DashboardPage = () => {
  const { user } = useAuth()
  const [dashboardData, setDashboardData] = useState(null)
  const [portfolioData, setPortfolioData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Use the 5 Diploma Pillars
  const skillCategoryNames = useMemo(() => {
    return {
      creativity: 'Creativity',
      critical_thinking: 'Critical Thinking',
      practical_skills: 'Practical Skills',
      communication: 'Communication',
      cultural_literacy: 'Cultural Literacy'
    }
  }, [])

  const fetchDashboardData = useCallback(async () => {
    try {
      const response = await api.get('/users/dashboard')
      console.log('=== DASHBOARD DEBUG ===')
      console.log('Dashboard API response:', response.data)
      console.log('xp_by_category:', response.data.xp_by_category)
      console.log('total_xp:', response.data.total_xp)
      console.log('skill_xp:', response.data.skill_xp)
      console.log('xp_by_subject:', response.data.xp_by_subject)
      console.log('======================')
      setDashboardData(response.data)
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPortfolioData = useCallback(async () => {
    if (!user?.id) {
      console.log('No user ID available for portfolio fetch')
      return
    }
    try {
      const response = await api.get(`/portfolio/user/${user.id}`)
      console.log('=== PORTFOLIO DEBUG ===')
      console.log('Portfolio API response:', response.data)
      console.log('skill_xp:', response.data.skill_xp)
      console.log('total_xp:', response.data.total_xp)
      console.log('total_quests_completed:', response.data.total_quests_completed)
      console.log('=======================')
      
      // Only set portfolio data if it has actual XP data
      // This prevents overwriting good dashboard data with empty portfolio data
      if (response.data?.skill_xp && response.data.skill_xp.length > 0) {
        const hasActualXP = response.data.skill_xp.some(s => 
          (s.xp_amount && s.xp_amount > 0) || (s.total_xp && s.total_xp > 0)
        )
        if (hasActualXP || response.data.total_xp > 0) {
          setPortfolioData(response.data)
        } else {
          console.log('Portfolio has no XP data, not updating state')
        }
      }
    } catch (error) {
      console.error('Failed to fetch portfolio data:', error)
      // Don't let portfolio failure affect the dashboard
      // The dashboard data should have everything we need
    }
  }, [user?.id])

  // Transform skill XP data for charts using memoization
  // IMPORTANT: All hooks must be called before any conditional returns
  const { skillXPData, totalXP } = useMemo(() => {
    // Start with all categories initialized to 0
    const xpByCategory = {}
    Object.keys(skillCategoryNames).forEach(key => {
      xpByCategory[key] = 0
    })
    
    let totalXP = 0
    let dataSource = null
    
    console.log('Dashboard data:', dashboardData)
    console.log('Portfolio data:', portfolioData)
    
    // Always use dashboard xp_by_category if available - it's the most reliable
    if (dashboardData?.xp_by_category) {
      console.log('Using dashboard xp_by_category:', dashboardData.xp_by_category)
      
      // Check if we have actual XP data
      let hasXP = false
      Object.entries(dashboardData.xp_by_category).forEach(([category, xp]) => {
        if (category in xpByCategory) {
          xpByCategory[category] = xp || 0
          if (xp > 0) hasXP = true
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
      console.log('Fallback to portfolio skill_xp:', portfolioData.skill_xp)
      
      // Portfolio uses 'pillar' field, not 'skill_category'
      portfolioData.skill_xp.forEach(skill => {
        const category = skill.pillar || skill.skill_category
        const xp = skill.xp_amount ?? skill.total_xp ?? 0
        if (category && category in xpByCategory) {
          xpByCategory[category] = xp
        }
      })
      
      // Only update totalXP if we got data
      const portfolioTotal = Object.values(xpByCategory).reduce((sum, xp) => sum + xp, 0)
      if (portfolioTotal > 0) {
        totalXP = portfolioData.total_xp || portfolioTotal
      }
    }
    
    // Convert to chart data format - include ALL categories
    const skillXPData = Object.entries(xpByCategory).map(([category, xp]) => ({
      category: skillCategoryNames[category] || category,
      xp: xp,
      fullMark: 1000
    }))
    
    console.log('Final skillXPData:', skillXPData)
    console.log('Total XP:', totalXP)
    
    return { skillXPData, totalXP }
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

  // useEffect must be called after all other hooks
  useEffect(() => {
    if (user?.id) {
      fetchDashboardData()
      fetchPortfolioData()
    }
  }, [user?.id, fetchDashboardData, fetchPortfolioData])
  
  // Refresh dashboard data every 30 seconds to reflect task completions
  useEffect(() => {
    if (!user?.id) return
    
    const interval = setInterval(() => {
      fetchDashboardData()
      fetchPortfolioData()
    }, 30000) // 30 seconds
    
    return () => clearInterval(interval)
  }, [user?.id, fetchDashboardData, fetchPortfolioData])
  
  // Listen for task completion events
  useEffect(() => {
    const handleTaskComplete = () => {
      // Refresh data when a task is completed
      fetchDashboardData()
      fetchPortfolioData()
    }
    
    // Listen for custom event that could be triggered from task completion
    window.addEventListener('taskCompleted', handleTaskComplete)
    window.addEventListener('questCompleted', handleTaskComplete)
    
    return () => {
      window.removeEventListener('taskCompleted', handleTaskComplete)
      window.removeEventListener('questCompleted', handleTaskComplete)
    }
  }, [fetchDashboardData, fetchPortfolioData])

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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          {isNewUser ? `Welcome to Optio, ${user?.first_name}!` : `Welcome back, ${user?.first_name}!`}
        </h1>
        <p className="text-gray-600 mt-2">
          {isNewUser ? 
            'Start your learning journey by completing quests and earning XP!' :
            'Your Self-Validated Diploma is building value with every quest you complete.'}
        </p>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="card">
          <h3 className="text-lg font-semibold mb-2">Active Quests</h3>
          <p className="text-3xl font-bold text-primary">
            {dashboardData?.stats?.quests_in_progress || dashboardData?.active_quests?.length || 0}
          </p>
          <Link to="/quests" className="text-sm text-primary hover:underline mt-2 inline-block">
            Browse more quests →
          </Link>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-2">Total XP Earned</h3>
          <p className="text-3xl font-bold text-secondary">
            {totalXP}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Across all skill categories
          </p>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-2">Quests Completed</h3>
          <p className="text-3xl font-bold text-green-600">
            {portfolioData?.total_quests_completed || dashboardData?.stats?.quests_completed || dashboardData?.total_quests_completed || 0}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Keep building!
          </p>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-2">Tasks Completed</h3>
          <p className="text-3xl font-bold text-purple-600">
            {dashboardData?.stats?.tasks_completed || 0}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Progress on all quests
          </p>
        </div>
      </div>

      {/* Skill Development Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Bar Chart */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Skill Category Progress</h2>
          {skillXPData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={skillXPData} margin={{ top: 20, right: 20, bottom: 80, left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="category" 
                  tick={{ fontSize: 14, fill: '#374151', fontWeight: 500 }}
                  angle={-35}
                  textAnchor="end"
                  height={120}
                  interval={0}
                />
                <YAxis 
                  tick={{ fontSize: 14, fill: '#374151' }}
                  label={{ value: 'XP Points', angle: -90, position: 'insideLeft', style: { fontSize: 14, fill: '#374151', fontWeight: 500 } }}
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
          {skillXPData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <RadarChart data={skillXPData} margin={{ top: 30, right: 50, bottom: 30, left: 50 }}>
                <PolarGrid 
                  stroke="#e5e7eb"
                  strokeWidth={1.5}
                />
                <PolarAngleAxis 
                  dataKey="category" 
                  tick={{ fontSize: 14, fill: '#374151', fontWeight: 500 }}
                  className="text-gray-700"
                />
                <PolarRadiusAxis 
                  angle={90} 
                  domain={[0, 'dataMax']} 
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickFormatter={(value) => value.toLocaleString()}
                  stroke="#e5e7eb"
                />
                <Radar 
                  name="Skills" 
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

      {/* Upcoming Deadlines & Recommendations Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Upcoming Deadlines */}
        <div className="card bg-amber-50 border-amber-200">
          <h2 className="text-xl font-semibold mb-3 flex items-center">
            <svg className="w-5 h-5 mr-2 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Upcoming Deadlines
          </h2>
          {dashboardData?.active_quests && dashboardData.active_quests.length > 0 ? (
            <div className="space-y-2">
              {dashboardData.active_quests.slice(0, 3).map(quest => {
                const daysActive = quest.started_at ? 
                  Math.floor((new Date() - new Date(quest.started_at)) / (1000 * 60 * 60 * 24)) : 0
                const estimatedDays = (quest.quests?.estimated_hours || 8) / 2 // Assume 2 hours per day
                const daysRemaining = Math.max(0, Math.ceil(estimatedDays - daysActive))
                
                return (
                  <div key={quest.id} className="flex items-center justify-between p-2 bg-white rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {quest.quests?.title || 'Quest'}
                      </p>
                      <p className="text-xs text-gray-600">
                        Est. {daysRemaining} days to complete
                      </p>
                    </div>
                    {daysRemaining <= 3 && (
                      <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full">
                        Soon
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-600 text-sm">No active quests with deadlines</p>
          )}
        </div>
        
        {/* Skill Recommendations */}
        {leastDevelopedSkills.length > 0 && (
          <div className="card bg-yellow-50 border-yellow-200">
            <h2 className="text-xl font-semibold mb-3">Skills to Focus On</h2>
            <p className="text-gray-700 mb-3 text-sm">
              Build a well-rounded portfolio by developing these skills:
            </p>
            <div className="flex flex-wrap gap-2">
              {leastDevelopedSkills.map(skill => (
                <Link
                  key={skill}
                  to={`/quests?skill_category=${skill}`}
                  className="bg-yellow-200 text-yellow-900 px-4 py-2 rounded hover:bg-yellow-300 text-sm"
                >
                  Explore {skillCategoryNames[skill]} →
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Active Quests - Full Width for Prominence */}
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

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            to="/quests"
            className="flex flex-col items-center p-4 bg-white rounded-lg border-2 border-gray-200 hover:border-primary hover:shadow-md transition-all"
          >
            <svg className="w-8 h-8 mb-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="text-sm font-medium">New Quest</span>
          </Link>
          
          <Link
            to="/portfolio"
            className="flex flex-col items-center p-4 bg-white rounded-lg border-2 border-gray-200 hover:border-primary hover:shadow-md transition-all"
          >
            <svg className="w-8 h-8 mb-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm font-medium">Portfolio</span>
          </Link>
          
          <Link
            to="/leaderboard"
            className="flex flex-col items-center p-4 bg-white rounded-lg border-2 border-gray-200 hover:border-primary hover:shadow-md transition-all"
          >
            <svg className="w-8 h-8 mb-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-sm font-medium">Leaderboard</span>
          </Link>
          
          <Link
            to="/ai-quests"
            className="flex flex-col items-center p-4 bg-white rounded-lg border-2 border-gray-200 hover:border-primary hover:shadow-md transition-all"
          >
            <svg className="w-8 h-8 mb-2 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-sm font-medium">AI Quests</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Recent Completions</h2>
          <RecentCompletions 
            recentCompletions={dashboardData?.recent_completions} 
          />
        </div>
        
        {/* Daily Streak & Achievements */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Your Progress</h2>
          <div className="space-y-4">
            {/* Streak Counter */}
            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
              <div className="flex items-center">
                <svg className="w-8 h-8 text-orange-500 mr-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <div>
                  <p className="font-semibold text-gray-900">Daily Streak</p>
                  <p className="text-sm text-gray-600">Keep it going!</p>
                </div>
              </div>
              <div className="text-2xl font-bold text-orange-600">
                {dashboardData?.streak || 0} 🔥
              </div>
            </div>
            
            {/* Next Milestone */}
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-medium text-blue-900">Next Milestone</p>
                <p className="text-xs text-blue-700">{totalXP}/1000 XP</p>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min((totalXP / 1000) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-blue-700 mt-2">Unlock "Knowledge Seeker" badge at 1000 XP</p>
            </div>
            
            {/* Recent Achievements */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Recent Achievements</p>
              <div className="flex gap-2">
                {totalXP >= 100 && (
                  <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center" title="First 100 XP">
                    <span className="text-xl">🌟</span>
                  </div>
                )}
                {(dashboardData?.stats?.quests_completed || 0) >= 5 && (
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center" title="5 Quests Completed">
                    <span className="text-xl">🎯</span>
                  </div>
                )}
                {(dashboardData?.streak || 0) >= 3 && (
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center" title="3 Day Streak">
                    <span className="text-xl">🔥</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {user?.subscription_tier === 'explorer' && (
        <div className="mt-8 bg-gradient-to-r from-primary to-purple-700 text-white rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-2">Upgrade to Creator</h2>
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