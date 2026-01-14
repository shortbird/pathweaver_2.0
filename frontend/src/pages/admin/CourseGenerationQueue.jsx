import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import toast from 'react-hot-toast'

// =============================================================================
// STATUS BADGE COMPONENT
// =============================================================================

const StatusBadge = ({ status }) => {
  const statusConfig = {
    pending: { label: 'Queued', className: 'bg-gray-100 text-gray-700' },
    generating_lessons: { label: 'Generating Lessons', className: 'bg-blue-100 text-blue-700' },
    generating_tasks: { label: 'Generating Tasks', className: 'bg-blue-100 text-blue-700' },
    finalizing: { label: 'Finalizing', className: 'bg-purple-100 text-purple-700' },
    completed: { label: 'Completed', className: 'bg-green-100 text-green-700' },
    failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
    cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-500' }
  }

  const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-700' }

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}

// =============================================================================
// PROGRESS BAR COMPONENT
// =============================================================================

const ProgressBar = ({ completed, total, status }) => {
  if (status === 'completed') {
    return <span className="text-sm text-green-600 font-medium">Done</span>
  }

  if (status === 'failed' || status === 'cancelled' || status === 'pending') {
    return <span className="text-sm text-gray-400">--</span>
  }

  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-optio-purple to-optio-pink transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-gray-500">{completed}/{total}</span>
    </div>
  )
}

// =============================================================================
// LOG VIEWER COMPONENT
// =============================================================================

