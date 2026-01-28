import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import planModeService from '../../services/planModeService'
import OutlinePanel from '../../components/plan/OutlinePanel'
import ChatPanel from '../../components/plan/ChatPanel'

/**
 * Course Plan Mode - Iterative AI course design through conversation
 *
 * Split-pane layout:
 * - Left: Course outline (editable, shows changes)
 * - Right: AI chat conversation with suggestions
 */
const CoursePlanMode = () => {
  const { sessionId } = useParams()
  const navigate = useNavigate()

  // Session state
  const [session, setSession] = useState(null)
  const [outline, setOutline] = useState(null)
  const [conversation, setConversation] = useState([])
  const [changes, setChanges] = useState([])
  const [suggestions, setSuggestions] = useState([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [approving, setApproving] = useState(false)
  const [initialPrompt, setInitialPrompt] = useState('')
  const [showStartForm, setShowStartForm] = useState(!sessionId)

  // Error helper
  const getErrorMessage = (error, fallback = 'An error occurred') => {
    const data = error?.response?.data
    if (!data) return fallback
    if (data.error?.message) return data.error.message
    if (typeof data.error === 'string') return data.error
    if (typeof data.message === 'string') return data.message
    return fallback
  }

  // Load existing session
  const loadSession = useCallback(async (id) => {
    try {
      setLoading(true)
      const response = await planModeService.getSession(id)

      if (response.data.success) {
        setSession(response.data.session)
        setOutline(response.data.outline)
        setConversation(response.data.conversation || [])

        // Get suggestions from last assistant message
        const lastAssistant = [...(response.data.conversation || [])].reverse().find(m => m.role === 'assistant')
        if (lastAssistant?.suggestions) {
          setSuggestions(lastAssistant.suggestions)
        }
      }
    } catch (error) {
      console.error('Failed to load session:', error)
      toast.error(getErrorMessage(error, 'Failed to load session'))
      navigate('/course-plan')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  // Load session on mount if sessionId provided
  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId)
    } else {
      setLoading(false)
    }
  }, [sessionId, loadSession])

  // Start new session
  const handleStartSession = async (e) => {
    e.preventDefault()

    if (!initialPrompt.trim()) {
      toast.error('Please describe the course you want to create')
      return
    }

    try {
      setSending(true)
      const response = await planModeService.startSession(initialPrompt)

      if (response.data.success) {
        const newSessionId = response.data.session.id
        setSession(response.data.session)
        setOutline(response.data.outline)
        setConversation([
          { id: 'user_init', role: 'user', content: initialPrompt, timestamp: new Date().toISOString() },
          { id: 'assistant_init', role: 'assistant', content: response.data.message, timestamp: new Date().toISOString(), suggestions: response.data.suggestions }
        ])
        setSuggestions(response.data.suggestions || [])
        setShowStartForm(false)

        // Update URL without full navigation
        navigate(`/course-plan/${newSessionId}`, { replace: true })

        toast.success('Course outline created')
      }
    } catch (error) {
      console.error('Failed to start session:', error)
      toast.error(getErrorMessage(error, 'Failed to create outline'))
    } finally {
      setSending(false)
    }
  }

  // Send refinement message
  const handleSendMessage = async (message) => {
    if (!message.trim() || !session?.id) return

    // Optimistically add user message
    const userMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    }
    setConversation(prev => [...prev, userMessage])
    setChanges([]) // Clear previous changes

    try {
      setSending(true)
      const response = await planModeService.refineOutline(session.id, message)

      if (response.data.success) {
        setOutline(response.data.outline)
        setChanges(response.data.changes || [])
        setSuggestions(response.data.suggestions || [])

        // Add assistant response
        const assistantMessage = {
          id: `assistant_${Date.now()}`,
          role: 'assistant',
          content: response.data.message,
          timestamp: new Date().toISOString(),
          changes_applied: response.data.changes?.map(c => c.id) || [],
          suggestions: response.data.suggestions
        }
        setConversation(prev => [...prev, assistantMessage])
      }
    } catch (error) {
      console.error('Failed to refine outline:', error)
      toast.error(getErrorMessage(error, 'Failed to refine outline'))

      // Remove optimistic user message on error
      setConversation(prev => prev.filter(m => m.id !== userMessage.id))
    } finally {
      setSending(false)
    }
  }

  // Approve and generate course
  const handleApprove = async () => {
    if (!session?.id) return

    try {
      setApproving(true)
      const response = await planModeService.approveAndGenerate(session.id)

      if (response.data.success) {
        toast.success('Course created! Redirecting to Course Builder...')

        // Navigate to Course Builder after a short delay
        setTimeout(() => {
          navigate(`/courses/${response.data.course_id}/edit`)
        }, 1500)
      }
    } catch (error) {
      console.error('Failed to approve:', error)
      toast.error(getErrorMessage(error, 'Failed to create course'))
    } finally {
      setApproving(false)
    }
  }

  // Abandon session
  const handleAbandon = async () => {
    if (!session?.id) return

    if (!window.confirm('Are you sure you want to discard this draft? This cannot be undone.')) {
      return
    }

    try {
      await planModeService.abandonSession(session.id)
      toast.success('Draft discarded')
      navigate('/course-plan')
    } catch (error) {
      console.error('Failed to abandon session:', error)
      toast.error(getErrorMessage(error, 'Failed to discard draft'))
    }
  }

  // Handle suggestion click
  const handleSuggestionClick = (suggestion) => {
    handleSendMessage(suggestion)
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  // Start form (no session yet)
  if (showStartForm) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="mb-8">
            <Link
              to="/admin"
              className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block"
            >
              Back to Admin
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Course Plan Mode</h1>
            <p className="mt-2 text-gray-600">
              Describe the course you want to create, and I will help you design it through conversation.
            </p>
          </div>

          {/* Start form */}
          <form onSubmit={handleStartSession} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
              What kind of course do you want to create?
            </label>
            <textarea
              id="prompt"
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              placeholder="Example: Create a math course for a student who loves piano. She is 12 years old and dislikes traditional textbook learning."
              className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
              disabled={sending}
            />
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Include details about the student's interests, age, and learning preferences.
              </p>
              <button
                type="submit"
                disabled={sending || !initialPrompt.trim()}
                className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {sending ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Creating...
                  </span>
                ) : (
                  'Create Outline'
                )}
              </button>
            </div>
          </form>

          {/* Tips */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">Tips for great courses:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>- Focus on what students will DO and MAKE, not just learn</li>
              <li>- Mention specific interests to personalize the content</li>
              <li>- Include age range for appropriate difficulty</li>
              <li>- Describe any learning challenges or preferences</li>
            </ul>
          </div>

          {/* Recent drafts */}
          <RecentDrafts />
        </div>
      </div>
    )
  }

  // Main split-pane layout
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/course-plan"
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {outline?.title || 'Course Plan Mode'}
            </h1>
            <p className="text-xs text-gray-500">
              Draft - {session?.status || 'drafting'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleAbandon}
            disabled={approving}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            Discard
          </button>
          <button
            onClick={handleApprove}
            disabled={approving || sending}
            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {approving ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Creating...
              </span>
            ) : (
              'Approve & Generate'
            )}
          </button>
        </div>
      </header>

      {/* Split pane content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Outline Panel */}
        <div className="w-1/2 border-r border-gray-200 bg-white overflow-auto">
          <OutlinePanel
            outline={outline}
            changes={changes}
            onOutlineChange={setOutline}
          />
        </div>

        {/* Right: Chat Panel */}
        <div className="w-1/2 flex flex-col bg-gray-50">
          <ChatPanel
            conversation={conversation}
            suggestions={suggestions}
            onSendMessage={handleSendMessage}
            onSuggestionClick={handleSuggestionClick}
            sending={sending}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Recent drafts component for the start form
 */
const RecentDrafts = () => {
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const loadDrafts = async () => {
      try {
        const response = await planModeService.listSessions('drafting')
        if (response.data.success) {
          setDrafts(response.data.sessions || [])
        }
      } catch (error) {
        console.error('Failed to load drafts:', error)
      } finally {
        setLoading(false)
      }
    }
    loadDrafts()
  }, [])

  if (loading || drafts.length === 0) return null

  return (
    <div className="mt-8">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Drafts</h3>
      <div className="space-y-2">
        {drafts.slice(0, 5).map(draft => (
          <button
            key={draft.id}
            onClick={() => navigate(`/course-plan/${draft.id}`)}
            className="w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-optio-purple hover:shadow-sm transition-all"
          >
            <div className="font-medium text-gray-900">{draft.title || 'Untitled'}</div>
            <div className="text-xs text-gray-500 mt-1">
              Last updated: {new Date(draft.updated_at).toLocaleDateString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default CoursePlanMode
