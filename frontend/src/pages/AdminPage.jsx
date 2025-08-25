import React, { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'
import AdminQuestManager from './AdminQuestManager'

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
  const [showManager, setShowManager] = useState(false)
  const [editingQuest, setEditingQuest] = useState(null)
  const [importing, setImporting] = useState(false)
  const [csvFile, setCsvFile] = useState(null)

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

  const handleQuestSave = () => {
    setShowManager(false)
    setEditingQuest(null)
    fetchQuests()
  }

  const handleEdit = (quest) => {
    setEditingQuest(quest)
    setShowManager(true)
  }

  const handleDelete = async (questId) => {
    if (window.confirm('Are you sure you want to delete this quest?')) {
      try {
        await api.delete(`/admin/quests/${questId}`)
        toast.success('Quest deleted successfully')
        fetchQuests()
      } catch (error) {
        toast.error('Failed to delete quest')
      }
    }
  }

  const handleCSVUpload = async (e) => {
    e.preventDefault()
    if (!csvFile) {
      toast.error('Please select a CSV file')
      return
    }

    const formData = new FormData()
    formData.append('file', csvFile)

    try {
      await api.post('/admin/quests/bulk-import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      toast.success('Quests imported successfully!')
      setImporting(false)
      setCsvFile(null)
      fetchQuests()
    } catch (error) {
      toast.error('Failed to import quests. Please check your CSV format.')
    }
  }

  const downloadCSVTemplate = () => {
    const template = 'title,description,evidence_requirements,subjects,xp_amounts\n' +
      '"Hike to 10,000 feet","Complete a challenging high-altitude hike","A selfie at the top of your hike with GPS location or trail marker visible","physical_education,science","100,25"\n' +
      '"Read Classic Literature","Read and analyze a classic novel","Written book report (500 words) including themes and personal reflection","language_arts","150"\n' +
      '"Build a Website","Create a functional website with HTML/CSS/JavaScript","Link to deployed website and GitHub repository","technology,arts","200,50"'
    
    const blob = new Blob([template], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'quest_import_template.csv'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const getSkillCategoryName = (category) => {
    const categoryNames = {
      'reading_writing': 'Reading & Writing',
      'thinking_skills': 'Thinking Skills',
      'personal_growth': 'Personal Growth',
      'life_skills': 'Life Skills',
      'making_creating': 'Making & Creating',
      'world_understanding': 'World Understanding'
    }
    return categoryNames[category] || category
  }

  const getDifficultyBadgeColor = (level) => {
    switch(level) {
      case 'beginner': return 'bg-green-100 text-green-800'
      case 'intermediate': return 'bg-yellow-100 text-yellow-800'
      case 'advanced': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getEffortBadgeColor = (level) => {
    switch(level) {
      case 'light': return 'bg-blue-100 text-blue-800'
      case 'moderate': return 'bg-orange-100 text-orange-800'
      case 'intensive': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Manage Quests</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setImporting(!importing)}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            {importing ? 'Cancel Import' : 'Bulk Import'}
          </button>
          <button
            onClick={() => {
              setEditingQuest(null)
              setShowManager(true)
            }}
            className="btn-primary"
          >
            Create Quest
          </button>
        </div>
      </div>

      {importing && (
        <div className="card mb-6">
          <h3 className="text-lg font-semibold mb-4">Bulk Import Quests</h3>
          <form onSubmit={handleCSVUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Upload CSV File</label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files[0])}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark"
                required
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">
                Import Quests
              </button>
              <button
                type="button"
                onClick={downloadCSVTemplate}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
              >
                Download Template
              </button>
            </div>
            <div className="text-sm text-gray-600">
              <p className="font-semibold mb-1">CSV Format:</p>
              <p>title, description, evidence_requirements, subjects, xp_amounts</p>
              <p className="mt-1">Subjects should be comma-separated (e.g., "physical_education,science")</p>
              <p>XP amounts should match subjects order (e.g., "100,25")</p>
            </div>
          </form>
        </div>
      )}

      {showManager && (
        <AdminQuestManager
          quest={editingQuest}
          onClose={() => {
            setShowManager(false)
            setEditingQuest(null)
          }}
          onSave={handleQuestSave}
        />
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
                  Difficulty & Skills
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
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        {quest.difficulty_level && (
                          <span className={`px-2 py-1 text-xs rounded ${getDifficultyBadgeColor(quest.difficulty_level)}`}>
                            {quest.difficulty_level}
                          </span>
                        )}
                        {quest.effort_level && (
                          <span className={`px-2 py-1 text-xs rounded ${getEffortBadgeColor(quest.effort_level)}`}>
                            {quest.effort_level}
                          </span>
                        )}
                        {quest.estimated_hours && (
                          <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">
                            ~{quest.estimated_hours}h
                          </span>
                        )}
                      </div>
                      {quest.quest_skill_xp && quest.quest_skill_xp.length > 0 ? (
                        <div className="text-xs">
                          {quest.quest_skill_xp.map((award, idx) => (
                            <span key={idx} className="inline-block mr-2">
                              <span className="font-medium">{getSkillCategoryName(award.skill_category)}:</span>
                              <span className="ml-1 text-primary font-semibold">{award.xp_amount}XP</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No XP awards set</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600 max-w-xs">
                      {quest.evidence_requirements}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button 
                      onClick={() => handleEdit(quest)}
                      className="text-primary hover:text-primary-dark mr-3"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDelete(quest.id)}
                      className="text-red-600 hover:text-red-800"
                    >
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