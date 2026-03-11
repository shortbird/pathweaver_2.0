import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import toast from 'react-hot-toast'

const StatusBadge = ({ status }) => {
  const statusConfig = {
    pending: { label: 'Queued', className: 'bg-gray-100 text-gray-700' },
    generating_lessons: { label: 'Lessons', className: 'bg-blue-100 text-blue-700' },
    generating_tasks: { label: 'Tasks', className: 'bg-blue-100 text-blue-700' },
    generating_showcase: { label: 'Showcase', className: 'bg-indigo-100 text-indigo-700' },
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

const BulkCourseGeneration = () => {
  const [topicsText, setTopicsText] = useState('')
  const [autoPublish, setAutoPublish] = useState(true)
  const [delaySeconds, setDelaySeconds] = useState(5)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [jobs, setJobs] = useState([])
  const [polling, setPolling] = useState(false)

  // Poll for job status updates
  const fetchStatus = useCallback(async () => {
    try {
      const response = await api.get('/api/admin/curriculum/generate/bulk/status')
      if (response.data.success) {
        setJobs(response.data.jobs || [])
        // Stop polling when no jobs are active
        const hasActive = (response.data.jobs || []).some(j =>
          !['completed', 'failed', 'cancelled'].includes(j.status)
        )
        if (!hasActive) {
          setPolling(false)
        }
      }
    } catch {
      // Silently fail on status polls
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    if (!polling) return
    const interval = setInterval(fetchStatus, 4000)
    return () => clearInterval(interval)
  }, [polling, fetchStatus])

  const handleGenerate = async () => {
    const topics = topicsText
      .split('\n')
      .map(t => t.trim())
      .filter(t => t.length > 0)

    if (topics.length === 0) {
      toast.error('Enter at least one topic')
      return
    }

    if (topics.length > 50) {
      toast.error('Maximum 50 topics per batch')
      return
    }

    setLoading(true)
    setResults(null)

    try {
      const response = await api.post('/api/admin/curriculum/generate/bulk', {
        topics,
        auto_publish: autoPublish,
        delay_seconds: delaySeconds
      })

      if (response.data.success) {
        setResults(response.data)
        toast.success(`Queued ${response.data.courses.length} courses for generation`)
        setPolling(true)
        fetchStatus()
      } else {
        toast.error(response.data.error || 'Bulk generation failed')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Bulk generation failed')
    } finally {
      setLoading(false)
    }
  }

  const topicCount = topicsText
    .split('\n')
    .filter(t => t.trim().length > 0).length

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Bulk Course Generation</h2>
        <p className="text-sm text-gray-500 mt-1">
          Generate multiple courses at once from a list of topics. Each topic creates a course with outline, lessons, tasks, and public page content.
        </p>
      </div>

      {/* Input Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div>
          <label htmlFor="topics" className="block text-sm font-medium text-gray-700 mb-1">
            Topics (one per line)
          </label>
          <textarea
            id="topics"
            value={topicsText}
            onChange={e => setTopicsText(e.target.value)}
            rows={10}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
            placeholder={'Board Games\nCooking Basics\nPhotography\nStart a Business\nRobots and Electronics\nCreative Writing\nGardening\nAnimation'}
            disabled={loading}
          />
          <p className="text-xs text-gray-400 mt-1">
            {topicCount} topic{topicCount !== 1 ? 's' : ''} entered
          </p>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoPublish}
              onChange={e => setAutoPublish(e.target.checked)}
              className="h-4 w-4 text-optio-purple rounded border-gray-300 focus:ring-optio-purple"
              disabled={loading}
            />
            <span className="text-sm text-gray-700">Auto-publish when complete</span>
          </label>

          <div className="flex items-center gap-2">
            <label htmlFor="delay" className="text-sm text-gray-700">Delay between courses:</label>
            <input
              id="delay"
              type="number"
              value={delaySeconds}
              onChange={e => setDelaySeconds(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))}
              className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
              min={0}
              max={60}
              disabled={loading}
            />
            <span className="text-sm text-gray-500">seconds</span>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || topicCount === 0}
          className="px-6 py-2.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {loading ? 'Creating outlines...' : `Generate ${topicCount} Course${topicCount !== 1 ? 's' : ''}`}
        </button>
      </div>

      {/* Results from submission */}
      {results && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Submission Results</h3>

          {results.courses.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-green-700">
                {results.courses.length} course{results.courses.length !== 1 ? 's' : ''} queued successfully
              </p>
              <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Topic</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Course Title</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {results.courses.map((c, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 text-gray-600">{c.topic}</td>
                        <td className="px-4 py-2 text-gray-900">{c.title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {results.errors.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-red-700">
                {results.errors.length} topic{results.errors.length !== 1 ? 's' : ''} failed
              </p>
              {results.errors.map((e, i) => (
                <div key={i} className="text-sm bg-red-50 border border-red-100 rounded p-2">
                  <span className="font-medium">{e.topic}:</span> {e.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Job Status Table */}
      {jobs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Generation Queue</h3>
            <div className="flex items-center gap-3">
              {polling && (
                <span className="flex items-center gap-1.5 text-xs text-blue-600">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  Live updating
                </span>
              )}
              <Link
                to="/admin/course-generation-queue"
                className="text-sm text-optio-purple hover:underline"
              >
                Detailed view
              </Link>
            </div>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Course</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Current</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map(job => (
                  <tr key={job.id}>
                    <td className="px-4 py-2 text-gray-900 max-w-xs truncate">{job.course_title}</td>
                    <td className="px-4 py-2"><StatusBadge status={job.status} /></td>
                    <td className="px-4 py-2 text-gray-500 text-xs max-w-xs truncate">
                      {job.current_item || '--'}
                    </td>
                    <td className="px-4 py-2">
                      {job.status === 'completed' ? (
                        <span className="text-green-600 text-xs font-medium">Done</span>
                      ) : job.status === 'failed' ? (
                        <span className="text-red-600 text-xs">{job.error_message || 'Failed'}</span>
                      ) : job.items_total > 0 ? (
                        <span className="text-xs text-gray-500">{job.items_completed}/{job.items_total}</span>
                      ) : (
                        <span className="text-xs text-gray-400">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default BulkCourseGeneration
