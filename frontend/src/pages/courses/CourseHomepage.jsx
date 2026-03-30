import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import {
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  PlayCircleIcon,
  BookOpenIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  QuestionMarkCircleIcon,
  PlusIcon,
  ClipboardDocumentListIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid, ExclamationCircleIcon } from '@heroicons/react/24/solid'
import { useCourseHomepage } from '../../hooks/api/useCourseData'
import CurriculumView from '../../components/curriculum/CurriculumView'
import { endCourse, enrollInCourse, unenrollFromCourse } from '../../services/courseService'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { OnboardingProvider, useOnboarding } from '../../contexts/OnboardingContext'
import CourseOnboardingSteps from '../../components/onboarding/CourseOnboardingSteps'
import { getPillarData } from '../../utils/pillarMappings'
import api from '../../services/api'

const QuestPersonalizationWizard = lazy(() => import('../../components/quests/QuestPersonalizationWizard'))

const stripHtml = (html) => {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}

/**
 * ExpandableQuestItem - Sidebar quest item with XP and task progress
 */
const ExpandableQuestItem = ({
  quest,
  index,
  isSelected,
  onSelectQuest,
  isNextStep,
}) => {
  const isCompleted = quest.progress?.is_completed
  const canComplete = quest.progress?.can_complete
  const hasXP = quest.progress?.total_xp > 0
  const xpText = hasXP
    ? `${quest.progress.earned_xp || 0}/${quest.progress.total_xp} XP`
    : null

  const progressPercent = quest.progress?.percentage || 0

  // Show incomplete required tasks warning
  const hasIncompleteRequired = quest.progress?.total_required_tasks > 0 &&
    quest.progress?.completed_required_tasks < quest.progress?.total_required_tasks

  return (
    <div className="mb-2">
      {/* Quest Header */}
      <div
        onClick={() => onSelectQuest(quest)}
        className={`relative overflow-hidden flex items-center gap-2 p-3 rounded-lg transition-all cursor-pointer ${
          isSelected
            ? 'bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 border-2 border-optio-purple'
            : isNextStep && !isCompleted && !canComplete
              ? 'bg-white border border-gray-200 border-l-[3px] border-l-optio-purple hover:border-optio-purple/50'
              : 'bg-white border border-gray-200 hover:border-optio-purple/50'
        }`}
      >
        {/* Progress bar background */}
        {progressPercent > 0 && !isCompleted && !canComplete && (
          <div
            className="absolute inset-y-0 left-0 bg-optio-purple/15 transition-all duration-300"
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        )}

        {/* Order Number */}
        <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-optio-purple/10 text-optio-purple rounded-full text-xs font-medium">
          {index + 1}
        </span>

        {/* Quest Title and Info */}
        <div className="flex-1 min-w-0 relative">
          <h4 className="font-medium text-gray-900 text-sm leading-snug truncate">
            {quest.title || 'Untitled Project'}
          </h4>
          {/* XP and Progress on same row */}
          {(xpText || (hasXP && !isCompleted && !canComplete)) && (
            <div className="flex justify-between items-center">
              {xpText && (
                <span className="text-xs text-gray-500">{xpText}</span>
              )}
              {hasXP && !isCompleted && !canComplete && (
                <span className="text-xs text-gray-500">
                  {Math.round(Math.min(progressPercent, 100))}%
                </span>
              )}
            </div>
          )}
          {/* Task progress */}
          {quest.progress?.total_tasks > 0 && !isCompleted && !canComplete && (
            <span className="text-xs text-gray-400">
              {quest.progress.completed_tasks}/{quest.progress.total_tasks} tasks
            </span>
          )}
          {/* Show required tasks warning if XP met but required tasks incomplete */}
          {hasIncompleteRequired && progressPercent >= 100 && !isCompleted && (
            <span className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
              <ExclamationCircleIcon className="w-3 h-3" />
              {quest.progress?.completed_required_tasks}/{quest.progress?.total_required_tasks} required
            </span>
          )}
        </div>

        {/* Completion Status */}
        {(isCompleted || canComplete) ? (
          <CheckCircleSolid className="w-5 h-5 text-green-500 flex-shrink-0" />
        ) : null}
      </div>
    </div>
  )
}

/**
 * CourseOverview - Default content when no quest is selected
 */
