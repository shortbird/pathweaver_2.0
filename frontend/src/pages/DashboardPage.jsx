import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

const DashboardPage = () => {
  const { user } = useAuth()
  const [dashboardData, setDashboardData] = useState(null)
  const [portfolioData, setPortfolioData] = useState(null)
  const [loading, setLoading] = useState(true)

  const skillCategoryNames = {
    reading_writing: 'Reading & Writing',
    thinking_skills: 'Thinking Skills',
    personal_growth: 'Personal Growth',
    life_skills: 'Life Skills',
    making_creating: 'Making & Creating',
    world_understanding: 'World Understanding'
  }

  useEffect(() => {
    fetchDashboardData()
    fetchPortfolioData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const response = await api.get('/users/dashboard')
      setDashboardData(response.data)
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPortfolioData = async () => {
    try {
      const response = await api.get(`/portfolio/user/${user?.id}`)
      setPortfolioData(response.data)
    } catch (error) {
      console.error('Failed to fetch portfolio data:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  // Transform skill XP data for charts
  const skillXPData = portfolioData?.skill_xp?.map(skill => ({
    category: skillCategoryNames[skill.skill_category] || skill.skill_category,
    xp: skill.total_xp,
    fullMark: 1000 // Max for radar chart scaling
  })) || []

  const totalXP = skillXPData.reduce((sum, item) => sum + item.xp, 0)

  // Get least developed skills for recommendations
  const leastDevelopedSkills = [...(portfolioData?.skill_xp || [])]
    .sort((a, b) => a.total_xp - b.total_xp)
    .slice(0, 2)
    .map(s => s.skill_category)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.first_name}!
        </h1>
        <p className="text-gray-600 mt-2">
          Your Self-Validated Diploma is building value with every quest you complete.
        </p>
      </div>

      {/* Portfolio Link Banner */}
      {portfolioData?.diploma && (
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg p-4 mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Your Portfolio</h3>
              <p className="text-sm opacity-90">Share your learning journey with the world</p>
            </div>
            <div className="flex gap-3">
              <Link
                to={`/portfolio/${portfolioData.diploma.portfolio_slug}`}
                className="bg-white text-primary px-4 py-2 rounded hover:bg-gray-100"
              >
                View Portfolio
              </Link>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/portfolio/${portfolioData.diploma.portfolio_slug}`)
                  alert('Portfolio link copied!')
                }}
                className="bg-white/20 text-white px-4 py-2 rounded hover:bg-white/30"
              >
                Copy Link
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="card">
          <h3 className="text-lg font-semibold mb-2">Active Quests</h3>
          <p className="text-3xl font-bold text-primary">
            {dashboardData?.active_quests?.length || 0}
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
            {portfolioData?.total_quests_completed || 0}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Keep building!
          </p>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-2">Friends</h3>
          <p className="text-3xl font-bold text-purple-600">
            {dashboardData?.friend_count || 0}
          </p>
          <Link to="/friends" className="text-sm text-primary hover:underline mt-2 inline-block">
            Manage friends →
          </Link>
        </div>
      </div>

      {/* Skill Development Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Bar Chart */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Skill Category Progress</h2>
          {skillXPData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={skillXPData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="category" 
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis />
                <Tooltip />
                <Bar dataKey="xp" fill="#6A4C93" name="XP Earned" />
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
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={skillXPData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="category" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis angle={90} domain={[0, 'dataMax']} />
                <Radar name="Skills" dataKey="xp" stroke="#6A4C93" fill="#6A4C93" fillOpacity={0.6} />
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
          {dashboardData?.active_quests?.length > 0 ? (
            <div className="space-y-3">
              {dashboardData.active_quests.map(quest => (
                <Link
                  key={quest.id}
                  to={`/quests/${quest.quest_id}`}
                  className="block p-3 bg-background rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <h3 className="font-medium">{quest.quests?.title}</h3>
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
                    Started {new Date(quest.started_at).toLocaleDateString()}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No active quests. Start exploring!</p>
          )}
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Recent Completions</h2>
          {dashboardData?.recent_completions?.length > 0 ? (
            <div className="space-y-3">
              {dashboardData.recent_completions.map(quest => (
                <div
                  key={quest.id}
                  className="p-3 bg-green-50 rounded-lg"
                >
                  <h3 className="font-medium">{quest.quests?.title}</h3>
                  <div className="flex gap-2 mt-1">
                    {quest.quests?.quest_skill_xp?.map((award, idx) => (
                      <span key={idx} className="text-xs text-green-700">
                        +{award.xp_amount} {skillCategoryNames[award.skill_category]?.split(' ')[0]} XP
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Completed {new Date(quest.completed_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No completed quests yet. Keep going!</p>
          )}
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