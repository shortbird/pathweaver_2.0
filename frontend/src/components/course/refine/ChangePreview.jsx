import React, { useState, useMemo } from 'react'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'

/**
 * ChangePreview - Shows grouped before/after changes with diff highlighting
 *
 * Props:
 * - changes: Array of change objects from the API
 * - selectedChanges: Set of selected change IDs
 * - onToggleChange: (changeId: string) => void
 */
const ChangePreview = ({ changes, selectedChanges, onToggleChange }) => {
  // Group changes by project, then by lesson
  const groupedChanges = useMemo(() => {
    const groups = {}

    changes.forEach(change => {
      const projectId = change.location?.project_id || 'unknown'
      const projectTitle = change.location?.project_title || 'Unknown Project'
      const lessonId = change.location?.lesson_id
      const lessonTitle = change.location?.lesson_title

      if (!groups[projectId]) {
        groups[projectId] = {
          id: projectId,
          title: projectTitle,
          projectChanges: [],
          lessons: {},
        }
      }

      if (lessonId) {
        if (!groups[projectId].lessons[lessonId]) {
          groups[projectId].lessons[lessonId] = {
            id: lessonId,
            title: lessonTitle || 'Unknown Lesson',
            changes: [],
          }
        }
        groups[projectId].lessons[lessonId].changes.push(change)
      } else {
        groups[projectId].projectChanges.push(change)
      }
    })

    return Object.values(groups)
  }, [changes])

  return (
    <div className="space-y-4">
      {groupedChanges.map(project => (
        <ProjectGroup
          key={project.id}
          project={project}
          selectedChanges={selectedChanges}
          onToggleChange={onToggleChange}
        />
      ))}
    </div>
  )
}

/**
 * ProjectGroup - Collapsible group for a project
 */
const ProjectGroup = ({ project, selectedChanges, onToggleChange }) => {
  const [isExpanded, setIsExpanded] = useState(true)

  const allChangeIds = useMemo(() => {
    const ids = project.projectChanges.map(c => c.id)
    Object.values(project.lessons).forEach(lesson => {
      lesson.changes.forEach(c => ids.push(c.id))
    })
    return ids
  }, [project])

  const selectedCount = allChangeIds.filter(id => selectedChanges.has(id)).length

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Project header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDownIcon className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 text-gray-500" />
        )}
        <FolderIcon className="w-5 h-5 text-optio-purple" />
        <span className="font-medium text-gray-900 flex-1">{project.title}</span>
        <span className="text-sm text-gray-500">
          {selectedCount}/{allChangeIds.length} selected
        </span>
      </button>

      {/* Project content */}
      {isExpanded && (
        <div className="p-3 space-y-3">
          {/* Project-level changes */}
          {project.projectChanges.length > 0 && (
            <div className="space-y-2">
              {project.projectChanges.map(change => (
                <ChangeItem
                  key={change.id}
                  change={change}
                  isSelected={selectedChanges.has(change.id)}
                  onToggle={() => onToggleChange(change.id)}
                />
              ))}
            </div>
          )}

          {/* Lessons */}
          {Object.values(project.lessons).map(lesson => (
            <LessonGroup
              key={lesson.id}
              lesson={lesson}
              selectedChanges={selectedChanges}
              onToggleChange={onToggleChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * LessonGroup - Collapsible group for a lesson within a project
 */
const LessonGroup = ({ lesson, selectedChanges, onToggleChange }) => {
  const [isExpanded, setIsExpanded] = useState(true)

  const selectedCount = lesson.changes.filter(c => selectedChanges.has(c.id)).length

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden ml-4">
      {/* Lesson header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-2 bg-gray-50/50 hover:bg-gray-100/50 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDownIcon className="w-3 h-3 text-gray-400" />
        ) : (
          <ChevronRightIcon className="w-3 h-3 text-gray-400" />
        )}
        <DocumentTextIcon className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700 flex-1">{lesson.title}</span>
        <span className="text-xs text-gray-500">
          {selectedCount}/{lesson.changes.length}
        </span>
      </button>

      {/* Lesson content */}
      {isExpanded && (
        <div className="p-2 space-y-2">
          {lesson.changes.map(change => (
            <ChangeItem
              key={change.id}
              change={change}
              isSelected={selectedChanges.has(change.id)}
              onToggle={() => onToggleChange(change.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * ChangeItem - Individual change with before/after diff
 */
const ChangeItem = ({ change, isSelected, onToggle }) => {
  const [showDiff, setShowDiff] = useState(false)

  // Format change type for display
  const typeLabels = {
    project_title: 'Project Title',
    project_description: 'Project Description',
    project_big_idea: 'Big Idea',
    lesson_title: 'Lesson Title',
    lesson_description: 'Lesson Description',
    lesson_step: 'Lesson Step',
    task_title: 'Task Title',
    task_description: 'Task Description',
    task_xp_value: 'XP Value',
    scaffolding_younger: 'Younger Scaffolding',
    scaffolding_older: 'Older Scaffolding',
  }

  const typeLabel = typeLabels[change.type] || change.type

  // Get context info
  const contextParts = []
  if (change.location?.step_title) {
    contextParts.push(change.location.step_title)
  }
  if (change.location?.task_title) {
    contextParts.push(change.location.task_title)
  }

  return (
    <div className={`border rounded-lg transition-colors ${
      isSelected ? 'border-optio-purple bg-optio-purple/5' : 'border-gray-200'
    }`}>
      {/* Change header */}
      <div className="flex items-start gap-3 p-3">
        <button
          onClick={onToggle}
          className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
            isSelected
              ? 'border-optio-purple bg-optio-purple'
              : 'border-gray-300 hover:border-optio-purple'
          }`}
        >
          {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600">
              {typeLabel}
            </span>
            {contextParts.length > 0 && (
              <span className="text-xs text-gray-500 truncate">
                {contextParts.join(' / ')}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-700 mb-2">{change.reason}</p>

          <button
            onClick={() => setShowDiff(!showDiff)}
            className="text-xs text-optio-purple hover:text-optio-pink"
          >
            {showDiff ? 'Hide diff' : 'Show diff'}
          </button>
        </div>
      </div>

      {/* Diff view */}
      {showDiff && (
        <div className="border-t border-gray-200 p-3 space-y-3 bg-gray-50/50">
          {/* Before */}
          <div>
            <span className="text-xs font-medium text-red-600 mb-1 block">Before</span>
            <div className="text-sm text-gray-700 bg-red-50 border border-red-100 rounded p-2 font-mono whitespace-pre-wrap break-words">
              {stripHtml(change.before) || <span className="text-gray-400 italic">Empty</span>}
            </div>
          </div>

          {/* After */}
          <div>
            <span className="text-xs font-medium text-green-600 mb-1 block">After</span>
            <div className="text-sm text-gray-700 bg-green-50 border border-green-100 rounded p-2 font-mono whitespace-pre-wrap break-words">
              {stripHtml(change.after) || <span className="text-gray-400 italic">Empty</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Strip HTML tags for cleaner diff display
 */
const stripHtml = (html) => {
  if (!html) return ''
  // Simple HTML tag stripping
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default ChangePreview
