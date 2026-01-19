import React, { useState, useEffect, useRef } from 'react'
import {
  XMarkIcon,
  SparklesIcon,
  ArrowRightIcon,
  CheckIcon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import ClarifyingQuestion from './ClarifyingQuestion'
import ChangePreview from './ChangePreview'
import PromptUpdatePreview from './PromptUpdatePreview'

/**
 * AI Refine Modal - Conversational interface for course-wide refinements
 *
 * Phases:
 * 1. idle - Initial state with category selection and input
 * 2. analyzing - AI analyzing request
 * 3. clarifying - Showing clarifying questions
 * 4. generating - Generating change preview
 * 5. preview - Showing before/after changes
 * 6. applying - Applying selected changes
 * 7. done - Changes applied, optional prompt update
 */
const AIRefineModal = ({
  isOpen,
  onClose,
  courseId,
  courseName,
  onRefineComplete,
}) => {
  // Phase management
  const [phase, setPhase] = useState('idle')

  // Session state
  const [sessionId, setSessionId] = useState(null)
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [userRequest, setUserRequest] = useState('')

  // Analysis/questions state
  const [analysis, setAnalysis] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})

  // Preview state
  const [preview, setPreview] = useState(null)
  const [selectedChanges, setSelectedChanges] = useState(new Set())

  // Apply state
  const [applyResult, setApplyResult] = useState(null)

  // Prompt update state
  const [showPromptUpdate, setShowPromptUpdate] = useState(false)
  const [promptModifier, setPromptModifier] = useState(null)
  const [generatePromptUpdate, setGeneratePromptUpdate] = useState(false)

  // Error state
  const [error, setError] = useState(null)

  // Abort controller
  const abortRef = useRef(false)

  // Fetch categories on mount
  useEffect(() => {
    if (isOpen) {
      fetchCategories()
    }
  }, [isOpen])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      resetState()
    }
  }, [isOpen])

  const resetState = () => {
    setPhase('idle')
    setSessionId(null)
    setSelectedCategory(null)
    setUserRequest('')
    setAnalysis(null)
    setQuestions([])
    setAnswers({})
    setPreview(null)
    setSelectedChanges(new Set())
    setApplyResult(null)
    setShowPromptUpdate(false)
    setPromptModifier(null)
    setGeneratePromptUpdate(false)
    setError(null)
    abortRef.current = false
  }

  const fetchCategories = async () => {
    try {
      const response = await api.get('/api/admin/curriculum/refine/categories')
      if (response.data.success) {
        setCategories(response.data.categories)
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err)
      // Non-critical, categories are just suggestions
    }
  }

  // Start refinement session
  const handleStartSession = async () => {
    if (!userRequest.trim()) {
      toast.error('Please describe the refinement you want to make')
      return
    }

    setPhase('analyzing')
    setError(null)
    abortRef.current = false

    try {
      const response = await api.post(`/api/admin/curriculum/refine/${courseId}/start`, {
        request: userRequest.trim(),
      })

      if (abortRef.current) return

      if (response.data.success) {
        setSessionId(response.data.session_id)
        setAnalysis(response.data.analysis)
        setQuestions(response.data.questions || [])
        setPhase('clarifying')
      } else {
        throw new Error(response.data.error || 'Failed to start session')
      }
    } catch (err) {
      if (!abortRef.current) {
        setError(err.response?.data?.error || err.message)
        setPhase('idle')
        toast.error('Failed to analyze request')
      }
    }
  }

  // Handle answer selection
  const handleAnswerSelect = (questionId, answer) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer,
    }))
  }

  // Submit answers and generate preview
  const handleSubmitAnswers = async () => {
    // Validate all questions answered
    const unanswered = questions.filter(q => !answers[q.id])
    if (unanswered.length > 0) {
      toast.error('Please answer all questions before continuing')
      return
    }

    setPhase('generating')
    setError(null)

    try {
      const formattedAnswers = questions.map(q => ({
        question_id: q.id,
        question: q.question,
        answer: answers[q.id],
      }))

      const response = await api.post(`/api/admin/curriculum/refine/${courseId}/answer`, {
        session_id: sessionId,
        answers: formattedAnswers,
      })

      if (abortRef.current) return

      if (response.data.success) {
        setPreview(response.data.preview)
        // Select all changes by default
        const allChangeIds = new Set(response.data.preview.changes.map(c => c.id))
        setSelectedChanges(allChangeIds)
        setPhase('preview')
      } else {
        throw new Error(response.data.error || 'Failed to generate preview')
      }
    } catch (err) {
      if (!abortRef.current) {
        setError(err.response?.data?.error || err.message)
        setPhase('clarifying')
        toast.error('Failed to generate preview')
      }
    }
  }

  // Apply selected changes
  const handleApplyChanges = async () => {
    if (selectedChanges.size === 0) {
      toast.error('Please select at least one change to apply')
      return
    }

    setPhase('applying')
    setError(null)

    try {
      const response = await api.post(`/api/admin/curriculum/refine/${courseId}/apply`, {
        session_id: sessionId,
        change_ids: Array.from(selectedChanges),
      })

      if (abortRef.current) return

      if (response.data.success) {
        setApplyResult(response.data)
        setPhase('done')

        if (response.data.applied_count > 0) {
          toast.success(`Applied ${response.data.applied_count} changes`)
          onRefineComplete?.()
        }

        if (response.data.failed_count > 0) {
          toast.error(`${response.data.failed_count} changes failed`)
        }
      } else {
        throw new Error(response.data.error || 'Failed to apply changes')
      }
    } catch (err) {
      if (!abortRef.current) {
        setError(err.response?.data?.error || err.message)
        setPhase('preview')
        toast.error('Failed to apply changes')
      }
    }
  }

  // Generate prompt update
  const handleGeneratePromptUpdate = async () => {
    setShowPromptUpdate(true)
    setError(null)

    try {
      const response = await api.post(`/api/admin/curriculum/refine/${courseId}/generate-prompt-update`, {
        session_id: sessionId,
      })

      if (response.data.success) {
        setPromptModifier(response.data)
      } else {
        throw new Error(response.data.error || 'Failed to generate prompt update')
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message)
      toast.error('Failed to generate prompt update')
    }
  }

  // Cancel session
  const handleCancel = async () => {
    abortRef.current = true

    if (sessionId) {
      try {
        await api.delete(`/api/admin/curriculum/refine/${courseId}/session/${sessionId}`)
      } catch (err) {
        // Ignore errors on cancel
      }
    }

    onClose()
  }

  // Toggle change selection
  const handleToggleChange = (changeId) => {
    setSelectedChanges(prev => {
      const newSet = new Set(prev)
      if (newSet.has(changeId)) {
        newSet.delete(changeId)
      } else {
        newSet.add(changeId)
      }
      return newSet
    })
  }

  // Select/deselect all changes
  const handleSelectAll = () => {
    if (preview) {
      const allIds = new Set(preview.changes.map(c => c.id))
      setSelectedChanges(allIds)
    }
  }

  const handleDeselectAll = () => {
    setSelectedChanges(new Set())
  }

  // Copy prompt modifier to clipboard
  const handleCopyModifier = () => {
    if (promptModifier?.modifier?.instruction) {
      navigator.clipboard.writeText(promptModifier.modifier.instruction)
      toast.success('Copied to clipboard')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 w-full h-full bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink p-4 sm:p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SparklesIcon className="w-6 h-6" />
            <div>
              <h2 className="text-lg sm:text-2xl font-bold">AI Refine</h2>
              <p className="text-sm text-white/80">{courseName}</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="text-white hover:bg-white/20 p-1.5 sm:p-2 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Error display */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Phase: Idle - Input form */}
          {phase === 'idle' && (
            <div className="space-y-6">
              <p className="text-gray-600">
                Describe the refinement you want to make across the entire course.
                The AI will ask clarifying questions and show you a preview before making any changes.
              </p>

              {/* Category suggestions */}
              {categories.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Suggested refinements
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setSelectedCategory(cat.id)
                          if (cat.examples && cat.examples.length > 0) {
                            setUserRequest(cat.examples[0])
                          }
                        }}
                        className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                          selectedCategory === cat.id
                            ? 'border-optio-purple bg-optio-purple/10 text-optio-purple'
                            : 'border-gray-300 text-gray-700 hover:border-optio-purple'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Request input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Describe your refinement
                </label>
                <textarea
                  value={userRequest}
                  onChange={(e) => setUserRequest(e.target.value)}
                  placeholder="E.g., Make all task descriptions more action-oriented and specific about what students will create"
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
                />
              </div>

              {/* Example refinements */}
              {selectedCategory && categories.find(c => c.id === selectedCategory)?.examples?.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Example refinements
                  </label>
                  <div className="space-y-2">
                    {categories.find(c => c.id === selectedCategory).examples.map((example, idx) => (
                      <button
                        key={idx}
                        onClick={() => setUserRequest(example)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Phase: Analyzing */}
          {phase === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 border-4 border-optio-purple border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-600">Analyzing your request...</p>
            </div>
          )}

          {/* Phase: Clarifying - Show questions */}
          {phase === 'clarifying' && (
            <div className="space-y-6">
              {/* Analysis summary */}
              {analysis && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-2">Understanding your request</h3>
                  <p className="text-sm text-gray-700">{analysis.understood_request}</p>
                  {analysis.potential_impact && (
                    <p className="text-sm text-gray-500 mt-2">
                      Estimated scope: {analysis.potential_impact}
                    </p>
                  )}
                </div>
              )}

              {/* Clarifying questions */}
              <div>
                <h3 className="font-medium text-gray-900 mb-4">A few questions to refine your request</h3>
                <div className="space-y-4">
                  {questions.map(question => (
                    <ClarifyingQuestion
                      key={question.id}
                      question={question}
                      selectedAnswer={answers[question.id]}
                      onSelect={(answer) => handleAnswerSelect(question.id, answer)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Phase: Generating */}
          {phase === 'generating' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 border-4 border-optio-purple border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-600">Generating change preview...</p>
            </div>
          )}

          {/* Phase: Preview - Show changes */}
          {phase === 'preview' && preview && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">Change Summary</h3>
                <p className="text-sm text-gray-700 mb-3">{preview.summary.description}</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="text-gray-600">
                    <strong>{preview.summary.total_changes}</strong> total changes
                  </span>
                  <span className="text-gray-600">
                    <strong>{preview.summary.projects_affected}</strong> projects
                  </span>
                  <span className="text-gray-600">
                    <strong>{preview.summary.lessons_affected}</strong> lessons
                  </span>
                  <span className="text-gray-600">
                    <strong>{preview.summary.tasks_affected}</strong> tasks
                  </span>
                </div>
              </div>

              {/* Selection controls */}
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  {selectedChanges.size} of {preview.changes.length} changes selected
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSelectAll}
                    className="px-3 py-1.5 text-sm text-optio-purple hover:bg-optio-purple/10 rounded-lg transition-colors"
                  >
                    Select all
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Deselect all
                  </button>
                </div>
              </div>

              {/* Change list */}
              <ChangePreview
                changes={preview.changes}
                selectedChanges={selectedChanges}
                onToggleChange={handleToggleChange}
              />

              {/* Save preference checkbox */}
              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={generatePromptUpdate}
                  onChange={(e) => setGeneratePromptUpdate(e.target.checked)}
                  className="w-4 h-4 text-optio-purple focus:ring-optio-purple border-gray-300 rounded"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    Generate prompt update for future courses
                  </span>
                  <p className="text-xs text-gray-500">
                    Creates reusable instructions to apply this preference to all future course generations
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Phase: Applying */}
          {phase === 'applying' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 border-4 border-optio-purple border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-600">Applying changes...</p>
            </div>
          )}

          {/* Phase: Done */}
          {phase === 'done' && (
            <div className="space-y-6">
              {/* Result summary */}
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckIcon className="w-5 h-5 text-green-600" />
                  <h3 className="font-medium text-green-900">Changes Applied</h3>
                </div>
                <p className="text-sm text-green-700">
                  Successfully applied {applyResult?.applied_count || 0} changes to the course.
                </p>
                {applyResult?.failed_count > 0 && (
                  <p className="text-sm text-red-600 mt-2">
                    {applyResult.failed_count} changes failed to apply.
                  </p>
                )}
              </div>

              {/* Prompt update section */}
              {generatePromptUpdate && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-gray-900">Prompt Update</h3>
                    {!showPromptUpdate && !promptModifier && (
                      <button
                        onClick={handleGeneratePromptUpdate}
                        className="px-3 py-1.5 text-sm bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2"
                      >
                        <SparklesIcon className="w-4 h-4" />
                        Generate
                      </button>
                    )}
                  </div>

                  {showPromptUpdate && !promptModifier && (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-8 h-8 border-3 border-optio-purple border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}

                  {promptModifier && (
                    <PromptUpdatePreview
                      modifier={promptModifier}
                      onCopy={handleCopyModifier}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 flex justify-between gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {phase === 'done' ? 'Close' : 'Cancel'}
          </button>

          <div className="flex gap-3">
            {phase === 'idle' && (
              <button
                onClick={handleStartSession}
                disabled={!userRequest.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Continue
                <ArrowRightIcon className="w-4 h-4" />
              </button>
            )}

            {phase === 'clarifying' && (
              <button
                onClick={handleSubmitAnswers}
                disabled={questions.some(q => !answers[q.id])}
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Generate Preview
                <ArrowRightIcon className="w-4 h-4" />
              </button>
            )}

            {phase === 'preview' && (
              <button
                onClick={handleApplyChanges}
                disabled={selectedChanges.size === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Apply {selectedChanges.size} Changes
                <CheckIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AIRefineModal
