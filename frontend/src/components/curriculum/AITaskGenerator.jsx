import React, { useState } from 'react'
import { SparklesIcon, CheckCircleIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useAIAccess } from '../../contexts/AIAccessContext'

const TaskPreviewCard = ({ task, onEdit, onAccept, onReject }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editedTask, setEditedTask] = useState(task)

  const handleSave = () => {
    onEdit(task.id, editedTask)
    setIsEditing(false)
  }

  const getPillarColor = (pillar) => {
    const colors = {
      'Growth Mindset': 'bg-purple-100 text-purple-700',
      'Emotional Intelligence': 'bg-blue-100 text-blue-700',
      'Leadership': 'bg-green-100 text-green-700',
      'Community': 'bg-yellow-100 text-yellow-700',
      'Innovation': 'bg-pink-100 text-pink-700',
      'Well-being': 'bg-indigo-100 text-indigo-700'
    }
    return colors[pillar] || 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          {isEditing ? (
            <div className="space-y-3">
              <input
                type="text"
                value={editedTask.title}
                onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                placeholder="Task title"
              />
              <textarea
                value={editedTask.description}
                onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                rows="3"
                placeholder="Task description"
              />
              <div className="flex items-center gap-3">
                <select
                  value={editedTask.pillar}
                  onChange={(e) => setEditedTask({ ...editedTask, pillar: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                >
                  <option value="Growth Mindset">Growth Mindset</option>
                  <option value="Emotional Intelligence">Emotional Intelligence</option>
                  <option value="Leadership">Leadership</option>
                  <option value="Community">Community</option>
                  <option value="Innovation">Innovation</option>
                  <option value="Well-being">Well-being</option>
                </select>
                <input
                  type="number"
                  min="10"
                  max="100"
                  step="10"
                  value={editedTask.xp_value}
                  onChange={(e) => setEditedTask({ ...editedTask, xp_value: parseInt(e.target.value) || 10 })}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                  placeholder="XP"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-4 py-2 text-sm font-medium text-white bg-optio-purple rounded-lg hover:bg-opacity-90 transition-opacity"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditedTask(task)
                    setIsEditing(false)
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 mb-2">
                <h4 className="font-medium text-gray-900 flex-1">{task.title}</h4>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="text-sm text-optio-purple hover:underline"
                >
                  Edit
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-3">{task.description}</p>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 text-xs font-medium rounded ${getPillarColor(task.pillar)}`}>
                  {task.pillar}
                </span>
                <span className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700">
                  {task.xp_value} XP
                </span>
              </div>
            </>
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAccept(task.id)}
              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              aria-label="Accept task"
              title="Accept task"
            >
              <CheckCircleIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => onReject(task.id)}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              aria-label="Reject task"
              title="Reject task"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const AITaskGenerator = ({ lessonId, questId, onTasksAdded }) => {
  const { canUseTaskGeneration } = useAIAccess()
  const [taskCount, setTaskCount] = useState(3)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedTasks, setGeneratedTasks] = useState([])
  const [acceptedTasks, setAcceptedTasks] = useState([])
  const [error, setError] = useState(null)
  const [isAdding, setIsAdding] = useState(false)

  // Don't render if AI task generation is disabled
  if (!canUseTaskGeneration) {
    return null
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const response = await api.post(`/api/lessons/${lessonId}/generate-tasks`, {
        count: taskCount,
        quest_id: questId
      })

      if (response.data.success) {
        const tasks = response.data.tasks.map((task, index) => ({
          id: `task_${Date.now()}_${index}`,
          ...task,
          accepted: false
        }))
        setGeneratedTasks(tasks)
        setAcceptedTasks([])
        toast.success(`Generated ${tasks.length} tasks from lesson content`)
      } else {
        throw new Error(response.data.error || 'Failed to generate tasks')
      }
    } catch (err) {
      console.error('Task generation error:', err)
      const errorMessage = err.response?.data?.error || err.message || 'Failed to generate tasks'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleEdit = (taskId, updatedTask) => {
    setGeneratedTasks(generatedTasks.map(task =>
      task.id === taskId ? { ...task, ...updatedTask } : task
    ))
  }

  const handleAccept = (taskId) => {
    const task = generatedTasks.find(t => t.id === taskId)
    if (task && !acceptedTasks.find(t => t.id === taskId)) {
      setAcceptedTasks([...acceptedTasks, { ...task, accepted: true }])
      toast.success('Task accepted')
    }
  }

  const handleReject = (taskId) => {
    setGeneratedTasks(generatedTasks.filter(t => t.id !== taskId))
    setAcceptedTasks(acceptedTasks.filter(t => t.id !== taskId))
    toast.success('Task rejected')
  }

  const handleAddToQuest = async () => {
    if (acceptedTasks.length === 0) {
      toast.error('Please accept at least one task first')
      return
    }

    setIsAdding(true)

    try {
      // In real implementation, call API to add tasks to quest
      // const response = await api.post(`/api/quests/${questId}/tasks`, {
      //   tasks: acceptedTasks.map(({ id, accepted, ...task }) => task)
      // })

      toast.success(`Added ${acceptedTasks.length} tasks to quest`)

      // Call callback if provided
      if (onTasksAdded) {
        onTasksAdded(acceptedTasks)
      }

      // Reset state
      setGeneratedTasks([])
      setAcceptedTasks([])
    } catch (err) {
      console.error('Add tasks error:', err)
      const errorMessage = err.response?.data?.error || 'Failed to add tasks to quest'
      toast.error(errorMessage)
    } finally {
      setIsAdding(false)
    }
  }

  const handleRetry = () => {
    setError(null)
    handleGenerate()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <SparklesIcon className="w-6 h-6 text-optio-purple" />
        <h3 className="text-lg font-semibold text-gray-900">AI Task Generator</h3>
      </div>

      {/* Generation Controls */}
      {generatedTasks.length === 0 && (
        <div className="bg-white border border-gray-300 rounded-lg p-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="task-count" className="block text-sm font-medium text-gray-700 mb-2">
                Number of tasks to generate
              </label>
              <input
                id="task-count"
                type="number"
                min="1"
                max="5"
                value={taskCount}
                onChange={(e) => setTaskCount(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                disabled={isGenerating}
              />
              <p className="mt-1 text-xs text-gray-500">Choose between 1-5 tasks</p>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generating Tasks...</span>
                </>
              ) : (
                <>
                  <SparklesIcon className="w-5 h-5" />
                  <span>Generate Tasks from Lesson</span>
                </>
              )}
            </button>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <XMarkIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-800 font-medium">Generation Failed</p>
                    <p className="text-sm text-red-600 mt-1">{error}</p>
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="mt-3 flex items-center gap-2 text-sm font-medium text-red-700 hover:text-red-900"
                    >
                      <ArrowPathIcon className="w-4 h-4" />
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Generated Tasks Preview */}
      {generatedTasks.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {acceptedTasks.length} of {generatedTasks.length} tasks accepted
            </p>
            <button
              type="button"
              onClick={() => {
                setGeneratedTasks([])
                setAcceptedTasks([])
              }}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Clear All
            </button>
          </div>

          <div className="space-y-3">
            {generatedTasks.map((task) => (
              <TaskPreviewCard
                key={task.id}
                task={task}
                onEdit={handleEdit}
                onAccept={handleAccept}
                onReject={handleReject}
              />
            ))}
          </div>

          {acceptedTasks.length > 0 && (
            <button
              type="button"
              onClick={handleAddToQuest}
              disabled={isAdding}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-optio-purple rounded-lg hover:bg-opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAdding ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Adding Tasks...</span>
                </>
              ) : (
                <>
                  <CheckCircleIcon className="w-5 h-5" />
                  <span>Add {acceptedTasks.length} Task{acceptedTasks.length !== 1 ? 's' : ''} to Quest</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> The AI will analyze the lesson content and generate relevant tasks
          that align with the lesson objectives and Optio's learning pillars.
        </p>
      </div>
    </div>
  )
}

export default AITaskGenerator
