import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import VerificationModal from '../components/verification/VerificationModal'

const TeacherVerificationPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pendingTasks, setPendingTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [processingTaskId, setProcessingTaskId] = useState(null)
  const [selectedCompletion, setSelectedCompletion] = useState(null)

  useEffect(() => {
    fetchPendingTasks()
  }, [])

  const fetchPendingTasks = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get('/api/teacher/pending-verifications')
      setPendingTasks(response.data.tasks || [])
    } catch (err) {
      console.error('Error fetching pending tasks:', err)
      setError(err.response?.data?.error || 'Failed to load pending verifications')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickApprove = async (task) => {
    if (!window.confirm('Quick approve with AI-proposed distribution?')) {
      return
    }

    try {
      setProcessingTaskId(task.task_id)
      setError(null)

      await api.post(`/api/teacher/verify/${task.completion_id || task.task_id}`, {
        action: 'approve',
        subject_distribution: task.subject_xp_distribution,
        notes: 'Quick approved with AI distribution'
      })

      await fetchPendingTasks()
    } catch (err) {
      console.error('Error approving task:', err)
      setError(err.response?.data?.error || 'Failed to approve task')
    } finally {
      setProcessingTaskId(null)
    }
  }

  const handleOpenModal = (task) => {
    // Transform task data to match VerificationModal's expected format
    setSelectedCompletion({
      completion_id: task.completion_id || task.task_id,
      task_title: task.task_title,
      student_name: task.student_name,
      student_id: task.student_id,
      quest_title: task.quest_title,
      quest_id: task.quest_id,
      xp_awarded: task.xp_value || 0,
      completed_at: task.submitted_at || task.completed_at,
      aiProposedDistribution: task.subject_xp_distribution
    })
  }

  const handleModalSuccess = async () => {
    await fetchPendingTasks()
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <button
          onClick={() => navigate('/advisor/dashboard')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>
        <h1 className="text-2xl sm:text-3xl font-bold">Task Verification</h1>
        <p className="text-gray-600 mt-2">
          Review and verify student work for diploma credit eligibility
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-800 rounded-lg p-4">
          {error}
        </div>
      )}

      {pendingTasks.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 text-lg">No pending verifications</p>
          <p className="text-gray-400 mt-2">All student work has been reviewed!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingTasks.map((task) => (
            <div
              key={task.task_id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6"
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        {task.task_title}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Student: <span className="font-medium">{task.student_name}</span>
                      </p>
                      <p className="text-sm text-gray-600">
                        Quest: <span className="font-medium">{task.quest_title}</span>
                      </p>
                    </div>
                  </div>

                  {task.description && (
                    <p className="mt-3 text-gray-700">{task.description}</p>
                  )}

                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                      Proposed Subject Alignment (AI-Generated):
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {task.subject_xp_distribution && Object.entries(task.subject_xp_distribution).map(([subject, xp]) => (
                        <span
                          key={subject}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-optio-purple bg-opacity-10 text-optio-purple"
                        >
                          {subject}: {xp} XP ({(xp / 1000).toFixed(2)} credits)
                        </span>
                      ))}
                    </div>
                  </div>

                  {task.submitted_at && (
                    <p className="text-xs text-gray-500 mt-3">
                      Submitted: {new Date(task.submitted_at).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2 lg:min-w-[200px]">
                  <button
                    onClick={() => handleQuickApprove(task)}
                    disabled={processingTaskId === task.task_id}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
                  >
                    {processingTaskId === task.task_id ? 'Processing...' : 'Quick Approve'}
                  </button>
                  <button
                    onClick={() => handleOpenModal(task)}
                    disabled={processingTaskId === task.task_id}
                    className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
                  >
                    Review & Verify
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Verification Modal */}
      {selectedCompletion && (
        <VerificationModal
          completion={selectedCompletion}
          onClose={() => setSelectedCompletion(null)}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  )
}

export default TeacherVerificationPage
