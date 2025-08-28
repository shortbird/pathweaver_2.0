import React, { useEffect, useState, useMemo, useCallback, memo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { DIPLOMA_PILLARS, getPillarName } from '../utils/pillarMappings'

// Memoized component for Active Quests section
const ActiveQuests = memo(({ activeQuests }) => {
  if (!activeQuests || activeQuests.length === 0) {
    return <p className="text-gray-600">No active quests. Start exploring!</p>
  }
  
  return (
    <div className="space-y-3">
      {activeQuests.map(quest => {
        // Debug log to see the actual structure
        console.log('Active quest data structure:', {
          quest_id: quest.quest_id,
          quests_id: quest.quests?.id,
          full_quest: quest
        })
        
        // The quest_id is a field on the user_quest record that references the quest
        // The actual quest data is nested under 'quests' property
        const questId = quest.quest_id || quest.quests?.id
        
        // If still no ID, show a placeholder but don't skip
        if (!questId) {
          console.warn('Quest missing ID, showing placeholder:', quest)
          return (
            <div key={quest.id} className="p-3 bg-yellow-50 rounded-lg">
              <p className="text-yellow-800">Quest data loading issue</p>
              <p className="text-sm text-gray-600 mt-1">User Quest ID: {quest.id}</p>
              <p className="text-sm text-gray-600">Quest ID field: {quest.quest_id || 'missing'}</p>
              <p className="text-sm text-gray-600">Quest object ID: {quest.quests?.id || 'no quest object'}</p>
              <button 
                onClick={() => console.log('Full quest data:', quest)}
                className="text-xs text-blue-600 hover:underline mt-2"
              >
                Log full data to console
              </button>
            </div>
          )
        }
        
        return (
          <Link
            key={quest.id}
            to={`/quests/${questId}`}
            className="block p-3 bg-background rounded-lg hover:bg-gray-100 transition-colors"
          >
            <h3 className="font-medium">{quest.quests?.title || 'Untitled Quest'}</h3>
            <div className="flex gap-2 mt-1">
              {quest.quests?.difficulty_level && (
                <span className={`text-xs px-2 py-0.5 rounded ${
                  quest.quests.difficulty_level === 'beginner' ? 'bg-green-100 text-green-800' :
                  quest.quests.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {quest.quests.difficulty_level}
                </span>
              )}
              {quest.quests?.estimated_hours && (
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-800">
                  {quest.quests.estimated_hours}h
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Started {quest.started_at ? new Date(quest.started_at).toLocaleDateString() : 'Recently'}
            </p>
          </Link>
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

      {/* Skill Recommendations */}
      {leastDevelopedSkills.length > 0 && (
        <div className="card mb-8 bg-yellow-50 border-yellow-200">
          <h2 className="text-xl font-semibold mb-3">Skills to Focus On</h2>
          <p className="text-gray-700 mb-3">
            Build a well-rounded portfolio by developing these skills:
          </p>
          <div className="flex flex-wrap gap-2">
            {leastDevelopedSkills.map(skill => (
              <Link
                key={skill}
                to={`/quests?skill_category=${skill}`}
                className="bg-yellow-200 text-yellow-900 px-4 py-2 rounded hover:bg-yellow-300"
              >
                Explore {skillCategoryNames[skill]} Quests →
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Active Quests</h2>
          <ActiveQuests activeQuests={dashboardData?.active_quests} />
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Recent Completions</h2>
          <RecentCompletions 
            recentCompletions={dashboardData?.recent_completions} 
          />
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