const LogViewer = ({ logs, isOpen, onClose }) => {
  if (!isOpen) return null

  const levelColors = {
    info: 'text-gray-600',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    error: 'text-red-600'
  }

  const levelIcons = {
    info: (
      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    success: (
      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    warning: (
      <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    error: (
      <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    )
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-gray-900">Generation Logs</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {logs.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No logs yet</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log, index) => (
                <div key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-gray-400 font-mono text-xs whitespace-nowrap pt-0.5">
                    {formatTime(log.timestamp)}
                  </span>
                  <span className="flex-shrink-0 pt-0.5">
                    {levelIcons[log.level] || levelIcons.info}
                  </span>
                  <span className={levelColors[log.level] || levelColors.info}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t">
          <button
            onClick={onClose}
            className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// JOB ROW COMPONENT
// =============================================================================

const JobRow = ({ job, onCancel, onRetry, onStart, onViewLogs, onViewCourse }) => {
  const formatDuration = (startedAt, completedAt) => {
    if (!startedAt) return '--'

    const start = new Date(startedAt)
    const end = completedAt ? new Date(completedAt) : new Date()
    const diff = Math.round((end - start) / 1000)

    if (diff < 60) return `${diff}s`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
  }

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return '--'

    const date = new Date(timestamp)
    const now = new Date()
    const diff = Math.round((now - date) / 1000)

    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
    return date.toLocaleDateString()
  }

  const isActive = ['pending', 'generating_lessons', 'generating_tasks', 'finalizing'].includes(job.status)

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-gray-900">{job.course_title}</p>
          {job.current_item && isActive && (
            <p className="text-xs text-gray-500 mt-0.5">
              {job.current_item}
            </p>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={job.status} />
      </td>
      <td className="px-4 py-3">
        <ProgressBar
          completed={job.items_completed}
          total={job.items_total}
          status={job.status}
        />
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {formatTimeAgo(job.started_at || job.created_at)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {job.status === 'completed' || job.status === 'failed'
          ? formatDuration(job.started_at, job.completed_at)
          : isActive
          ? formatDuration(job.started_at, null)
          : '--'
        }
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onViewLogs(job.id)}
            className="text-gray-500 hover:text-optio-purple text-sm"
          >
            Logs
          </button>

          {job.status === 'pending' && (
            <button
              onClick={() => onStart(job.id)}
              className="text-green-600 hover:text-green-700 text-sm font-medium"
            >
              Start
            </button>
          )}

          {isActive && job.status !== 'pending' && (
            <button
              onClick={() => onCancel(job.id)}
              className="text-red-500 hover:text-red-700 text-sm"
            >
              Cancel
            </button>
          )}

          {job.status === 'failed' && (
            <button
              onClick={() => onRetry(job.id)}
              className="text-optio-purple hover:underline text-sm"
            >
              Retry
            </button>
          )}

          {job.status === 'completed' && (
            <button
              onClick={() => onViewCourse(job.course_id)}
              className="text-optio-purple hover:underline text-sm"
            >
              View
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const CourseGenerationQueue = () => {
  const navigate = useNavigate()

  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [selectedJobLogs, setSelectedJobLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    try {
      const params = filter === 'active' ? '?status=active' : ''
      const response = await api.get(`/api/admin/curriculum/generate/jobs${params}`)

      if (response.data.success) {
        setJobs(response.data.jobs)
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error)
    } finally {
      setLoading(false)
    }
  }, [filter])

  // Initial fetch
  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  // Polling for active jobs
  useEffect(() => {
    const hasActiveJobs = jobs.some(job =>
      ['pending', 'generating_lessons', 'generating_tasks', 'finalizing'].includes(job.status)
    )

    if (!hasActiveJobs) return

    const interval = setInterval(fetchJobs, 5000)
    return () => clearInterval(interval)
  }, [jobs, fetchJobs])

  // Handle view logs
  const handleViewLogs = async (jobId) => {
    try {
      const response = await api.get(`/api/admin/curriculum/generate/jobs/${jobId}`)

      if (response.data.success) {
        setSelectedJobId(jobId)
        setSelectedJobLogs(response.data.job.logs || [])
        setShowLogs(true)
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error)
      toast.error('Failed to load logs')
    }
  }

  // Handle cancel
  const handleCancel = async (jobId) => {
    try {
      const response = await api.post(`/api/admin/curriculum/generate/jobs/${jobId}/cancel`, {})

      if (response.data.success) {
        toast.success('Job cancelled')
        fetchJobs()
      }
    } catch (error) {
      console.error('Failed to cancel job:', error)
      toast.error(error.response?.data?.error || 'Failed to cancel job')
    }
  }

  // Handle start (for pending jobs that weren't auto-started)
  const handleStart = async (jobId) => {
    try {
      const response = await api.post(`/api/admin/curriculum/generate/jobs/${jobId}/start`, {})

      if (response.data.success) {
        toast.success('Job started')
        fetchJobs()
      }
    } catch (error) {
      console.error('Failed to start job:', error)
      toast.error(error.response?.data?.error || 'Failed to start job')
    }
  }

  // Handle retry
  const handleRetry = async (jobId) => {
    try {
      const response = await api.post(`/api/admin/curriculum/generate/jobs/${jobId}/retry`, {})

      if (response.data.success) {
        toast.success('Job queued for retry')
        fetchJobs()
      }
    } catch (error) {
      console.error('Failed to retry job:', error)
      toast.error(error.response?.data?.error || 'Failed to retry job')
    }
  }

  // Handle view course
  const handleViewCourse = (courseId) => {
    navigate(`/courses/${courseId}/edit`)
  }

  // Filter jobs for display
  const filteredJobs = filter === 'all' ? jobs : jobs.filter(job => {
    if (filter === 'active') {
      return ['pending', 'generating_lessons', 'generating_tasks', 'finalizing'].includes(job.status)
    }
    return job.status === filter
  })

  // Stats
  const activeCount = jobs.filter(job =>
    ['pending', 'generating_lessons', 'generating_tasks', 'finalizing'].includes(job.status)
  ).length

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Course Generation Queue</h1>
          <p className="text-gray-500">Monitor and manage AI course generation jobs</p>
        </div>

        <button
          onClick={() => navigate('/admin/generate-course')}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Course
        </button>
      </div>

      {/* Stats */}
      {activeCount > 0 && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
          <p className="text-blue-800">
            <strong>{activeCount}</strong> job{activeCount !== 1 ? 's' : ''} currently processing
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { value: 'all', label: 'All' },
          { value: 'active', label: 'Active' },
          { value: 'completed', label: 'Completed' },
          { value: 'failed', label: 'Failed' }
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.value
                ? 'bg-optio-purple text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-optio-purple border-t-transparent" />
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-16">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No generation jobs</h3>
            <p className="text-gray-500 mb-4">
              {filter === 'all'
                ? 'Start by creating a new course with AI'
                : `No ${filter} jobs found`
              }
            </p>
            {filter === 'all' && (
              <button
                onClick={() => navigate('/admin/generate-course')}
                className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90"
              >
                Create Course
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Course</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredJobs.map(job => (
                <JobRow
                  key={job.id}
                  job={job}
                  onCancel={handleCancel}
                  onRetry={handleRetry}
                  onStart={handleStart}
                  onViewLogs={handleViewLogs}
                  onViewCourse={handleViewCourse}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Log viewer modal */}
      <LogViewer
        logs={selectedJobLogs}
        isOpen={showLogs}
        onClose={() => {
          setShowLogs(false)
          setSelectedJobId(null)
          setSelectedJobLogs([])
        }}
      />
    </div>
  )
}

export default CourseGenerationQueue
