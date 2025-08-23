import React, { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'

const AdminDashboard = () => {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    try {
      const response = await api.get('/admin/analytics')
      setAnalytics(response.data)
    } catch (error) {
      toast.error('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <h3 className="text-sm text-gray-600 mb-2">Total Users</h3>
          <p className="text-3xl font-bold">{analytics?.total_users || 0}</p>
        </div>
        <div className="card">
          <h3 className="text-sm text-gray-600 mb-2">Monthly Active</h3>
          <p className="text-3xl font-bold text-green-600">{analytics?.monthly_active_users || 0}</p>
        </div>
        <div className="card">
          <h3 className="text-sm text-gray-600 mb-2">Quests Completed</h3>
          <p className="text-3xl font-bold text-purple-600">{analytics?.total_quests_completed || 0}</p>
        </div>
        <div className="card">
          <h3 className="text-sm text-gray-600 mb-2">Paid Subscribers</h3>
          <p className="text-3xl font-bold text-yellow-600">
            {(analytics?.subscription_breakdown?.creator || 0) + 
             (analytics?.subscription_breakdown?.visionary || 0)}
          </p>
        </div>
      </div>
    </div>
  )
}

const AdminQuests = () => {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    evidence_requirements: '',
    xp_awards: []
  })

  useEffect(() => {
    fetchQuests()
  }, [])

  const fetchQuests = async () => {
    try {
      const response = await api.get('/quests')
      setQuests(response.data.quests)
    } catch (error) {
      toast.error('Failed to load quests')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await api.post('/admin/quests', formData)
      toast.success('Quest created successfully!')
      setCreating(false)
      setFormData({
        title: '',
        description: '',
        evidence_requirements: '',
        xp_awards: []
      })
      fetchQuests()
    } catch (error) {
      toast.error('Failed to create quest')
    }
  }

  const getSubjectName = (subject) => {
    const subjectNames = {
      'language_arts': 'Language Arts',
      'math': 'Math',
      'science': 'Science',
      'social_studies': 'Social Studies',
      'foreign_language': 'Foreign Language',
      'arts': 'Arts',
      'technology': 'Technology',
      'physical_education': 'PE'
    }
    return subjectNames[subject] || subject
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Manage Quests</h2>
        <button
          onClick={() => setCreating(!creating)}
          className="btn-primary"
        >
          {creating ? 'Cancel' : 'Create Quest'}
        </button>
      </div>

      {creating && (
        <div className="card mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="input-field w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="input-field w-full h-32"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Evidence Requirements</label>
              <textarea
                value={formData.evidence_requirements}
                onChange={(e) => setFormData({ ...formData, evidence_requirements: e.target.value })}
                className="input-field w-full h-24"
                required
              />
            </div>
            <button type="submit" className="btn-primary">
              Create Quest
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                  Quest Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                  Subjects & XP
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                  Evidence Requirements
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {quests.map(quest => (
                <tr key={quest.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{quest.title}</div>
                      <div className="text-sm text-gray-500 mt-1">{quest.description}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      {quest.quest_xp_awards && quest.quest_xp_awards.length > 0 ? (
                        quest.quest_xp_awards.map((award, idx) => (
                          <div key={idx} className="mb-1">
                            <span className="font-medium">{getSubjectName(award.subject)}:</span>
                            <span className="ml-2 text-primary font-semibold">{award.xp_amount} XP</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-gray-400">No XP awards set</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600 max-w-xs">
                      {quest.evidence_requirements}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button className="text-primary hover:text-primary-dark mr-3">
                      Edit
                    </button>
                    <button className="text-red-600 hover:text-red-800">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {quests.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No quests found. Create your first quest above.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const AdminSubmissions = () => {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSubmissions()
  }, [])

  const fetchSubmissions = async () => {
    try {
      const response = await api.get('/admin/submissions/pending')
      setSubmissions(response.data)
    } catch (error) {
      toast.error('Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }

  const handleReview = async (submissionId, action, feedback = '') => {
    try {
      await api.post(`/admin/submissions/${submissionId}/review`, {
        action,
        feedback
      })
      toast.success(`Submission ${action === 'approve' ? 'approved' : 'sent back for changes'}`)
      fetchSubmissions()
    } catch (error) {
      toast.error('Failed to review submission')
    }
  }

  if (loading) {
    return <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Review Submissions</h2>
      {submissions.length === 0 ? (
        <p className="text-gray-600">No pending submissions</p>
      ) : (
        <div className="space-y-4">
          {submissions.map(submission => (
            <div key={submission.id} className="card">
              <div className="mb-4">
                <h3 className="font-semibold">{submission.user_quests?.quests?.title}</h3>
                <p className="text-sm text-gray-600">
                  Submitted by: {submission.user_quests?.users?.username}
                </p>
                <p className="text-sm text-gray-600">
                  Date: {new Date(submission.submitted_at).toLocaleDateString()}
                </p>
              </div>
              
              {submission.submission_evidence?.map((evidence, idx) => (
                <div key={idx} className="mb-4 p-3 bg-gray-50 rounded">
                  {evidence.text_content && (
                    <p className="text-sm">{evidence.text_content}</p>
                  )}
                </div>
              ))}

              <div className="flex gap-2">
                <button
                  onClick={() => handleReview(submission.id, 'approve')}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  Approve
                </button>
                <button
                  onClick={() => {
                    const feedback = prompt('Enter feedback for the student:')
                    if (feedback) {
                      handleReview(submission.id, 'request_changes', feedback)
                    }
                  }}
                  className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
                >
                  Request Changes
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const AdminPage = () => {
  const location = useLocation()
  const currentPath = location.pathname.split('/').pop()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Panel</h1>
      
      <div className="flex gap-4 mb-8 border-b">
        <Link
          to="/admin"
          className={`pb-2 px-1 ${currentPath === 'admin' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Dashboard
        </Link>
        <Link
          to="/admin/quests"
          className={`pb-2 px-1 ${currentPath === 'quests' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Quests
        </Link>
        <Link
          to="/admin/submissions"
          className={`pb-2 px-1 ${currentPath === 'submissions' ? 'border-b-2 border-primary text-primary' : 'text-gray-600'}`}
        >
          Submissions
        </Link>
      </div>

      <Routes>
        <Route index element={<AdminDashboard />} />
        <Route path="quests" element={<AdminQuests />} />
        <Route path="submissions" element={<AdminSubmissions />} />
      </Routes>
    </div>
  )
}

export default AdminPage