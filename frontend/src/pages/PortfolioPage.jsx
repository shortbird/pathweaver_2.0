import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'

const PortfolioPage = () => {
  const { slug } = useParams()
  const [portfolio, setPortfolio] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const skillCategoryNames = {
    reading_writing: 'Reading & Writing',
    thinking_skills: 'Thinking Skills',
    personal_growth: 'Personal Growth',
    life_skills: 'Life Skills',
    making_creating: 'Making & Creating',
    world_understanding: 'World Understanding'
  }

  const skillCategoryColors = {
    reading_writing: '#3B82F6',
    thinking_skills: '#8B5CF6',
    personal_growth: '#10B981',
    life_skills: '#F59E0B',
    making_creating: '#F97316',
    world_understanding: '#EC4899'
  }

  useEffect(() => {
    fetchPortfolio()
  }, [slug])

  const fetchPortfolio = async () => {
    try {
      const response = await api.get(`/portfolio/public/${slug}`)
      setPortfolio(response.data)
    } catch (error) {
      if (error.response?.status === 404) {
        setError('Portfolio not found or is private')
      } else {
        setError('Failed to load portfolio')
      }
    } finally {
      setLoading(false)
    }
  }

  const getSkillPercentage = (xp) => {
    // Max XP for display purposes (can be adjusted)
    const maxXP = 5000
    return Math.min((xp / maxXP) * 100, 100)
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Portfolio Not Available</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!portfolio) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                {portfolio.student.first_name} {portfolio.student.last_name}'s Portfolio
              </h1>
              <p className="text-gray-600 mt-1">@{portfolio.student.username}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Diploma Issued</p>
              <p className="font-semibold">{formatDate(portfolio.diploma_issued)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-4xl font-bold text-primary">{portfolio.total_xp}</h3>
            <p className="text-gray-600">Total XP Earned</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-4xl font-bold text-green-600">{portfolio.total_quests_completed}</h3>
            <p className="text-gray-600">Quests Completed</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-4xl font-bold text-purple-600">
              {portfolio.skill_details?.length || 0}
            </h3>
            <p className="text-gray-600">Skills Developed</p>
          </div>
        </div>

        {/* Skill Progress */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-2xl font-bold mb-6">Skill Development</h2>
          <div className="space-y-4">
            {portfolio.skill_xp?.map((skill) => (
              <div key={skill.skill_category}>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">
                    {skillCategoryNames[skill.skill_category]}
                  </span>
                  <span className="text-sm font-semibold">{skill.total_xp} XP</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="h-3 rounded-full transition-all duration-500"
                    style={{
                      width: `${getSkillPercentage(skill.total_xp)}%`,
                      backgroundColor: skillCategoryColors[skill.skill_category]
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Individual Skills */}
        {portfolio.skill_details && portfolio.skill_details.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-2xl font-bold mb-6">Skills Practiced</h2>
            <div className="flex flex-wrap gap-3">
              {portfolio.skill_details.map((skill) => (
                <div
                  key={skill.skill_name}
                  className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg px-4 py-2 border border-gray-200"
                >
                  <span className="font-medium text-gray-800">
                    {skill.skill_name.replace(/_/g, ' ')}
                  </span>
                  <span className="ml-2 text-sm text-gray-600">
                    ({skill.times_practiced}x)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed Quests */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-6">Quest Journey</h2>
          {portfolio.completed_quests && portfolio.completed_quests.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {portfolio.completed_quests.map((userQuest) => (
                <div key={userQuest.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <h3 className="font-semibold text-lg mb-2">
                    {userQuest.quests?.title}
                  </h3>
                  <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                    {userQuest.quests?.description}
                  </p>
                  
                  {/* Quest badges */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {userQuest.quests?.difficulty_level && (
                      <span className={`text-xs px-2 py-1 rounded ${
                        userQuest.quests.difficulty_level === 'beginner' ? 'bg-green-100 text-green-800' :
                        userQuest.quests.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {userQuest.quests.difficulty_level}
                      </span>
                    )}
                    {userQuest.quests?.estimated_hours && (
                      <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-800">
                        {userQuest.quests.estimated_hours}h
                      </span>
                    )}
                  </div>

                  {/* Evidence */}
                  {userQuest.submissions && userQuest.submissions.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-semibold text-gray-600 mb-2">Evidence Submitted:</p>
                      {userQuest.submissions[0].submission_evidence?.map((evidence, idx) => (
                        <div key={idx} className="text-sm text-gray-600">
                          {evidence.text_content && (
                            <p className="italic line-clamp-2">"{evidence.text_content}"</p>
                          )}
                          {evidence.file_url && (
                            <a 
                              href={evidence.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              View attachment
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 text-xs text-gray-500">
                    Completed: {formatDate(userQuest.completed_at)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No quests completed yet.</p>
          )}
        </div>

        {/* Share Section */}
        <div className="mt-8 text-center">
          <p className="text-gray-600 mb-4">Share this portfolio:</p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => navigator.clipboard.writeText(window.location.href)}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
            >
              Copy Link
            </button>
            <a
              href={`https://twitter.com/intent/tweet?text=Check out my learning portfolio!&url=${window.location.href}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-sky-500 text-white px-6 py-2 rounded hover:bg-sky-600"
            >
              Share on Twitter
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t text-center text-gray-600">
          <p>Powered by Optio Quests - Self-Validated Learning</p>
          <p className="mt-2 text-sm">
            This diploma represents real-world learning validated through evidence-based quests.
          </p>
        </div>
      </div>
    </div>
  )
}

export default PortfolioPage