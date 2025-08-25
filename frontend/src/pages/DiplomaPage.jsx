import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'

const DiplomaPage = () => {
  const { slug } = useParams()
  const [diploma, setDiploma] = useState(null)
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
    fetchDiploma()
  }, [slug])

  const fetchDiploma = async () => {
    try {
      const response = await api.get(`/portfolio/public/${slug}`)
      console.log('Diploma data received:', response.data)
      console.log('Total XP:', response.data.total_xp)
      console.log('Skill XP:', response.data.skill_xp)
      console.log('Skill Details:', response.data.skill_details)
      console.log('Completed Quests:', response.data.completed_quests)
      setDiploma(response.data)
    } catch (error) {
      if (error.response?.status === 404) {
        setError('Diploma not found or is private')
      } else {
        setError('Failed to load diploma')
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
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Diploma Not Available</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!diploma) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-amber-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-2">
              Self-Validated Diploma
            </h1>
            <p className="text-xl opacity-90">
              {diploma.student.first_name} {diploma.student.last_name}
            </p>
            <div className="mt-4">
              <p className="text-sm opacity-80">Issued by Optio Quests</p>
              <p className="text-lg font-semibold">{formatDate(diploma.diploma_issued)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Diploma Statement */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8 border-2 border-amber-200">
          <h2 className="text-2xl font-bold text-center mb-4">Self-Validated Credential</h2>
          <div className="text-center text-gray-700 leading-relaxed space-y-4">
            <p>
              This is a <strong>self-validated diploma</strong> certifying that <strong>{diploma.student.first_name} {diploma.student.last_name}</strong> has
              completed <strong>{diploma.total_quests_completed || 0} quests</strong> and earned <strong>{diploma.total_xp || 0} experience points</strong>.
            </p>
            <p className="text-sm bg-amber-50 p-4 rounded-lg border border-amber-300">
              <strong>What is a self-validated diploma?</strong> The quality and value of this diploma is determined entirely by the quality
              and authenticity of the work submitted by the student. Each quest completion includes evidence of real learning and skill
              development. Employers and institutions can review the submitted evidence below to assess the depth and authenticity of the
              learning demonstrated.
            </p>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-amber-500">
            <h3 className="text-4xl font-bold text-amber-600">{diploma.total_xp || 0}</h3>
            <p className="text-gray-700 font-semibold">Total Experience Points</p>
            <p className="text-sm text-gray-500 mt-1">Earned through validated learning</p>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-green-500">
            <h3 className="text-4xl font-bold text-green-600">{diploma.total_quests_completed || 0}</h3>
            <p className="text-gray-700 font-semibold">Quests Completed</p>
            <p className="text-sm text-gray-500 mt-1">Real-world challenges mastered</p>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-purple-500">
            <h3 className="text-4xl font-bold text-purple-600">
              {diploma.skill_details?.length || 0}
            </h3>
            <p className="text-gray-700 font-semibold">Skills Developed</p>
            <p className="text-sm text-gray-500 mt-1">Unique competencies demonstrated</p>
          </div>
        </div>


        {/* Individual Skills */}
        {diploma.skill_details && diploma.skill_details.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Specific Skills Mastered</h2>
            <div className="flex flex-wrap gap-3">
              {diploma.skill_details.map((skill) => (
                <div
                  key={skill.skill_name}
                  className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg px-4 py-3 border border-amber-200 hover:shadow-md transition-shadow"
                >
                  <span className="font-semibold text-gray-800 capitalize">
                    {skill.skill_name.replace(/_/g, ' ')}
                  </span>
                  <span className="ml-2 text-sm text-amber-700 font-medium">
                    Practiced {skill.times_practiced} {skill.times_practiced === 1 ? 'time' : 'times'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed Quests */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">Learning Journey</h2>
          <p className="text-gray-600 mb-6">Quests completed with evidence of real-world application and skill development</p>
          {diploma.completed_quests && diploma.completed_quests.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {diploma.completed_quests.map((userQuest) => (
                <div key={userQuest.id} className="border-2 border-gray-200 rounded-lg p-5 hover:shadow-lg hover:border-amber-300 transition-all">
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
        <div className="mt-12 bg-gradient-to-r from-amber-100 to-orange-100 rounded-lg p-8 text-center">
          <h3 className="text-xl font-bold mb-4 text-gray-800">Share Your Achievement</h3>
          <p className="text-gray-600 mb-6">This diploma represents your real learning journey. Share it with employers, colleges, or anyone evaluating your capabilities.</p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href)
                alert('Diploma link copied to clipboard!')
              }}
              className="bg-amber-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-amber-700 transition-colors"
            >
              Copy Diploma Link
            </button>
            <a
              href={`https://twitter.com/intent/tweet?text=I earned my Self-Validated Diploma from @OptioQuests! Check out my verified learning achievements:&url=${window.location.href}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-sky-500 text-white px-8 py-3 rounded-lg font-semibold hover:bg-sky-600 transition-colors"
            >
              Share on Twitter
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t-2 border-amber-200 text-center">
          <div className="mb-4">
            <p className="text-lg font-bold text-gray-800">Optio Quests</p>
            <p className="text-gray-600">Self-Validated Learning Platform</p>
          </div>
          <p className="text-sm text-gray-500 max-w-2xl mx-auto">
            This diploma is an official credential representing authentic, evidence-based learning.
            Each quest completion has been validated through submitted proof of work, making this
            diploma a trustworthy representation of real-world skills and knowledge.
          </p>
        </div>
      </div>
    </div>
  )
}

export default DiplomaPage