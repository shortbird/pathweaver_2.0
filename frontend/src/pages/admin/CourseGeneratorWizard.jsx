import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../services/api'
import toast from 'react-hot-toast'
import logger from '../../utils/logger'

// =============================================================================
// WIZARD PROGRESS COMPONENT
// =============================================================================


import WizardProgress from './courseGenerator/WizardProgress'
import Stage1Outline from './courseGenerator/Stage1Outline'
import Stage2Lessons from './courseGenerator/Stage2Lessons'
import Stage3Tasks from './courseGenerator/Stage3Tasks'
import Stage4Review from './courseGenerator/Stage4Review'
import GenerationModeModal from './courseGenerator/GenerationModeModal'
const STAGES = [
  { id: 1, label: 'Outline' },
  { id: 2, label: 'Lessons' },
  { id: 3, label: 'Tasks' },
  { id: 4, label: 'Review' }
]

const CourseGeneratorWizard = () => {
  const navigate = useNavigate()
  const { courseId: urlCourseId } = useParams()

  // State
  const [currentStage, setCurrentStage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showModeModal, setShowModeModal] = useState(false)
  const [pendingOutline, setPendingOutline] = useState(null)

  // Ref to prevent duplicate requests
  const requestInProgress = React.useRef(false)

  // Debug: Log state changes
  useEffect(() => {
  }, [currentStage, loading, regenerating, urlCourseId])

  // Stage 1 state
  const [topic, setTopic] = useState('')
  const [alternatives, setAlternatives] = useState(null)
  const [selectedOutline, setSelectedOutline] = useState(null)

  // Course state (after creation)
  const [courseId, setCourseId] = useState(urlCourseId || null)
  const [course, setCourse] = useState(null)
  const [projects, setProjects] = useState([])

  // Load existing course state if courseId provided
  useEffect(() => {
    if (urlCourseId) {
      loadCourseState(urlCourseId)
    }
  }, [urlCourseId])

  // Load course state - manageLoading=false when called from handlers that already manage loading
  const loadCourseState = async (id, manageLoading = true) => {
    try {
      if (manageLoading) setLoading(true)
      const response = await api.get(`/api/admin/curriculum/generate/${id}`)
      if (response.data.success) {
        setCourse(response.data.course)
        setProjects(response.data.projects || [])
        setCurrentStage(response.data.current_stage || 2)
        setCourseId(id)
      }
    } catch (error) {
      console.error('Failed to load course state:', error)
      toast.error('Failed to load course')
    } finally {
      if (manageLoading) setLoading(false)
    }
  }

  // Stage 1: Generate outline
  const handleGenerateOutline = async () => {
    try {
      setLoading(true)
      const response = await api.post('/api/admin/curriculum/generate/outline', { topic })
      if (response.data.success) {
        setAlternatives(response.data.alternatives)
        toast.success('Generated 3 course options')
      } else {
        toast.error(response.data.error || 'Failed to generate outline')
      }
    } catch (error) {
      console.error('Generate outline error:', error)
      toast.error('Failed to generate course outline')
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerateOutline = async () => {
    try {
      setRegenerating(true)
      const response = await api.post('/api/admin/curriculum/generate/outline', {
        topic,
        previous_outlines: alternatives
      })
      if (response.data.success) {
        setAlternatives(response.data.alternatives)
        toast.success('Generated new options')
      }
    } catch (error) {
      console.error('Regenerate outline error:', error)
      toast.error('Failed to regenerate options')
    } finally {
      setRegenerating(false)
    }
  }

  const handleSaveOutline = async (outline) => {
    // Store the outline and show mode selection modal
    setPendingOutline(outline)
    setShowModeModal(true)
  }

  const handleQueueGeneration = async (autoPublish) => {
    if (!pendingOutline) return

    try {
      setLoading(true)

      // First, save the outline to create the draft course
      const response = await api.post('/api/admin/curriculum/generate/outline/select', { outline: pendingOutline })

      if (response.data.success) {
        const newCourseId = response.data.course_id

        // Queue the course for background generation
        const queueResponse = await api.post(`/api/admin/curriculum/generate/${newCourseId}/queue`, {
          auto_publish: autoPublish
        })

        if (queueResponse.data.success) {
          toast.success('Course queued for generation')
          setShowModeModal(false)
          setPendingOutline(null)

          // Navigate to the queue dashboard
          navigate('/admin/course-generation-queue')
        }
      }
    } catch (error) {
      console.error('Queue generation error:', error)
      toast.error(error.response?.data?.error || 'Failed to queue course')
    } finally {
      setLoading(false)
    }
  }

  const handleManualGeneration = async () => {
    if (!pendingOutline) return

    try {
      setLoading(true)
      const response = await api.post('/api/admin/curriculum/generate/outline/select', { outline: pendingOutline })
      if (response.data.success) {
        setCourseId(response.data.course_id)
        setCourse({ title: pendingOutline.title, description: pendingOutline.description })
        setProjects(pendingOutline.projects.map((p, i) => ({
          id: `temp-${i}`,
          title: p.title,
          description: p.description,
          sequence_order: p.order || i + 1,
          lessons: []
        })))
        setCurrentStage(2)
        toast.success('Course draft created')

        // Close modal
        setShowModeModal(false)
        setPendingOutline(null)

        // Update URL
        navigate(`/admin/generate-course/${response.data.course_id}`, { replace: true })

        // Reload to get actual IDs
        await loadCourseState(response.data.course_id, false) // Don't manage loading - we handle it
      }
    } catch (error) {
      console.error('Save outline error:', error)
      toast.error('Failed to save course outline')
    } finally {
      setLoading(false)
    }
  }

  // Stage 2: Generate lessons
  const handleGenerateLessons = async () => {
    // Prevent duplicate requests
    if (requestInProgress.current) {
      logger.debug('[Wizard] Request already in progress, ignoring')
      return
    }

    logger.debug('[Wizard] handleGenerateLessons called, courseId:', courseId)
    requestInProgress.current = true
    setLoading(true)

    try {
      logger.debug('[Wizard] Loading set to true')
      const response = await api.post(`/api/admin/curriculum/generate/${courseId}/lessons`, {})
      logger.debug('[Wizard] Lessons response:', response.data)
      if (response.data.success) {
        await loadCourseState(courseId, false) // Don't manage loading - we handle it
        toast.success('Lessons generated')
      } else {
        console.error('[Wizard] Lessons generation failed:', response.data.error)
        toast.error(response.data.error || 'Failed to generate lessons')
      }
    } catch (error) {
      console.error('[Wizard] Generate lessons error:', error)
      console.error('[Wizard] Error response:', error.response?.data)
      toast.error('Failed to generate lessons')
    } finally {
      logger.debug('[Wizard] Setting loading to false')
      requestInProgress.current = false
      setLoading(false)
    }
  }

  const handleRegenerateLessons = async (questId, lessonId) => {
    try {
      const response = await api.post(`/api/admin/curriculum/generate/${courseId}/regenerate-lesson/${lessonId}`, {
        quest_id: questId
      })
      if (response.data.success) {
        toast.success('Lesson alternatives generated')
        // TODO: Show alternatives modal
      }
    } catch (error) {
      console.error('Regenerate lesson error:', error)
      toast.error('Failed to regenerate lesson')
    }
  }

  // Stage 3: Generate tasks
  const handleGenerateTasks = async () => {
    // Prevent duplicate requests
    if (requestInProgress.current) {
      logger.debug('[Wizard] Tasks - Request already in progress, ignoring')
      return
    }

    logger.debug('[Wizard] handleGenerateTasks called, courseId:', courseId)
    requestInProgress.current = true
    setLoading(true)

    try {
      logger.debug('[Wizard] Tasks - Loading set to true')
      const response = await api.post(`/api/admin/curriculum/generate/${courseId}/tasks`, {})
      logger.debug('[Wizard] Tasks response:', response.data)
      if (response.data.success) {
        await loadCourseState(courseId, false) // Don't manage loading - we handle it
        toast.success('Tasks generated')
      } else {
        console.error('[Wizard] Tasks generation failed:', response.data.error)
        toast.error(response.data.error || 'Failed to generate tasks')
      }
    } catch (error) {
      console.error('[Wizard] Generate tasks error:', error)
      console.error('[Wizard] Tasks error response:', error.response?.data)
      toast.error('Failed to generate tasks')
    } finally {
      logger.debug('[Wizard] Tasks - Setting loading to false')
      requestInProgress.current = false
      setLoading(false)
    }
  }

  const handleRegenerateTasks = async (questId, lessonId) => {
    try {
      const response = await api.post(`/api/admin/curriculum/generate/${courseId}/regenerate-tasks/${lessonId}`, {
        quest_id: questId
      })
      if (response.data.success) {
        toast.success('Task alternatives generated')
        // TODO: Show alternatives modal
      }
    } catch (error) {
      console.error('Regenerate tasks error:', error)
      toast.error('Failed to regenerate tasks')
    }
  }

  // Stage 4: Publish
  const handlePublish = async () => {
    try {
      setLoading(true)
      const response = await api.post(`/api/admin/curriculum/generate/${courseId}/finalize`, {})
      if (response.data.success) {
        toast.success('Course published!')
        navigate(`/courses/${courseId}/edit`)
      }
    } catch (error) {
      console.error('Publish error:', error)
      toast.error('Failed to publish course')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveDraft = () => {
    toast.success('Draft saved')
    navigate('/admin/curriculum-upload')
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/admin/curriculum-upload')}
          className="text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Curriculum Upload
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Course Generator</h1>
        <p className="text-gray-500">Create hands-on, action-oriented courses with AI</p>
      </div>

      {/* Progress */}
      <WizardProgress currentStage={currentStage} stages={STAGES} />

      {/* Stage Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {currentStage === 1 && (
          <Stage1Outline
            topic={topic}
            setTopic={setTopic}
            alternatives={alternatives}
            selectedOutline={selectedOutline}
            setSelectedOutline={setSelectedOutline}
            onGenerate={handleGenerateOutline}
            onRegenerate={handleRegenerateOutline}
            onNext={handleSaveOutline}
            loading={loading}
            regenerating={regenerating}
          />
        )}

        {currentStage === 2 && (
          <Stage2Lessons
            courseId={courseId}
            projects={projects}
            onGenerateLessons={handleGenerateLessons}
            onRegenerateLessons={handleRegenerateLessons}
            onNext={() => setCurrentStage(3)}
            loading={loading}
          />
        )}

        {currentStage === 3 && (
          <Stage3Tasks
            courseId={courseId}
            projects={projects}
            onGenerateTasks={handleGenerateTasks}
            onRegenerateTasks={handleRegenerateTasks}
            onNext={() => setCurrentStage(4)}
            loading={loading}
          />
        )}

        {currentStage === 4 && (
          <Stage4Review
            course={course}
            projects={projects}
            onPublish={handlePublish}
            onSaveDraft={handleSaveDraft}
            loading={loading}
          />
        )}
      </div>

      {/* Generation Mode Modal */}
      <GenerationModeModal
        isOpen={showModeModal}
        onClose={() => {
          setShowModeModal(false)
          setPendingOutline(null)
        }}
        onQueueGeneration={handleQueueGeneration}
        onManualGeneration={handleManualGeneration}
        courseTitle={pendingOutline?.title || ''}
        projectCount={pendingOutline?.projects?.length || 0}
        loading={loading}
      />
    </div>
  )
}

export default CourseGeneratorWizard
