import React, { useState, useEffect } from 'react'
import {
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  PencilIcon,
  TrophyIcon,
  XMarkIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { getPillarData, PILLAR_KEYS } from '../../utils/pillarMappings'

// Task card component for displaying linked tasks
const TaskCard = ({ task, onClick, onUnlink }) => {
  const pillarData = getPillarData(task.pillar)

  return (
    <div
      onClick={() => onClick(task)}
      className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:border-optio-purple/30 hover:shadow-sm transition-all group bg-white cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-gray-900 text-sm truncate">{task.title}</h4>
        {task.description && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{task.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span
            className="px-2 py-0.5 text-xs font-semibold rounded"
            style={{ backgroundColor: `${pillarData.color}20`, color: pillarData.color }}
          >
            {pillarData.name}
          </span>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <TrophyIcon className="w-3 h-3" />
            {task.xp_value} XP
          </span>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onUnlink(task.id)
        }}
        className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
        title="Remove from lesson"
      >
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

// Task edit modal
const TaskEditModal = ({ task, onSave, onClose, saving }) => {
  const [formData, setFormData] = useState({
    title: task.title || '',
    description: task.description || '',
    pillar: task.pillar || 'stem',
    xp_value: task.xp_value || 100,
    evidence_prompt: task.evidence_prompt || ''
  })
  const pillarData = getPillarData(formData.pillar)

  const handleSave = () => {
    if (!formData.title?.trim()) {
      toast.error('Please enter a task title')
      return
    }
    onSave(formData)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Edit Task</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              placeholder="Task title..."
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
              placeholder="Describe what students should do..."
            />
          </div>

          {/* Pillar and XP */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pillar</label>
              <select
                value={formData.pillar}
                onChange={(e) => setFormData({ ...formData, pillar: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              >
                {PILLAR_KEYS.map(key => (
                  <option key={key} value={key}>{getPillarData(key).name}</option>
                ))}
              </select>
              {/* Pillar preview */}
              <div className="mt-2">
                <span
                  className="inline-block px-2 py-0.5 text-xs font-semibold rounded"
                  style={{ backgroundColor: `${pillarData.color}20`, color: pillarData.color }}
                >
                  {pillarData.name}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">XP Value</label>
              <input
                type="number"
                min="25"
                max="500"
                step="25"
                value={formData.xp_value}
                onChange={(e) => setFormData({ ...formData, xp_value: parseInt(e.target.value) || 100 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              />
            </div>
          </div>

          {/* Evidence Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Evidence Prompt
              <span className="text-gray-400 font-normal ml-1">(optional)</span>
            </label>
            <textarea
              value={formData.evidence_prompt}
              onChange={(e) => setFormData({ ...formData, evidence_prompt: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
              placeholder="How should students show their work?"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !formData.title?.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Manual task creation form
const ManualTaskForm = ({ onSave, onCancel, initialTask = null }) => {
  const [task, setTask] = useState(initialTask || {
    title: '',
    description: '',
    pillar: 'stem',
    xp_value: 100,
    evidence_prompt: ''
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!task.title?.trim()) {
      toast.error('Please enter a task title')
      return
    }
    setSaving(true)
    try {
      await onSave(task)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Task Title</label>
        <input
          type="text"
          value={task.title}
          onChange={(e) => setTask({ ...task, title: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          placeholder="Enter task title..."
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={task.description}
          onChange={(e) => setTask({ ...task, description: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
          rows="2"
          placeholder="Describe what students should do..."
        />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">Pillar</label>
          <select
            value={task.pillar}
            onChange={(e) => setTask({ ...task, pillar: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          >
            {PILLAR_KEYS.map(key => (
              <option key={key} value={key}>{getPillarData(key).name}</option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <label className="block text-xs font-medium text-gray-700 mb-1">XP Value</label>
          <input
            type="number"
            min="50"
            max="300"
            step="25"
            value={task.xp_value}
            onChange={(e) => setTask({ ...task, xp_value: parseInt(e.target.value) || 100 })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Evidence Prompt (optional)</label>
        <input
          type="text"
          value={task.evidence_prompt}
          onChange={(e) => setTask({ ...task, evidence_prompt: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          placeholder="How should students show their work?"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !task.title?.trim()}
          className="px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : (initialTask ? 'Update Task' : 'Create Task')}
        </button>
      </div>
    </div>
  )
}

// AI Task generation preview
const AITaskPreview = ({ task, onAccept, onReject, onEdit }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editedTask, setEditedTask] = useState(task)
  const pillarData = getPillarData(task.pillar)

  if (isEditing) {
    return (
      <ManualTaskForm
        initialTask={editedTask}
        onSave={(updated) => {
          onEdit(task.id, updated)
          setEditedTask(updated)
          setIsEditing(false)
        }}
        onCancel={() => {
          setEditedTask(task)
          setIsEditing(false)
        }}
      />
    )
  }

  return (
    <div className="border border-gray-200 bg-white rounded-lg p-3 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 text-sm mb-1">{task.title}</h4>
          <p className="text-xs text-gray-600 mb-2 line-clamp-2">{task.description}</p>
          <div className="flex items-center gap-2">
            <span
              className="px-2 py-0.5 text-xs font-semibold rounded"
              style={{ backgroundColor: `${pillarData.color}20`, color: pillarData.color }}
            >
              {pillarData.name}
            </span>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <TrophyIcon className="w-3 h-3" />
              {task.xp_value} XP
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
            title="Edit task"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => onAccept(task)}
            className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
            title="Accept task"
          >
            <CheckIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => onReject(task.id)}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Reject task"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Main component
const LessonTaskPanel = ({
  lesson,
  questId,
  questTitle,
  questDescription,
  onTasksUpdated
}) => {
  const [linkedTasks, setLinkedTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [showManualForm, setShowManualForm] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null) // For modal
  const [savingTask, setSavingTask] = useState(false)
  const [generatingAI, setGeneratingAI] = useState(false)
  const [aiTasks, setAiTasks] = useState([])

  // Fetch linked tasks when lesson changes
  useEffect(() => {
    if (lesson?.id && questId) {
      fetchLinkedTasks()
    } else {
      setLinkedTasks([])
    }
  }, [lesson?.id, questId, lesson?.linked_task_ids])

  const fetchLinkedTasks = async () => {
    // Use linked_task_ids from lesson if available
    const taskIds = lesson?.linked_task_ids || []

    if (taskIds.length === 0) {
      setLinkedTasks([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      // Get all quest tasks and filter by those linked to this lesson
      const response = await api.get(`/api/quests/${questId}/tasks`)
      const allTasks = response.data.tasks || []

      // Filter to only tasks linked to this lesson
      const linked = allTasks.filter(t => taskIds.includes(t.id))
      setLinkedTasks(linked)
    } catch (error) {
      console.error('Failed to fetch tasks:', error)
      setLinkedTasks([])
    } finally {
      setLoading(false)
    }
  }

  // Extract text content from lesson for AI context
  const getLessonTextContent = () => {
    if (!lesson?.content) return ''

    if (typeof lesson.content === 'string') return lesson.content

    // Handle version 2 step-based content
    if (lesson.content.version === 2 && lesson.content.steps) {
      return lesson.content.steps
        .map(step => `${step.title || ''}\n${step.content || ''}`)
        .join('\n\n')
    }

    // Handle legacy blocks format
    if (lesson.content.blocks) {
      return lesson.content.blocks
        .filter(block => block.type === 'text')
        .map(block => block.content || '')
        .join('\n\n')
    }

    return ''
  }

  // Generate AI tasks
  const handleGenerateAI = async () => {
    const lessonContent = getLessonTextContent()
    if (!lessonContent.trim()) {
      toast.error('Add some content to the lesson first')
      return
    }

    try {
      setGeneratingAI(true)
      setAiTasks([])

      const response = await api.post(`/api/quests/${questId}/curriculum/lessons/${lesson.id}/generate-tasks`, {
        lesson_content: lessonContent,
        lesson_title: lesson.title,
        curriculum_context: questDescription,
        num_tasks: 3
      })

      if (response.data.success && response.data.tasks) {
        // Add temporary IDs to AI-generated tasks
        const tasksWithIds = response.data.tasks.map((task, idx) => ({
          ...task,
          id: `ai_${Date.now()}_${idx}`,
          xp_value: task.xp_value || 100
        }))
        setAiTasks(tasksWithIds)
        toast.success(`Generated ${tasksWithIds.length} task suggestions`)
      } else {
        toast.error('Failed to generate tasks')
      }
    } catch (error) {
      console.error('Failed to generate AI tasks:', error)
      toast.error(error.response?.data?.error || 'Failed to generate tasks')
    } finally {
      setGeneratingAI(false)
    }
  }

  // Create a task (manual or from AI)
  const handleCreateTask = async (taskData) => {
    try {
      const response = await api.post(`/api/quests/${questId}/curriculum/lessons/${lesson.id}/create-tasks`, {
        tasks: [taskData],
        link_to_lesson: true
      })

      if (response.data.success && response.data.tasks?.length > 0) {
        const createdTask = response.data.tasks[0]
        setLinkedTasks(prev => [...prev, createdTask])
        toast.success('Task created')
        setShowManualForm(false)
        setEditingTask(null)
        onTasksUpdated?.()
      }
    } catch (error) {
      console.error('Failed to create task:', error)
      toast.error('Failed to create task')
    }
  }

  // Accept an AI-generated task
  const handleAcceptAITask = async (task) => {
    try {
      const taskData = {
        title: task.title,
        description: task.description,
        pillar: task.pillar,
        xp_value: task.xp_value,
        evidence_prompt: task.evidence_prompt
      }

      const response = await api.post(`/api/quests/${questId}/curriculum/lessons/${lesson.id}/create-tasks`, {
        tasks: [taskData],
        link_to_lesson: true
      })

      if (response.data.success && response.data.tasks?.length > 0) {
        // Remove the AI task from suggestions (it's now a real task)
        setAiTasks(prev => prev.filter(t => t.id !== task.id))
        // Add the created task to the linked tasks list
        const createdTask = response.data.tasks[0]
        setLinkedTasks(prev => [...prev, createdTask])
        toast.success('Task added')
        onTasksUpdated?.()
      }
    } catch (error) {
      console.error('Failed to accept task:', error)
      toast.error('Failed to add task')
    }
  }

  // Reject an AI task
  const handleRejectAITask = (taskId) => {
    setAiTasks(prev => prev.filter(t => t.id !== taskId))
  }

  // Edit an AI task before accepting
  const handleEditAITask = (taskId, updatedTask) => {
    setAiTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, ...updatedTask } : t
    ))
  }

  // Unlink a task from the lesson
  const handleUnlinkTask = async (taskId) => {
    if (!confirm('Remove this task from the lesson?')) return

    try {
      await api.delete(`/api/quests/${questId}/curriculum/lessons/${lesson.id}/link-task/${taskId}`)
      setLinkedTasks(prev => prev.filter(t => t.id !== taskId))
      toast.success('Task removed from lesson')
      onTasksUpdated?.()
    } catch (error) {
      console.error('Failed to unlink task:', error)
      toast.error('Failed to remove task')
    }
  }

  // Open task in modal for viewing/editing
  const handleTaskClick = (task) => {
    setSelectedTask(task)
  }

  // Save task updates from modal
  const handleSaveTaskUpdate = async (updatedData) => {
    if (!selectedTask?.id) return

    try {
      setSavingTask(true)
      await api.put(`/api/tasks/${selectedTask.id}`, updatedData)

      // Update local state
      setLinkedTasks(prev => prev.map(t =>
        t.id === selectedTask.id ? { ...t, ...updatedData } : t
      ))

      toast.success('Task updated')
      setSelectedTask(null)
      onTasksUpdated?.()
    } catch (error) {
      console.error('Failed to update task:', error)
      toast.error('Failed to update task')
    } finally {
      setSavingTask(false)
    }
  }

  // Clear AI suggestions
  const handleClearAISuggestions = () => {
    setAiTasks([])
  }

  if (!lesson) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm p-6">
        <p>Select a lesson to manage its tasks</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-gray-700">Tasks</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px]" title={lesson.title}>
            {lesson.title}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateAI}
            disabled={generatingAI}
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-optio-purple hover:bg-optio-purple/10 rounded-lg transition-colors disabled:opacity-50"
            title="Generate tasks with AI"
          >
            {generatingAI ? (
              <div className="w-3.5 h-3.5 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
            ) : (
              <SparklesIcon className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">AI</span>
          </button>
          <button
            onClick={() => {
              setEditingTask(null)
              setShowManualForm(true)
            }}
            className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-optio-purple hover:bg-optio-purple/10 rounded-lg transition-colors"
            title="Add task manually"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {/* Manual task form */}
        {showManualForm && (
          <ManualTaskForm
            initialTask={editingTask}
            onSave={handleCreateTask}
            onCancel={() => {
              setShowManualForm(false)
              setEditingTask(null)
            }}
          />
        )}

        {/* AI-generated tasks */}
        {aiTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">AI Suggestions</span>
              <button
                onClick={handleClearAISuggestions}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            </div>
            {aiTasks.map(task => (
              <AITaskPreview
                key={task.id}
                task={task}
                onAccept={handleAcceptAITask}
                onReject={handleRejectAITask}
                onEdit={handleEditAITask}
              />
            ))}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Linked tasks */}
        {!loading && linkedTasks.length > 0 && (
          <div className="space-y-2">
            {aiTasks.length > 0 && (
              <span className="text-xs font-medium text-gray-500">Linked Tasks</span>
            )}
            {linkedTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={handleTaskClick}
                onUnlink={handleUnlinkTask}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && linkedTasks.length === 0 && aiTasks.length === 0 && !showManualForm && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm mb-3">No tasks linked to this lesson</p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  setEditingTask(null)
                  setShowManualForm(true)
                }}
                className="text-sm text-optio-purple hover:underline"
              >
                Add manually
              </button>
              <span className="text-gray-400">or</span>
              <button
                onClick={handleGenerateAI}
                disabled={generatingAI}
                className="text-sm text-optio-purple hover:underline disabled:opacity-50"
              >
                Generate with AI
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Task Edit Modal */}
      {selectedTask && (
        <TaskEditModal
          task={selectedTask}
          onSave={handleSaveTaskUpdate}
          onClose={() => setSelectedTask(null)}
          saving={savingTask}
        />
      )}
    </div>
  )
}

export default LessonTaskPanel
