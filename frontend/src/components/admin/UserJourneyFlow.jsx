import React, { useState, useEffect, useMemo } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

/**
 * Icon Components
 */
const FlowIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)

const ClockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const CalendarIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

/**
 * Get color for event category
 */
const getCategoryColor = (category) => {
  const colors = {
    auth: { bg: 'bg-blue-500', text: 'text-blue-800', light: 'bg-blue-100' },
    quest: { bg: 'bg-green-500', text: 'text-green-800', light: 'bg-green-100' },
    badge: { bg: 'bg-yellow-500', text: 'text-yellow-800', light: 'bg-yellow-100' },
    tutor: { bg: 'bg-purple-500', text: 'text-purple-800', light: 'bg-purple-100' },
    community: { bg: 'bg-pink-500', text: 'text-pink-800', light: 'bg-pink-100' },
    navigation: { bg: 'bg-gray-500', text: 'text-gray-800', light: 'bg-gray-100' },
    interaction: { bg: 'bg-indigo-500', text: 'text-indigo-800', light: 'bg-indigo-100' },
    engagement: { bg: 'bg-teal-500', text: 'text-teal-800', light: 'bg-teal-100' },
    feature: { bg: 'bg-orange-500', text: 'text-orange-800', light: 'bg-orange-100' },
    client: { bg: 'bg-cyan-500', text: 'text-cyan-800', light: 'bg-cyan-100' }
  }
  return colors[category] || colors.navigation
}

/**
 * Format duration for display
 */
