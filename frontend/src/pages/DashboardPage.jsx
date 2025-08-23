import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const DashboardPage = () => {
  const { user } = useAuth()
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  const xpData = dashboardData?.xp_by_subject || []

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.first_name}!
        </h1>
        <p className="text-gray-600 mt-2">
          Track your progress and continue your learning journey.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
            {xpData.reduce((sum, item) => sum + item.total_xp, 0)}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Across all subjects
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

      {xpData.length > 0 && (
        <div className="card mb-8">
          <h2 className="text-xl font-semibold mb-4">XP by Subject</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={xpData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="subject" 
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={100}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="total_xp" fill="#6A4C93" name="XP Earned" />
            </BarChart>
          </ResponsiveContainer>
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
                  <p className="text-sm text-gray-600">
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
                  <p className="text-sm text-gray-600">
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
            Unlock official credit banking, transcript generation, and community XP bonuses!
          </p>
          <Link to="/subscription" className="btn-secondary inline-block">
            Learn More
          </Link>
        </div>
      )}
    </div>
  )
}

export default DashboardPage