const CourseOverview = ({ course, quests, progress, onSelectQuest }) => {
  return (
    <div className="p-6">
      {/* Hero Image */}
      {course.cover_image_url && (
        <div className="mb-6 -mx-6 -mt-6">
          <img
            src={course.cover_image_url}
            alt={course.title}
            className="w-full h-48 sm:h-64 object-cover"
          />
        </div>
      )}

      {/* Course Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{course.title}</h1>
        {course.description && (
          <p className="text-gray-600">{stripHtml(course.description)}</p>
        )}
      </div>

      {/* Progress Card */}
      <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-2xl font-bold text-gray-900">
              {progress.earned_xp || 0}
            </span>
            <span className="text-sm text-gray-500 ml-1">/ {progress.total_xp || 0} XP</span>
          </div>
          <div className="text-right">
            {progress.percentage >= 100 ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-green-600">
                <CheckCircleSolid className="w-5 h-5" />
                Course Complete
              </span>
            ) : (
              <span className="text-sm text-gray-600">
                {progress.completed_quests} / {progress.total_quests} Projects
              </span>
            )}
          </div>
        </div>
        <div className="w-full bg-white/60 rounded-full h-2.5 mb-3">
          <div
            className={`h-2.5 rounded-full transition-all ${
              progress.percentage >= 100
                ? 'bg-green-500'
                : 'bg-gradient-to-r from-optio-purple to-optio-pink'
            }`}
            style={{ width: `${Math.min(100, progress.percentage)}%` }}
          />
        </div>
        <p className="text-sm text-gray-500">
          Complete tasks in each project to earn XP and finish the course.
        </p>
      </div>

      {/* Projects Grid */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Projects</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {quests.map((quest, index) => {
          const isCompleted = quest.progress?.is_completed

          return (
            <div
              key={quest.id}
              onClick={() => onSelectQuest(quest)}
              className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-optio-purple/50 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3">
                {/* Order Number */}
                <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-optio-purple/10 text-optio-purple rounded-full text-sm font-semibold">
                  {index + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 mb-1">{quest.title}</h3>
                  {quest.description && (
                    <p className="text-sm text-gray-500 line-clamp-2">
                      {stripHtml(quest.description)}
                    </p>
                  )}

                  {/* Progress */}
                  <div className="mt-3 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {(isCompleted || quest.progress?.can_complete) ? (
                        <span className="inline-flex items-center gap-1 text-sm text-green-600 font-medium">
                          <CheckCircleSolid className="w-4 h-4" />
                          Complete
                        </span>
                      ) : quest.progress?.total_xp > 0 ? (
                        <>
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full"
                              style={{ width: `${quest.progress.percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">
                            {quest.progress.earned_xp || 0}/{quest.progress.total_xp} XP
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-gray-500">Not started</span>
                      )}
                    </div>
                    {/* Task count */}
                    {quest.progress?.total_tasks > 0 && !isCompleted && (
                      <span className="text-xs text-gray-400">
                        {quest.progress.completed_tasks}/{quest.progress.total_tasks} tasks completed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * CourseTaskItem - Expandable task card with evidence and completion
 */
const CourseTaskItem = ({ task, onComplete, onRemove }) => {
  const [expanded, setExpanded] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [evidenceBlocks, setEvidenceBlocks] = useState([])
  const [evidenceLoaded, setEvidenceLoaded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [textEvidence, setTextEvidence] = useState('')
  const fileInputRef = useRef(null)
  const pillar = getPillarData(task.pillar)
  const xp = task.xp_value || task.xp_amount || 0

  // Lazy-load evidence when expanded
  useEffect(() => {
    if (expanded && !evidenceLoaded && task.id) {
      (async () => {
        try {
          const { data } = await api.get(`/api/evidence/documents/${task.id}`)
          setEvidenceBlocks(data.blocks || [])
        } catch { /* no evidence yet */ }
        finally { setEvidenceLoaded(true) }
      })()
    }
  }, [expanded, task.id])

  const handleComplete = async () => {
    const blocks = [...evidenceBlocks]
    if (textEvidence.trim()) {
      blocks.push({ type: 'text', content: { text: textEvidence.trim() }, order_index: blocks.length })
    }
    if (blocks.length === 0) {
      toast.error('Please add at least one piece of evidence before completing this task.')
      return
    }
    setCompleting(true)
    try {
      await api.post(`/api/evidence/documents/${task.id}`, {
        blocks: blocks.map(b => ({ ...b, type: b.type || b.block_type })),
        status: 'completed',
      })
      onComplete(task.id, xp)
      setTextEvidence('')
    } catch { toast.error('Failed to complete task') }
    finally { setCompleting(false) }
  }

  const handleFileSelect = async (e) => {
    const file = e.target?.files?.[0]
    if (!file) return
    const maxSize = file.type.startsWith('video/') ? 50 * 1024 * 1024 : file.type.startsWith('image/') ? 10 * 1024 * 1024 : 25 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error(`File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB)`)
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post(`/api/evidence/documents/${task.id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const blockType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document'
      const newBlock = { type: blockType, content: { url: data.url, filename: data.filename || file.name }, order_index: evidenceBlocks.length }
      const updated = [...evidenceBlocks, newBlock]
      await api.post(`/api/evidence/documents/${task.id}`, { blocks: updated.map(b => ({ ...b, type: b.type || b.block_type })), status: 'draft' })
      setEvidenceBlocks(updated)
    } catch { toast.error('Upload failed') }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  const handleAddText = async () => {
    if (!textEvidence.trim()) return
    const newBlock = { type: 'text', content: { text: textEvidence.trim() }, order_index: evidenceBlocks.length }
    const updated = [...evidenceBlocks, newBlock]
    try {
      await api.post(`/api/evidence/documents/${task.id}`, { blocks: updated.map(b => ({ ...b, type: b.type || b.block_type })), status: 'draft' })
      setEvidenceBlocks(updated)
      setTextEvidence('')
    } catch { toast.error('Failed to save note') }
  }

  const handleDeleteBlock = async (idx) => {
    const updated = evidenceBlocks.filter((_, i) => i !== idx)
    try {
      await api.post(`/api/evidence/documents/${task.id}`, { blocks: updated.map(b => ({ ...b, type: b.type || b.block_type })), status: 'draft' })
      setEvidenceBlocks(updated)
    } catch { /* error */ }
  }

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-shadow ${expanded ? 'shadow-md border-gray-300' : 'border-gray-200 hover:border-gray-300'} border-l-4 ${pillar?.border || 'border-l-gray-300'}`}>
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3 p-4 text-left">
        {task.is_completed ? (
          <CheckCircleSolid className="w-5 h-5 text-green-500 flex-shrink-0" />
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h4 className={`font-medium text-sm ${task.is_completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
            {task.title}
          </h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded ${pillar?.bg || 'bg-gray-100'} ${pillar?.text || 'text-gray-600'}`}>
              {pillar?.name || task.pillar}
            </span>
            <span className="text-xs text-gray-500">{xp} XP</span>
            {evidenceBlocks.length > 0 && (
              <span className="text-xs text-gray-400">{evidenceBlocks.length} evidence</span>
            )}
          </div>
        </div>
        {task.is_required && (
          <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex-shrink-0">Required</span>
        )}
        {expanded ? (
          <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {task.description && (
            <p className="text-sm text-gray-600">{task.description}</p>
          )}

          {/* Evidence blocks */}
          {evidenceBlocks.length > 0 && (
            <div className="space-y-2">
              {evidenceBlocks.map((block, idx) => {
                const bType = block.type || block.block_type
                const content = block.content || {}
                return (
                  <div key={block.id || idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm">
                    <span className="text-gray-400">
                      {bType === 'image' ? '📷' : bType === 'video' ? '🎬' : bType === 'link' ? '🔗' : bType === 'document' ? '📄' : '📝'}
                    </span>
                    <span className="flex-1 text-gray-600 truncate">
                      {content.caption || content.filename || content.title || content.text?.slice(0, 60) || content.url || 'Evidence'}
                    </span>
                    {!task.is_completed && (
                      <button onClick={() => handleDeleteBlock(idx)} className="text-gray-400 hover:text-red-500 p-0.5">
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Evidence input */}
          {!task.is_completed && (
            <div className="space-y-2">
              <textarea
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm resize-none focus:ring-1 focus:ring-optio-purple focus:border-optio-purple"
                placeholder="What did you do? Describe your work..."
                rows={2}
                value={textEvidence}
                onChange={(e) => setTextEvidence(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-optio-purple bg-optio-purple/5 border border-optio-purple/20 rounded-lg hover:bg-optio-purple/10 transition-colors disabled:opacity-50"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    {uploading ? 'Uploading...' : 'Attach File'}
                  </button>
                  {textEvidence.trim() && (
                    <button
                      onClick={handleAddText}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-optio-purple rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Save Note
                    </button>
                  )}
                </div>
                <button
                  onClick={handleComplete}
                  disabled={completing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
                >
                  <CheckCircleIcon className="w-4 h-4" />
                  {completing ? 'Saving...' : 'Complete Task'}
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx" onChange={handleFileSelect} className="hidden" />
            </div>
          )}

          {/* Completed status */}
          {task.is_completed && task.completed_at && (
            <p className="text-xs text-green-600">
              Completed {new Date(task.completed_at).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * ProjectView - Task-first project content view
 */
const ProjectView = ({ quest, onSelectLesson, fallbackImageUrl, questTasks, questTasksLoading, onTaskComplete, onAcceptSuggestion, onWizardComplete, refetchCourse }) => {
  const isCompleted = quest.progress?.is_completed
  const hasLessons = quest.lessons && quest.lessons.length > 0
  const headerImage = quest.header_image_url || quest.image_url || fallbackImageUrl
  const totalXp = quest.progress?.total_xp || 0
  const earnedXp = quest.progress?.earned_xp || 0
  const [lessonsExpanded, setLessonsExpanded] = useState(false)
  const [addedSuggestionIds, setAddedSuggestionIds] = useState(new Set())
  const [showWizard, setShowWizard] = useState(false)
  const [localEarnedXp, setLocalEarnedXp] = useState(earnedXp)

  // Reset local XP when quest changes
  useEffect(() => {
    setLocalEarnedXp(quest.progress?.earned_xp || 0)
    setAddedSuggestionIds(new Set())
    setLessonsExpanded(false)
  }, [quest.id])

  const tasks = questTasks || []
  const userTaskTitles = new Set(tasks.map(t => t.title))
  const suggestedTasks = (quest.suggested_tasks || []).filter(
    t => !addedSuggestionIds.has(t.id) && !userTaskTitles.has(t.title)
  )
  const pct = totalXp > 0 ? Math.round((localEarnedXp / totalXp) * 100) : 0

  const handleLocalTaskComplete = (taskId, xpValue) => {
    setLocalEarnedXp(prev => prev + xpValue)
    onTaskComplete(quest.id, taskId, xpValue)
    toast.success(`+${xpValue} XP earned!`)
  }

  const handleAddSuggestion = async (suggestion) => {
    setAddedSuggestionIds(prev => new Set(prev).add(suggestion.id))
    await onAcceptSuggestion(quest.id, suggestion)
    toast.success('Task added!')
  }

  return (
    <div className="p-6">
      {/* Header Image */}
      {headerImage && (
        <div className="mb-6 -mx-6 -mt-6">
          <img
            src={headerImage}
            alt={quest.title}
            className="w-full h-48 object-cover"
          />
        </div>
      )}

      {/* Project Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{quest.title}</h1>
        {quest.description && (
          <p className="text-gray-600">{stripHtml(quest.description)}</p>
        )}
      </div>

      {/* XP Progress Bar */}
      {totalXp > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600 font-medium">
              {localEarnedXp} / {totalXp} XP earned
            </span>
            {(isCompleted || quest.progress?.can_complete) ? (
              <span className="inline-flex items-center gap-1 font-semibold text-green-600">
                <CheckCircleSolid className="w-5 h-5" />
                Complete
              </span>
            ) : (
              <span className="font-semibold text-gray-900">
                {Math.min(pct, 100)}%
              </span>
            )}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                isCompleted || quest.progress?.can_complete
                  ? 'bg-green-500'
                  : 'bg-gradient-to-r from-optio-purple to-optio-pink'
              }`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>
      )}

      {/* How it works callout */}
      {!isCompleted && totalXp > 0 && (
        <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-lg mb-6 border border-optio-purple/10">
          <SparklesIcon className="w-5 h-5 text-optio-purple flex-shrink-0" />
          <p className="text-sm text-gray-600">
            Complete tasks to earn XP. Reach <span className="font-semibold text-gray-900">{totalXp} XP</span> to complete this project.
          </p>
        </div>
      )}

      {/* Your Tasks */}
      <div className="mb-6" data-onboarding="project-tasks">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Your Tasks
        </h2>
        {questTasksLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : tasks.length > 0 ? (
          <div className="space-y-2">
            {tasks.map(task => (
              <CourseTaskItem
                key={task.id}
                task={task}
                onComplete={handleLocalTaskComplete}
                onRemove={() => {}}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <ClipboardDocumentListIcon className="w-6 h-6 text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-700">No tasks yet</p>
              <p className="text-xs text-gray-500">Add suggested tasks below or visit the project page to create your own.</p>
            </div>
          </div>
        )}
      </div>

      {/* Suggested Tasks */}
      {suggestedTasks.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Suggested Tasks
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {suggestedTasks.map(suggestion => {
              const sPillar = getPillarData(suggestion.pillar)
              return (
                <div
                  key={suggestion.id}
                  className={`flex-shrink-0 w-52 bg-white border border-gray-200 rounded-xl p-3 border-l-4 ${sPillar?.border || 'border-l-gray-300'}`}
                >
                  <h4 className="text-sm font-medium text-gray-900 line-clamp-2 mb-2">{suggestion.title}</h4>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${sPillar?.bg || 'bg-gray-100'} ${sPillar?.text || 'text-gray-600'}`}>
                        {sPillar?.name || suggestion.pillar}
                      </span>
                      <span className="text-xs text-gray-500">{suggestion.xp_value || 0} XP</span>
                    </div>
                    <button
                      onClick={() => handleAddSuggestion(suggestion)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-optio-purple bg-optio-purple/5 rounded-lg hover:bg-optio-purple/10 transition-colors"
                    >
                      <PlusIcon className="w-3 h-3" />
                      Add
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Create Your Own Tasks */}
      {!isCompleted && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Create Your Own
          </h2>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-sm text-gray-600">
              Write a custom task or use AI to generate personalized ideas.
            </p>
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-optio-purple bg-optio-purple/5 border border-optio-purple/20 rounded-lg hover:bg-optio-purple/10 transition-colors flex-shrink-0 ml-3"
            >
              <SparklesIcon className="w-4 h-4" />
              Create Tasks
            </button>
          </div>
        </div>
      )}

      {/* Personalization Wizard Modal */}
      {showWizard && (
        <Suspense fallback={
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-8 flex flex-col items-center gap-4 shadow-2xl">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-optio-purple border-t-transparent" />
              <p className="text-lg font-semibold text-gray-700">Loading task creator...</p>
            </div>
          </div>
        }>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              <QuestPersonalizationWizard
                questId={quest.id}
                questTitle={quest.title}
                onComplete={() => {
                  setShowWizard(false)
                  onWizardComplete(quest.id)
                }}
                onCancel={() => setShowWizard(false)}
              />
            </div>
          </div>
        </Suspense>
      )}

      {/* Lessons (collapsible, secondary) */}
      {hasLessons && (
        <div className="border-t border-gray-200 pt-4">
          <button
            onClick={() => setLessonsExpanded(!lessonsExpanded)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 hover:text-gray-700 transition-colors"
          >
            {lessonsExpanded ? (
              <ChevronDownIcon className="w-4 h-4" />
            ) : (
              <ChevronRightIcon className="w-4 h-4" />
            )}
            Lessons ({quest.lessons.length})
          </button>
          {lessonsExpanded && (
            <div className="space-y-2">
              {quest.lessons.map((lesson, idx) => {
                const isLessonCompleted = lesson.progress?.status === 'completed'
                return (
                  <div
                    key={lesson.id}
                    onClick={() => onSelectLesson(quest, lesson)}
                    className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-optio-purple/50 hover:shadow-sm transition-all"
                  >
                    <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-optio-purple/10 text-optio-purple rounded-full text-xs font-medium">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 text-sm">{lesson.title}</h3>
                      {lesson.estimated_duration_minutes && (
                        <span className="text-xs text-gray-500">{lesson.estimated_duration_minutes} min</span>
                      )}
                    </div>
                    {isLessonCompleted ? (
                      <CheckCircleSolid className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <PlayCircleIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * CourseHomepage - Main course homepage with sidebar navigation
 */
const CourseHomepageInner = () => {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const { user } = useAuth()
  const { isActive: isOnboarding, currentStep: onboardingStep, startOnboarding } = useOnboarding()

  // Fetch course data
  const { data, isLoading, error, refetch } = useCourseHomepage(courseId)

  // State for sidebar navigation
  const [selectedQuest, setSelectedQuest] = useState(null)
  const [selectedLesson, setSelectedLesson] = useState(null)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [saveProgressFn, setSaveProgressFn] = useState(null)
  const [initialStepIndex, setInitialStepIndex] = useState(null)
  const [isEnding, setIsEnding] = useState(false)
  const [isEnrolling, setIsEnrolling] = useState(false)
  const [isUnenrolling, setIsUnenrolling] = useState(false)
  const [incompleteProjectsModal, setIncompleteProjectsModal] = useState(null)

  // Task state management
  const [questTasks, setQuestTasks] = useState({}) // questId -> task[]
  const [questTasksLoading, setQuestTasksLoading] = useState(false)
  const sessionRefs = useRef({}) // questId -> session_id

  // Fetch user tasks when a quest is selected
  const fetchQuestTasks = useCallback(async (questId) => {
    if (questTasks[questId]) return // Already loaded
    setQuestTasksLoading(true)
    try {
      const { data } = await api.get(`/api/quests/${questId}`)
      const q = data.quest || data
      setQuestTasks(prev => ({ ...prev, [questId]: q.quest_tasks || [] }))
    } catch {
      setQuestTasks(prev => ({ ...prev, [questId]: [] }))
    } finally {
      setQuestTasksLoading(false)
    }
  }, [questTasks])

  // Handle task completion (optimistic update)
  const handleTaskComplete = useCallback((questId, taskId, xpValue) => {
    setQuestTasks(prev => ({
      ...prev,
      [questId]: (prev[questId] || []).map(t =>
        t.id === taskId ? { ...t, is_completed: true, completed_at: new Date().toISOString() } : t
      )
    }))
    // Refetch course data after a short delay for server sync
    setTimeout(() => refetch(), 1500)
  }, [refetch])

  // Handle accepting a suggested task
  const handleAcceptSuggestion = useCallback(async (questId, suggestion) => {
    try {
      // Ensure personalization session
      if (!sessionRefs.current[questId]) {
        const { data } = await api.post(`/api/quests/${questId}/start-personalization`, {})
        sessionRefs.current[questId] = data.session_id
      }
      const { data } = await api.post(`/api/quests/${questId}/personalization/accept-task`, {
        session_id: sessionRefs.current[questId],
        task: suggestion,
      })
      const newTask = data.task || {
        id: data.task_id || `temp-${Date.now()}`,
        title: suggestion.title,
        description: suggestion.description || '',
        pillar: suggestion.pillar || 'stem',
        xp_value: suggestion.xp_value || 50,
        is_completed: false,
        is_required: false,
      }
      setQuestTasks(prev => ({
        ...prev,
        [questId]: [...(prev[questId] || []), newTask]
      }))
    } catch (err) {
      toast.error('Failed to add task')
      throw err
    }
  }, [])

  // Handle wizard completion -- refetch tasks for the quest
  const handleWizardComplete = useCallback(async (questId) => {
    try {
      const { data } = await api.get(`/api/quests/${questId}`)
      const q = data.quest || data
      setQuestTasks(prev => ({ ...prev, [questId]: q.quest_tasks || [] }))
    } catch { /* error */ }
    refetch()
  }, [refetch])

  // Handle enroll in course (for creators testing their course)
  const handleEnroll = async () => {
    try {
      setIsEnrolling(true)
      await enrollInCourse(courseId)
      toast.success('Enrolled in course!')
      // Refetch course data to update enrollment status
      refetch()
    } catch (error) {
      console.error('Failed to enroll:', error)
      toast.error(error.response?.data?.error || 'Failed to enroll in course')
    } finally {
      setIsEnrolling(false)
    }
  }

  // Handle end course (preserves progress)
  const handleEndCourse = async () => {
    if (!window.confirm('Are you sure you want to end this course? Your progress and XP will be preserved.')) {
      return
    }

    try {
      setIsEnding(true)
      const result = await endCourse(courseId)
      toast.success(result.message || 'Course completed!')
      navigate('/')
    } catch (error) {
      console.error('Failed to end course:', error)

      // Check if this is an INCOMPLETE_PROJECTS error
      const responseData = error.response?.data
      if (responseData?.reason === 'INCOMPLETE_PROJECTS' && responseData?.incomplete_projects) {
        // Show the incomplete projects modal
        setIncompleteProjectsModal({
          message: responseData.message,
          projects: responseData.incomplete_projects
        })
      } else {
        toast.error(responseData?.error || 'Failed to end course')
      }
    } finally {
      setIsEnding(false)
    }
  }

  // Handle unenroll from course (deletes all progress)
  const handleUnenroll = async () => {
    if (!window.confirm('Are you sure you want to unenroll from this course? This will DELETE all your progress, tasks, and XP from this course. This cannot be undone.')) {
      return
    }

    try {
      setIsUnenrolling(true)
      await unenrollFromCourse(courseId)
      toast.success('Successfully unenrolled from course')
      navigate('/courses')
    } catch (error) {
      console.error('Failed to unenroll:', error)
      toast.error(error.response?.data?.error || 'Failed to unenroll from course')
    } finally {
      setIsUnenrolling(false)
    }
  }

  // Navigate to a project with incomplete requirements
  const handleGoToProject = (questId) => {
    const quest = data?.quests?.find(q => q.id === questId)
    if (quest) {
      setIncompleteProjectsModal(null)
      setSelectedQuest(quest)
      setSelectedLesson(null)
      setSearchParams({ quest: questId })
      fetchQuestTasks(quest.id)
    }
  }

  // Restore state from URL params (for back button support)
  useEffect(() => {
    if (!data?.quests) return

    const questId = searchParams.get('quest')
    const lessonId = searchParams.get('lesson')
    const step = searchParams.get('step')

    if (questId) {
      const quest = data.quests.find(q => q.id === questId)
      if (quest) {
        setSelectedQuest(quest)
        fetchQuestTasks(quest.id)

        if (lessonId && quest.lessons) {
          const lesson = quest.lessons.find(l => l.id === lessonId)
          if (lesson) {
            setSelectedLesson(lesson)
            // Set initial step if coming back from task page
            if (step !== null && step !== undefined) {
              setInitialStepIndex(parseInt(step, 10))
            }
          }
        }
      }
    }
  }, [data?.quests, searchParams])

  // Also check location.state for return navigation from quest page
  useEffect(() => {
    if (!data?.quests || !location.state?.returnToLesson) return

    const { questId, lessonId, stepIndex } = location.state.returnToLesson
    const quest = data.quests.find(q => q.id === questId)

    if (quest) {
      setSelectedQuest(quest)
      fetchQuestTasks(quest.id)

      if (lessonId && quest.lessons) {
        const lesson = quest.lessons.find(l => l.id === lessonId)
        if (lesson) {
          setSelectedLesson(lesson)
          if (stepIndex !== null && stepIndex !== undefined) {
            setInitialStepIndex(stepIndex)
          }
        }
      }
    }

    // Clear the location state after restoring
    window.history.replaceState({}, document.title)
  }, [data?.quests, location.state])

  // Trigger onboarding walkthrough for first-time users
  useEffect(() => {
    if (!data?.quests?.length || !user) return
    if (user.tutorial_completed_at) return
    if (searchParams.get('quest')) return // Don't start if deep-linking
    startOnboarding()
  }, [data?.quests, user?.tutorial_completed_at])

  // Manage sidebar state during onboarding steps
  useEffect(() => {
    if (!isOnboarding || !data?.quests?.length) return

    // Steps 0-3: no quest selected (centered cards + quest-item highlight)
    if (onboardingStep < 4) {
      setSelectedQuest(null)
      setSelectedLesson(null)
      return
    }

    // Step 4+: select first quest to show the task-first project view
    const firstQuest = data.quests[0]
    if (firstQuest) {
      setSelectedQuest(firstQuest)
      setSelectedLesson(null)
      fetchQuestTasks(firstQuest.id)
    }
  }, [isOnboarding, onboardingStep, data?.quests])

  // Auto-select next-step quest on load (only if no URL state and not onboarding)
  useEffect(() => {
    if (isOnboarding) return
    if (user && !user.tutorial_completed_at) return // Onboarding about to start
    if (data?.quests?.length > 0 && !selectedQuest && !searchParams.get('quest')) {
      if (next_step) {
        const quest = data.quests.find(q => q.id === next_step.quest_id)
        if (quest) {
          setSelectedQuest(quest)
          fetchQuestTasks(quest.id)
          setSearchParams({ quest: quest.id })
        }
      }
    }
  }, [data?.quests, searchParams])

  // Track current step index from CurriculumView for back navigation
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  const handleSelectQuest = (quest) => {
    setSelectedQuest(quest)
    setSelectedLesson(null)
    setIsMobileSidebarOpen(false)
    setInitialStepIndex(null)
    // Update URL params
    setSearchParams({ quest: quest.id })
    // Fetch tasks for this quest
    fetchQuestTasks(quest.id)
  }

  const handleSelectLesson = (quest, lesson) => {
    setSelectedQuest(quest)
    setSelectedLesson(lesson)
    setIsMobileSidebarOpen(false)
    setInitialStepIndex(null)
    // Update URL params
    setSearchParams({ quest: quest.id, lesson: lesson.id })
  }

  const handleTaskClick = (task) => {
    // Store return info in sessionStorage for back navigation
    // Navigation is handled by the Link component in CurriculumView
    const returnInfo = {
      pathname: `/courses/${courseId}`,
      search: `?quest=${selectedQuest?.id}&lesson=${selectedLesson?.id}&step=${currentStepIndex}`,
      lessonTitle: selectedLesson?.title,
      questTitle: selectedQuest?.title
    }
    sessionStorage.setItem('courseTaskReturnInfo', JSON.stringify(returnInfo))
  }

  const handleBackToOverview = () => {
    setSelectedQuest(null)
    setSelectedLesson(null)
    setInitialStepIndex(null)
    // Clear URL params
    setSearchParams({})
  }

  const handleCloseLesson = () => {
    if (hasUnsavedChanges) {
      const shouldSave = window.confirm(
        'You have unsaved progress. Would you like to save before leaving?\n\nClick OK to save and close, or Cancel to discard changes.'
      )
      if (shouldSave && saveProgressFn) {
        saveProgressFn()
      }
    }
    if (isFullscreen) setIsFullscreen(false)
    setSelectedLesson(null)
    setHasUnsavedChanges(false)
    setInitialStepIndex(null)
    // Update URL to just show quest
    if (selectedQuest) {
      setSearchParams({ quest: selectedQuest.id })
    }
  }

  // Callback to track step changes from CurriculumView
  const handleStepChange = (stepIndex) => {
    setCurrentStepIndex(stepIndex)
    // Update URL with current step for bookmarking/sharing
    if (selectedQuest && selectedLesson) {
      setSearchParams({ quest: selectedQuest.id, lesson: selectedLesson.id, step: stepIndex.toString() })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  if (error) {
    const errorMessage = error?.response?.data?.error || error?.message || 'Unknown error'
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Unable to load course</h2>
          <p className="text-gray-600 mb-2">Please try again later</p>
          <p className="text-sm text-gray-400 mb-4 font-mono">{errorMessage}</p>
          <button
            onClick={() => navigate('/courses')}
            className="px-4 py-2 bg-optio-purple text-white rounded-lg hover:opacity-90"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  const { course, quests, progress, enrollment, next_step } = data
  // User is enrolled if they have a formal enrollment with 'active' status
  const isEnrolled = enrollment?.id != null && enrollment?.status === 'active'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto px-2 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            {/* Left: Back + Title (clickable together) */}
            <button
              onClick={() => navigate('/courses')}
              className="flex items-center gap-2 sm:gap-3 p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors min-w-0"
            >
              <ChevronLeftIcon className="w-5 h-5 flex-shrink-0" />
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                {course.title}
              </h1>
            </button>

            {/* Right: Progress */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="hidden sm:flex items-center gap-2">
                {progress.percentage >= 100 ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-600">
                    <CheckCircleSolid className="w-5 h-5" />
                    Complete
                  </span>
                ) : (
                  <>
                    <span className="text-sm text-gray-600">
                      {progress.earned_xp || 0}/{progress.total_xp || 0} XP
                    </span>
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full"
                        style={{ width: `${progress.percentage}%` }}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Enroll, End Course, or Unenroll Buttons */}
              {isEnrolled ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      localStorage.removeItem('optio-onboarding-step')
                      startOnboarding()
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-optio-purple hover:text-optio-purple/80 hover:bg-optio-purple/5 border border-optio-purple/30 rounded-lg transition-colors text-sm font-medium"
                    title="View course tutorial"
                  >
                    <QuestionMarkCircleIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Tutorial</span>
                  </button>
<button
                    onClick={handleUnenroll}
                    disabled={isUnenrolling || isEnding}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                    title="Unenroll from course (deletes all progress)"
                  >
                    <XMarkIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">{isUnenrolling ? 'Unenrolling...' : 'Unenroll'}</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleEnroll}
                  disabled={isEnrolling}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                  title="Enroll in this course"
                >
                  <PlayCircleIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">{isEnrolling ? 'Enrolling...' : 'Enroll'}</span>
                </button>
              )}

              {/* Mobile Sidebar Toggle */}
              <button
                onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                className="lg:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              >
                <BookOpenIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-screen-2xl mx-auto px-2 sm:px-4 lg:px-6 py-4">
        <div className="flex gap-6">
          {/* Sidebar */}
          <div
            className={`
              lg:block lg:w-80 flex-shrink-0
              ${isMobileSidebarOpen ? 'fixed inset-0 z-40 bg-white p-4 overflow-y-auto' : 'hidden'}
            `}
          >
            {/* Mobile close overlay */}
            {isMobileSidebarOpen && (
              <div
                className="fixed inset-0 bg-black/50 -z-10 lg:hidden"
                onClick={() => setIsMobileSidebarOpen(false)}
              />
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-4 h-full lg:max-h-[calc(100vh-150px)] lg:overflow-y-auto">
              {/* Course Progress Summary - Clickable to go to overview */}
              <button
                data-onboarding="course-progress"
                onClick={() => {
                  setSelectedQuest(null)
                  setSelectedLesson(null)
                }}
                className="w-full mb-4 p-3 bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-lg hover:from-optio-purple/10 hover:to-optio-pink/10 transition-colors text-left"
              >
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Course Progress</span>
                  {progress.percentage >= 100 ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-green-600">
                      <CheckCircleSolid className="w-4 h-4" />
                      Complete
                    </span>
                  ) : (
                    <span className="font-semibold">{Math.round(progress.percentage)}%</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mb-2">
                  {progress.earned_xp || 0} / {progress.total_xp || 0} XP
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      progress.percentage >= 100
                        ? 'bg-green-500'
                        : 'bg-gradient-to-r from-optio-purple to-optio-pink'
                    }`}
                    style={{ width: `${Math.min(100, progress.percentage)}%` }}
                  />
                </div>
              </button>

              {/* Projects List */}
              <div data-onboarding="quest-item-0">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Projects ({quests.length})
              </h2>

              {quests.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No projects in this course yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {quests.map((quest, index) => (
                    <ExpandableQuestItem
                      key={quest.id}
                      quest={quest}
                      index={index}
                      isSelected={selectedQuest?.id === quest.id}
                      onSelectQuest={handleSelectQuest}
                      isNextStep={next_step?.quest_id === quest.id}
                    />
                  ))}
                </div>
              )}
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-gray-200 min-h-[600px]">
              {selectedLesson ? (
                /* Lesson View - Embed CurriculumView */
                <div className={`h-full ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : ''}`}>
                  <div className="p-4 border-b border-gray-200 flex items-center gap-2">
                    <button
                      onClick={handleCloseLesson}
                      className="flex items-center gap-2 p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <ChevronLeftIcon className="w-5 h-5" />
                      <span className="text-sm text-gray-500 truncate">
                        {selectedQuest?.title}
                      </span>
                    </button>
                    <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="font-medium text-gray-900 truncate flex-1">
                      {selectedLesson.title}
                    </span>
                    {/* Unsaved indicator */}
                    {hasUnsavedChanges && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                        Unsaved
                      </span>
                    )}
                    {/* Fullscreen Toggle */}
                    <button
                      onClick={() => setIsFullscreen(!isFullscreen)}
                      className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                      title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                    >
                      {isFullscreen ? (
                        <ArrowsPointingInIcon className="w-5 h-5" />
                      ) : (
                        <ArrowsPointingOutIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  <div className={isFullscreen ? 'h-[calc(100vh-57px)] overflow-y-auto' : ''}>
                    <CurriculumView
                      questId={selectedQuest?.id}
                      lessons={selectedQuest?.lessons}
                      isAdmin={false}
                      initialLessonId={selectedLesson.id}
                      initialStepIndex={initialStepIndex}
                      embedded={true}
                      questXpThreshold={selectedQuest?.xp_threshold || selectedQuest?.progress?.total_xp || 0}
                      onUnsavedChangesChange={setHasUnsavedChanges}
                      onSaveProgress={setSaveProgressFn}
                      onTaskClick={handleTaskClick}
                      onStepChange={handleStepChange}
                      onLessonSelect={(lesson) => {
                        setSelectedLesson(lesson)
                        setSearchParams({ quest: selectedQuest.id, lesson: lesson.id })
                      }}
                    />
                  </div>
                </div>
              ) : selectedQuest ? (
                /* Task-First Project View */
                <ProjectView
                  quest={selectedQuest}
                  onSelectLesson={handleSelectLesson}
                  fallbackImageUrl={course?.cover_image_url}
                  questTasks={questTasks[selectedQuest.id]}
                  questTasksLoading={questTasksLoading}
                  onTaskComplete={handleTaskComplete}
                  onAcceptSuggestion={handleAcceptSuggestion}
                  onWizardComplete={handleWizardComplete}
                  refetchCourse={refetch}
                />
              ) : (
                /* Course Overview (default) */
                <CourseOverview
                  course={course}
                  quests={quests}
                  progress={progress}
                  onSelectQuest={handleSelectQuest}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Onboarding Walkthrough */}
      <CourseOnboardingSteps />

      {/* Incomplete Projects Modal */}
      {incompleteProjectsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-amber-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <ExclamationTriangleIcon className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Cannot Complete Course Yet</h2>
                  <p className="text-sm text-gray-600">Some projects still need work</p>
                </div>
              </div>
              <button
                onClick={() => setIncompleteProjectsModal(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-4 overflow-y-auto max-h-[50vh]">
              <p className="text-gray-600 mb-4">
                To complete this course, all required projects must meet their completion requirements:
              </p>
              <ul className="text-sm text-gray-600 mb-4 list-disc list-inside">
                <li>Reach the XP goal (if set)</li>
                <li>Complete all required tasks</li>
              </ul>

              <h3 className="font-medium text-gray-900 mb-3">
                Incomplete Projects ({incompleteProjectsModal.projects?.length || 0})
              </h3>

              <div className="space-y-3">
                {incompleteProjectsModal.projects?.map((project) => (
                  <div
                    key={project.quest_id}
                    className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 truncate">{project.title}</h4>
                        <div className="mt-2 space-y-1">
                          {/* XP Status */}
                          {project.requirements?.required_xp > 0 && (
                            <div className={`flex items-center gap-2 text-sm ${
                              project.requirements?.xp_met ? 'text-green-600' : 'text-amber-600'
                            }`}>
                              {project.requirements?.xp_met ? (
                                <CheckCircleSolid className="w-4 h-4" />
                              ) : (
                                <ExclamationCircleIcon className="w-4 h-4" />
                              )}
                              <span>
                                XP: {project.requirements?.earned_xp || 0}/{project.requirements?.required_xp || 0}
                              </span>
                            </div>
                          )}
                          {/* Required Tasks Status */}
                          {project.requirements?.total_required_tasks > 0 && (
                            <div className={`flex items-center gap-2 text-sm ${
                              project.requirements?.required_tasks_met ? 'text-green-600' : 'text-amber-600'
                            }`}>
                              {project.requirements?.required_tasks_met ? (
                                <CheckCircleSolid className="w-4 h-4" />
                              ) : (
                                <ExclamationCircleIcon className="w-4 h-4" />
                              )}
                              <span>
                                Required tasks: {project.requirements?.completed_required_tasks || 0}/{project.requirements?.total_required_tasks || 0}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleGoToProject(project.quest_id)}
                        className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-optio-purple hover:text-white hover:bg-optio-purple border border-optio-purple rounded-lg transition-colors"
                      >
                        Go to Project
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setIncompleteProjectsModal(null)}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Got it, I'll finish my projects
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const CourseHomepage = () => (
  <OnboardingProvider>
    <CourseHomepageInner />
  </OnboardingProvider>
)

export default CourseHomepage