const formatDuration = (ms) => {
  if (!ms || ms <= 0) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`
  return `${(ms / 3600000).toFixed(1)}h`
}

/**
 * Format timestamp for display
 */
const formatTimestamp = (timestamp) => {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

/**
 * Format page URL or event type into readable label
 */
function formatPageLabel(pageKey) {
  if (!pageKey) return 'Unknown'

  if (pageKey.startsWith('/')) {
    // URL path - extract meaningful part
    const parts = pageKey.strip ? pageKey.strip('/').split('/') : pageKey.replace(/^\/|\/$/g, '').split('/')
    if (!parts.length || parts[0] === '') return 'Home'

    // Take last meaningful part, skip UUIDs
    let label = parts[parts.length - 1]
    if (label.length === 36 && label.includes('-')) {
      label = parts.length > 1 ? parts[parts.length - 2] : 'Detail'
    }
    if (!label || label === '') label = parts[0] || 'Home'

    return label.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  // Event type - convert snake_case to Title Case
  return pageKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

/**
 * User Journey Flow Visualization Component
 *
 * Displays user navigation patterns as an interactive flow diagram.
 * Shows how users move through the platform during sessions.
 */
const UserJourneyFlow = ({ userId, userName }) => {
  const [journeyData, setJourneyData] = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  })
  const [showSessionDetails, setShowSessionDetails] = useState(false)

  // Fetch journey data
  useEffect(() => {
    if (userId) {
      fetchJourneyData()
    }
  }, [userId, dateRange])

  const fetchJourneyData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateRange.start) params.append('start_date', dateRange.start)
      if (dateRange.end) params.append('end_date', dateRange.end)

      const response = await api.get(
        `/api/admin/analytics/user/${userId}/journey?${params}`
      )

      if (response.data.success) {
        setJourneyData(response.data.data)
        // Auto-select most recent session
        if (response.data.data.sessions?.length > 0) {
          setSelectedSession(response.data.data.sessions[0].session_id)
        }
      }
    } catch (error) {
      console.error('Error fetching journey:', error)
      toast.error('Failed to load journey data')
    } finally {
      setLoading(false)
    }
  }

  // Get selected session object
  const currentSession = useMemo(() => {
    if (!journeyData?.sessions || !selectedSession) return null
    return journeyData.sessions.find(s => s.session_id === selectedSession)
  }, [journeyData, selectedSession])

  // Aggregate flow data - combine consecutive visits to same page
  const aggregatedFlow = useMemo(() => {
    if (!currentSession?.journey_steps) return { nodes: [], edges: [] }

    const steps = currentSession.journey_steps
    const aggregated = []
    let currentGroup = null

    // Group consecutive events by page
    steps.forEach((step) => {
      const pageKey = step.page || step.event_type
      // Prefer backend-provided page_label, fallback to local formatting
      const label = step.page_label || formatPageLabel(pageKey)

      if (currentGroup && currentGroup.pageKey === pageKey) {
        // Same page - increment count and add duration
        currentGroup.count++
        currentGroup.totalDuration += step.duration_ms || 0
        currentGroup.events.push(step)
      } else {
        // New page - save previous group and start new one
        if (currentGroup) {
          aggregated.push(currentGroup)
        }
        currentGroup = {
          pageKey,
          label,
          category: step.event_category,
          count: 1,
          totalDuration: step.duration_ms || 0,
          events: [step]
        }
      }
    })

    // Don't forget the last group
    if (currentGroup) {
      aggregated.push(currentGroup)
    }

    // Limit to max 10 nodes for readability
    const maxNodes = 10
    let displayNodes = aggregated
    if (aggregated.length > maxNodes) {
      // Show first 4, middle indicator, last 5
      displayNodes = [
        ...aggregated.slice(0, 4),
        { pageKey: '...', label: `+${aggregated.length - 9} more`, category: 'navigation', count: aggregated.length - 9, isPlaceholder: true },
        ...aggregated.slice(-5)
      ]
    }

    // Build nodes and edges
    const nodes = displayNodes.map((group, index) => ({
      id: `${group.pageKey}-${index}`,
      label: group.label,
      category: group.category,
      count: group.count,
      duration: group.totalDuration,
      isPlaceholder: group.isPlaceholder
    }))

    const edges = []
    for (let i = 0; i < nodes.length - 1; i++) {
      if (!nodes[i].isPlaceholder && !nodes[i + 1].isPlaceholder) {
        edges.push({
          source: nodes[i].id,
          target: nodes[i + 1].id,
          duration_ms: nodes[i].duration
        })
      }
    }

    return { nodes, edges }
  }, [currentSession])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  if (!journeyData || journeyData.sessions?.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <FlowIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No journey data found for the selected time period.</p>
        <p className="text-sm mt-2">Try adjusting the date range or wait for more activity.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FlowIcon />
              User Journey
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {userName}'s navigation patterns across sessions
            </p>
          </div>

          {/* Date range filters */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <CalendarIcon />
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="rounded-lg border-gray-300 shadow-sm text-sm focus:border-optio-purple focus:ring-optio-purple"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="rounded-lg border-gray-300 shadow-sm text-sm focus:border-optio-purple focus:ring-optio-purple"
              />
            </div>
          </div>
        </div>

        {/* Summary stats */}
        {journeyData?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 rounded-lg p-4">
              <div className="text-2xl font-bold text-optio-purple">
                {journeyData.summary.total_sessions}
              </div>
              <div className="text-sm text-gray-600">Sessions</div>
            </div>
            <div className="bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 rounded-lg p-4">
              <div className="text-2xl font-bold text-optio-purple">
                {formatDuration(journeyData.summary.avg_session_duration_ms)}
              </div>
              <div className="text-sm text-gray-600">Avg Duration</div>
            </div>
            <div className="bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 rounded-lg p-4">
              <div className="text-lg font-bold text-optio-purple truncate" title={journeyData.summary.most_visited_pages?.[0]?.page}>
                {journeyData.summary.most_visited_pages?.[0]?.page
                  ? formatPageLabel(journeyData.summary.most_visited_pages[0].page)
                  : '-'}
              </div>
              <div className="text-sm text-gray-600">Top Page</div>
            </div>
            <div className="bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 rounded-lg p-4">
              <div className="text-2xl font-bold text-optio-purple">
                {journeyData.summary.most_visited_pages?.[0]?.visits || 0}
              </div>
              <div className="text-sm text-gray-600">Page Visits</div>
            </div>
          </div>
        )}
      </div>

      {/* Session selector and flow */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Session Flow</h3>
          <select
            value={selectedSession || ''}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="rounded-lg border-gray-300 shadow-sm text-sm focus:border-optio-purple focus:ring-optio-purple"
          >
            {journeyData.sessions.map(session => (
              <option key={session.session_id} value={session.session_id}>
                {formatTimestamp(session.start_time)} ({session.events_count} events, {formatDuration(session.duration_ms)})
              </option>
            ))}
          </select>
        </div>

        {/* Journey Flow - horizontal step display */}
        {aggregatedFlow && aggregatedFlow.nodes?.length > 0 ? (
          <div className="space-y-4">
            {/* Horizontal flow with arrows */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {aggregatedFlow.nodes.map((node, index) => {
                const colors = getCategoryColor(node.category)
                return (
                  <React.Fragment key={node.id}>
                    <div className={`flex-shrink-0 px-3 py-2 rounded-lg ${colors.light} border ${node.isPlaceholder ? 'border-dashed border-gray-300' : 'border-transparent'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full ${colors.bg} text-white text-xs font-bold flex items-center justify-center`}>
                          {node.isPlaceholder ? '...' : index + 1}
                        </span>
                        <div>
                          <div className={`text-sm font-medium ${colors.text}`}>
                            {node.label}
                          </div>
                          {!node.isPlaceholder && node.duration > 0 && (
                            <div className="text-xs text-gray-500">
                              {formatDuration(node.duration)}
                              {node.count > 1 && ` (${node.count}x)`}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {index < aggregatedFlow.nodes.length - 1 && (
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </React.Fragment>
                )
              })}
            </div>

            {/* Key Activities Summary */}
            {currentSession && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                {/* Session Duration */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <ClockIcon />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatDuration(currentSession.duration_ms)}
                    </div>
                    <div className="text-xs text-gray-500">Session Duration</div>
                  </div>
                </div>

                {/* Total Events */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <FlowIcon />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-gray-900">
                      {currentSession.events_count}
                    </div>
                    <div className="text-xs text-gray-500">Total Events</div>
                  </div>
                </div>

                {/* Unique Pages */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-gray-900">
                      {aggregatedFlow.nodes.filter(n => !n.isPlaceholder).length}
                    </div>
                    <div className="text-xs text-gray-500">Unique Pages</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 border rounded-lg bg-gray-50">
            <p>No flow data available for this session.</p>
          </div>
        )}
      </div>

      {/* Session Activity Summary - aggregated meaningful actions */}
      {currentSession && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Session Activity Summary</h3>
          <div className="space-y-3">
            {(() => {
              const steps = currentSession.journey_steps || []
              const activities = []

              // Helper to check if a name is valid (not a placeholder or UUID)
              const isValidName = (name) => {
                if (!name) return false
                const lower = name.toLowerCase()
                if (['a quest', 'a task', 'a course', 'a badge', 'quest', 'course', 'badge', 'unknown'].includes(lower)) return false
                // Check if it's a UUID
                if (/^[a-f0-9-]{36}$/i.test(name)) return false
                return true
              }

              // Helper to extract name from page_label or event data
              const getEntityName = (step, entityType) => {
                const data = step.details || {}
                const pageLabel = step.page_label || ''

                // Try explicit fields first
                if (entityType === 'quest') {
                  if (data.quest_title && isValidName(data.quest_title)) return data.quest_title
                  if (data.title && isValidName(data.title)) return data.title
                }
                if (entityType === 'task') {
                  if (data.task_title && isValidName(data.task_title)) return data.task_title
                  if (data.task_name && isValidName(data.task_name)) return data.task_name
                  if (data.title && isValidName(data.title)) return data.title
                }
                if (entityType === 'course') {
                  if (data.course_title && isValidName(data.course_title)) return data.course_title
                  if (data.title && isValidName(data.title)) return data.title
                }
                if (entityType === 'badge') {
                  if (data.badge_name && isValidName(data.badge_name)) return data.badge_name
                  if (data.name && isValidName(data.name)) return data.name
                }

                // Try page_label (enriched from backend)
                if (isValidName(pageLabel)) return pageLabel

                return null
              }

              // Track unique entities and counts
              const questsViewed = new Map() // quest_id -> {name, count, totalTime}
              const questsEnrolled = []
              const questsCreated = []
              const tasksCompleted = []
              const coursesViewed = new Map()
              const coursesStarted = []
              const badgesViewed = new Map()
              const badgesEarned = []

              // Aggregate counts
              let taskCreateCount = 0
              let taskGenerateCount = 0
              let tutorMessageCount = 0
              let evidenceUploadCount = 0

              steps.forEach(step => {
                const eventType = step.event_type || ''
                const page = step.page || ''
                const data = step.details || {}
                const pageLabel = step.page_label || ''

                // Quest activities - detect from page URL patterns
                const questMatch = page.match(/\/quests\/([a-f0-9-]+)/i)
                if (questMatch) {
                  const questId = questMatch[1]
                  const name = getEntityName(step, 'quest')
                  const existing = questsViewed.get(questId) || { name, count: 0, time: 0 }
                  if (name && !existing.name) existing.name = name
                  existing.count++
                  existing.time += step.duration_ms || 0
                  questsViewed.set(questId, existing)

                  // Check for enrollment (POST to /start or /enroll)
                  if (page.includes('/start') || page.includes('/enroll') || eventType.includes('quest_started')) {
                    if (name) questsEnrolled.push(name)
                  }
                }

                // Check for quest creation
                if (eventType.includes('quest_created') || (page.includes('/quests') && page.includes('/create'))) {
                  const name = getEntityName(step, 'quest')
                  if (name) questsCreated.push(name)
                }

                // Task activities - detect from page URL or event type
                const taskMatch = page.match(/\/tasks\/([a-f0-9-]+)/i)
                if (taskMatch || eventType.includes('task')) {
                  // Task completion
                  if (page.includes('/complete') || eventType.includes('task_complete') || eventType.includes('complete_task')) {
                    const name = getEntityName(step, 'task')
                    tasksCompleted.push(name || null)
                  }
                  // Task creation
                  if (page.includes('/create') || eventType.includes('task_create') || eventType.includes('create_task')) {
                    taskCreateCount++
                  }
                }

                // AI task generation
                if (eventType.includes('generate') || page.includes('/generate') || page.includes('/ai-tasks')) {
                  taskGenerateCount += data.count || data.tasks_count || 1
                }

                // Evidence activities
                if (page.includes('/evidence') || page.includes('/upload') || eventType.includes('evidence') || eventType.includes('upload')) {
                  evidenceUploadCount++
                }

                // Course activities - detect from page URL patterns
                const courseMatch = page.match(/\/courses\/([a-f0-9-]+)/i)
                if (courseMatch) {
                  const courseId = courseMatch[1]
                  const name = getEntityName(step, 'course')
                  const existing = coursesViewed.get(courseId) || { name, count: 0 }
                  if (name && !existing.name) existing.name = name
                  existing.count++
                  coursesViewed.set(courseId, existing)

                  // Check for course start
                  if (page.includes('/start') || page.includes('/enroll') || eventType.includes('course_started')) {
                    if (name) coursesStarted.push(name)
                  }
                }

                // Badge activities - detect from page URL patterns
                const badgeMatch = page.match(/\/badges\/([a-f0-9-]+)/i)
                if (badgeMatch) {
                  const badgeId = badgeMatch[1]
                  const name = getEntityName(step, 'badge')
                  const existing = badgesViewed.get(badgeId) || { name, count: 0 }
                  if (name && !existing.name) existing.name = name
                  existing.count++
                  badgesViewed.set(badgeId, existing)
                }

                // Badge earned
                if (eventType.includes('badge_earned') || eventType.includes('badge_awarded') || page.includes('/earn')) {
                  const name = getEntityName(step, 'badge')
                  if (name) badgesEarned.push(name)
                }

                // Tutor/AI chat activities - be more specific
                if (page.includes('/tutor') || page.includes('/ai-chat') ||
                    eventType.includes('tutor') || eventType.includes('ai_message') ||
                    (eventType.includes('chat') && !page.includes('/badges'))) {
                  tutorMessageCount++
                }
              })

              // Build activity list

              // Quests enrolled (with names)
              const uniqueEnrolled = [...new Set(questsEnrolled.filter(n => n))]
              if (uniqueEnrolled.length > 0) {
                uniqueEnrolled.forEach(name => {
                  activities.push({
                    icon: 'rocket',
                    color: 'green',
                    text: `Enrolled in "${name}"`
                  })
                })
              }

              // Quests created (with names)
              const uniqueCreated = [...new Set(questsCreated.filter(n => n))]
              if (uniqueCreated.length > 0) {
                uniqueCreated.forEach(name => {
                  activities.push({
                    icon: 'plus',
                    color: 'green',
                    text: `Created quest "${name}"`
                  })
                })
              }

              // Quests viewed - show with names if available, otherwise show count
              const questsWithNames = []
              const questsWithoutNames = []
              questsViewed.forEach((info, id) => {
                if (isValidName(info.name)) {
                  questsWithNames.push({ ...info, id })
                } else {
                  questsWithoutNames.push({ ...info, id })
                }
              })

              questsWithNames.forEach(info => {
                const timeStr = info.time > 0 ? ` for ${formatDuration(info.time)}` : ''
                activities.push({
                  icon: 'eye',
                  color: 'blue',
                  text: `Viewed "${info.name}"${timeStr}`
                })
              })

              // If we have quests without names, show a count
              if (questsWithoutNames.length > 0 && questsWithNames.length === 0) {
                const totalTime = questsWithoutNames.reduce((sum, q) => sum + (q.time || 0), 0)
                const timeStr = totalTime > 0 ? ` for ${formatDuration(totalTime)}` : ''
                activities.push({
                  icon: 'eye',
                  color: 'blue',
                  text: `Viewed ${questsWithoutNames.length} quest${questsWithoutNames.length > 1 ? 's' : ''}${timeStr}`
                })
              }

              // Tasks completed
              const namedTasks = tasksCompleted.filter(t => t !== null)
              const unnamedTaskCount = tasksCompleted.filter(t => t === null).length

              if (namedTasks.length === 1) {
                activities.push({
                  icon: 'check',
                  color: 'green',
                  text: `Completed task "${namedTasks[0]}"`
                })
              } else if (namedTasks.length > 1) {
                activities.push({
                  icon: 'check',
                  color: 'green',
                  text: `Completed ${namedTasks.length} tasks`
                })
              }
              if (unnamedTaskCount > 0 && namedTasks.length === 0) {
                activities.push({
                  icon: 'check',
                  color: 'green',
                  text: `Completed ${unnamedTaskCount} task${unnamedTaskCount > 1 ? 's' : ''}`
                })
              }

              // Tasks created
              if (taskCreateCount > 0) {
                activities.push({
                  icon: 'plus',
                  color: 'purple',
                  text: `Created ${taskCreateCount} task${taskCreateCount > 1 ? 's' : ''}`
                })
              }

              // Tasks generated (AI)
              if (taskGenerateCount > 0) {
                activities.push({
                  icon: 'sparkle',
                  color: 'purple',
                  text: `Generated ${taskGenerateCount} task${taskGenerateCount > 1 ? 's' : ''} with AI`
                })
              }

              // Evidence uploaded
              if (evidenceUploadCount > 0) {
                activities.push({
                  icon: 'upload',
                  color: 'blue',
                  text: `Uploaded ${evidenceUploadCount} piece${evidenceUploadCount > 1 ? 's' : ''} of evidence`
                })
              }

              // Courses started (with names)
              const uniqueCoursesStarted = [...new Set(coursesStarted.filter(n => n))]
              if (uniqueCoursesStarted.length > 0) {
                uniqueCoursesStarted.forEach(name => {
                  activities.push({
                    icon: 'book',
                    color: 'indigo',
                    text: `Started course "${name}"`
                  })
                })
              }

              // Courses viewed - show with names if available, otherwise show count
              const coursesWithNames = []
              const coursesWithoutNames = []
              coursesViewed.forEach((info, id) => {
                if (isValidName(info.name) && !coursesStarted.includes(info.name)) {
                  coursesWithNames.push({ ...info, id })
                } else if (!coursesStarted.includes(info.name)) {
                  coursesWithoutNames.push({ ...info, id })
                }
              })

              coursesWithNames.forEach(info => {
                activities.push({
                  icon: 'eye',
                  color: 'indigo',
                  text: `Viewed course "${info.name}"`
                })
              })

              if (coursesWithoutNames.length > 0 && coursesWithNames.length === 0) {
                activities.push({
                  icon: 'eye',
                  color: 'indigo',
                  text: `Viewed ${coursesWithoutNames.length} course${coursesWithoutNames.length > 1 ? 's' : ''}`
                })
              }

              // Badges viewed - show with names if available, otherwise show count
              const badgesWithNames = []
              const badgesWithoutNames = []
              badgesViewed.forEach((info, id) => {
                if (isValidName(info.name)) {
                  badgesWithNames.push({ ...info, id })
                } else {
                  badgesWithoutNames.push({ ...info, id })
                }
              })

              badgesWithNames.forEach(info => {
                activities.push({
                  icon: 'eye',
                  color: 'yellow',
                  text: `Viewed badge "${info.name}"`
                })
              })

              if (badgesWithoutNames.length > 0 && badgesWithNames.length === 0) {
                activities.push({
                  icon: 'eye',
                  color: 'yellow',
                  text: `Viewed ${badgesWithoutNames.length} badge${badgesWithoutNames.length > 1 ? 's' : ''}`
                })
              }

              // Badges earned (with names)
              const uniqueBadgesEarned = [...new Set(badgesEarned.filter(n => n))]
              uniqueBadgesEarned.forEach(name => {
                activities.push({
                  icon: 'star',
                  color: 'yellow',
                  text: `Earned badge "${name}"`
                })
              })

              // Tutor messages
              if (tutorMessageCount > 0) {
                activities.push({
                  icon: 'chat',
                  color: 'purple',
                  text: `Used AI tutor ${tutorMessageCount} time${tutorMessageCount > 1 ? 's' : ''}`
                })
              }

              // If no specific activities detected, show general navigation info
              if (activities.length === 0) {
                // Count unique pages visited
                const uniquePages = new Set()
                let totalTime = 0
                steps.forEach(step => {
                  if (step.page) {
                    // Normalize page URLs for counting
                    const normalizedPage = step.page.split('?')[0]
                    uniquePages.add(normalizedPage)
                  }
                  totalTime += step.duration_ms || 0
                })

                if (uniquePages.size > 0) {
                  activities.push({
                    icon: 'eye',
                    color: 'blue',
                    text: `Visited ${uniquePages.size} page${uniquePages.size > 1 ? 's' : ''}${totalTime > 0 ? ` (${formatDuration(totalTime)} total)` : ''}`
                  })
                }

                // Show what types of pages were visited
                const dashboardVisits = steps.filter(s => s.page?.includes('/dashboard')).length
                const profileVisits = steps.filter(s => s.page?.includes('/profile')).length
                const adminVisits = steps.filter(s => s.page?.includes('/admin')).length

                if (dashboardVisits > 0) {
                  activities.push({
                    icon: 'eye',
                    color: 'blue',
                    text: `Checked dashboard ${dashboardVisits} time${dashboardVisits > 1 ? 's' : ''}`
                  })
                }
                if (profileVisits > 0) {
                  activities.push({
                    icon: 'eye',
                    color: 'blue',
                    text: `Viewed profile ${profileVisits} time${profileVisits > 1 ? 's' : ''}`
                  })
                }
                if (adminVisits > 0) {
                  activities.push({
                    icon: 'eye',
                    color: 'purple',
                    text: `Used admin panel ${adminVisits} time${adminVisits > 1 ? 's' : ''}`
                  })
                }
              }

              if (activities.length === 0) {
                return (
                  <div className="text-center py-4 text-gray-500">
                    No trackable activities in this session
                  </div>
                )
              }

              const iconMap = {
                rocket: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
                plus: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                eye: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
                check: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
                sparkle: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>,
                upload: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
                book: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
                star: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>,
                chat: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              }

              const colorMap = {
                green: 'bg-green-500',
                blue: 'bg-blue-500',
                purple: 'bg-purple-500',
                indigo: 'bg-indigo-500',
                yellow: 'bg-yellow-500',
                pink: 'bg-pink-500'
              }

              return activities.map((activity, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className={`w-8 h-8 rounded-full ${colorMap[activity.color]} text-white flex items-center justify-center flex-shrink-0`}>
                    {iconMap[activity.icon]}
                  </div>
                  <span className="text-gray-900">{activity.text}</span>
                </div>
              ))
            })()}
          </div>
        </div>
      )}

      {/* Session timeline */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <button
          onClick={() => setShowSessionDetails(!showSessionDetails)}
          className="flex items-center justify-between w-full text-left"
        >
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ClockIcon />
            Session Timeline
          </h3>
          <ChevronDownIcon className={`transform transition-transform ${showSessionDetails ? 'rotate-180' : ''}`} />
        </button>

        {showSessionDetails && currentSession && (
          <div className="mt-4 space-y-3">
            {currentSession.journey_steps?.map((step, index) => {
              const colors = getCategoryColor(step.event_category)

              return (
                <div key={index} className="flex items-start gap-3">
                  {/* Step number and connector */}
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${colors.bg}`}>
                      {step.step}
                    </div>
                    {index < currentSession.journey_steps.length - 1 && (
                      <div className="w-0.5 h-8 bg-gray-200 my-1"></div>
                    )}
                  </div>

                  {/* Step details */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">
                        {step.event_type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded ${colors.light} ${colors.text}`}>
                        {step.event_category}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <span>{formatTimestamp(step.timestamp)}</span>
                      {(step.page_label || step.page) && (
                        <span className="ml-2 text-gray-400" title={step.page}>
                          {step.page_label || formatPageLabel(step.page)}
                        </span>
                      )}
                      {step.duration_ms > 0 && (
                        <span className="ml-2 text-gray-400">
                          ({formatDuration(step.duration_ms)})
                        </span>
                      )}
                    </div>
                    {/* Show details if present */}
                    {step.details && Object.keys(step.details).length > 0 && (
                      <details className="mt-2 text-xs text-gray-500">
                        <summary className="cursor-pointer hover:text-gray-700">
                          View details
                        </summary>
                        <pre className="mt-1 p-2 bg-gray-50 rounded overflow-auto text-xs">
                          {JSON.stringify(step.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Most visited pages */}
      {journeyData?.summary?.most_visited_pages?.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Most Visited Pages</h3>
          <div className="space-y-2">
            {journeyData.summary.most_visited_pages.slice(0, 5).map((page, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm text-gray-700 truncate max-w-md" title={page.page}>
                  {formatPageLabel(page.page)}
                </span>
                <span className="text-sm font-medium text-optio-purple">{page.visits} visits</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default UserJourneyFlow
