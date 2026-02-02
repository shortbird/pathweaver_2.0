/**
 * SuggestedTasksModal Component
 *
 * Modal for browsing and activating suggested tasks from a lesson.
 * Users can multi-select tasks to activate them, then navigate to the quest page.
 */

import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ClipboardDocumentListIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid'
import { Modal } from '../ui/Modal'
import { getPillarData } from '../../utils/pillarMappings'
import api from '../../services/api'
import toast from 'react-hot-toast'

export const SuggestedTasksModal = ({
  isOpen,
  onClose,
  questId,
  lessonTitle,
  tasks = [],
  onTaskActivated,
}) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set())
  const [isActivating, setIsActivating] = useState(false)

  // Toggle task selection
  const toggleTaskSelection = (taskId) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  // Select all available tasks
  const selectAll = () => {
    const availableIds = tasks.filter(t => !t.is_completed).map(t => t.id)
    setSelectedTaskIds(new Set(availableIds))
  }

  // Clear selection
  const clearSelection = () => {
    setSelectedTaskIds(new Set())
  }

  // Activate all selected tasks
  const handleActivateSelected = async () => {
    if (selectedTaskIds.size === 0 || isActivating) return

    setIsActivating(true)
    const selectedTasks = tasks.filter(t => selectedTaskIds.has(t.id))
    let successCount = 0
    let firstTaskId = null

    try {
      for (const task of selectedTasks) {
        try {
          const response = await api.post(`/api/quests/${questId}/activate-task/${task.id}`, {})
          if (response.data.success) {
            successCount++
            if (!firstTaskId) {
              firstTaskId = task.id
            }
            // Store task title for navigation matching
            sessionStorage.setItem(`task_title_${task.id}`, task.title)
          }
        } catch (err) {
          console.error(`Failed to activate task ${task.id}:`, err)
        }
      }

      if (successCount > 0) {
        // Store current location for back navigation from quest page
        sessionStorage.setItem('courseTaskReturnInfo', JSON.stringify({
          pathname: location.pathname,
          search: location.search
        }))
        onTaskActivated?.()

        toast.success(`${successCount} task${successCount > 1 ? 's' : ''} added to your project!`)

        // Close modal and navigate to quest page
        onClose()
        navigate(`/quests/${questId}${firstTaskId ? `?task=${firstTaskId}` : ''}`)
      } else {
        toast.error('Failed to activate tasks. Please try again.')
      }
    } catch (error) {
      console.error('Failed to activate tasks:', error)
      toast.error('Failed to activate tasks. Please try again.')
    } finally {
      setIsActivating(false)
    }
  }

  // Separate completed from available tasks
  const completedTasks = tasks.filter(t => t.is_completed)
  const availableTasks = tasks.filter(t => !t.is_completed)

  // Calculate total XP of selected tasks
  const selectedXP = tasks
    .filter(t => selectedTaskIds.has(t.id))
    .reduce((sum, t) => sum + (t.xp_value || 0), 0)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Suggested Tasks"
      size="lg"
      footer={
        availableTasks.length > 0 && (
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-gray-600">
              {selectedTaskIds.size > 0 ? (
                <span>
                  <span className="font-semibold text-optio-purple">{selectedTaskIds.size}</span> task{selectedTaskIds.size !== 1 ? 's' : ''} selected
                  {selectedXP > 0 && <span className="ml-2 text-optio-purple font-medium">({selectedXP} XP)</span>}
                </span>
              ) : (
                <span>Select tasks to add to your project</span>
              )}
            </div>
            <div className="flex gap-2">
              {selectedTaskIds.size > 0 && (
                <button
                  onClick={clearSelection}
                  className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={handleActivateSelected}
                disabled={selectedTaskIds.size === 0 || isActivating}
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isActivating ? 'Adding...' : `Add ${selectedTaskIds.size > 0 ? selectedTaskIds.size : ''} Task${selectedTaskIds.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {lessonTitle && (
          <p className="text-sm text-gray-600">
            Select tasks from <span className="font-medium">{lessonTitle}</span> to add to your project.
          </p>
        )}

        {/* Select All / Clear buttons */}
        {availableTasks.length > 1 && (
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-sm text-optio-purple hover:text-optio-purple/80 font-medium"
            >
              Select All
            </button>
            {selectedTaskIds.size > 0 && (
              <>
                <span className="text-gray-300">|</span>
                <button
                  onClick={clearSelection}
                  className="text-sm text-gray-500 hover:text-gray-700 font-medium"
                >
                  Clear Selection
                </button>
              </>
            )}
          </div>
        )}

        {/* Available Tasks */}
        {availableTasks.length > 0 && (
          <div className="space-y-3">
            {availableTasks.map((task) => {
              const pillarData = getPillarData(task.pillar || 'wellness')
              const isSelected = selectedTaskIds.has(task.id)

              return (
                <div
                  key={task.id}
                  onClick={() => toggleTaskSelection(task.id)}
                  className={`
                    p-4 rounded-xl border-2 text-left transition-all duration-150 cursor-pointer
                    hover:shadow-md
                    ${isSelected
                      ? 'border-optio-purple bg-optio-purple/5 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-optio-purple/50'}
                  `}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <div
                      className={`
                        w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors
                        ${isSelected
                          ? 'bg-optio-purple border-optio-purple'
                          : 'border-gray-300 bg-white'}
                      `}
                    >
                      {isSelected && <CheckIcon className="w-4 h-4 text-white" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-gray-900">{task.title}</p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: pillarData.color }}
                          >
                            {pillarData.name}
                          </span>
                          {task.xp_value && (
                            <span className="text-xs font-semibold text-optio-purple whitespace-nowrap">
                              +{task.xp_value} XP
                            </span>
                          )}
                        </div>
                      </div>
                      {task.description && (
                        <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{task.description}</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Completed Tasks */}
        {completedTasks.length > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
              <CheckCircleSolidIcon className="w-4 h-4 text-green-500" />
              Already Completed
            </h4>
            <div className="space-y-2">
              {completedTasks.map((task) => {
                const pillarData = getPillarData(task.pillar || 'wellness')
                return (
                  <div
                    key={task.id}
                    className="p-3 rounded-lg bg-green-50 border border-green-200"
                  >
                    <div className="flex items-start gap-3">
                      <CheckCircleSolidIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-gray-900 text-sm">{task.title}</p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
                              style={{ backgroundColor: pillarData.color }}
                            >
                              {pillarData.name}
                            </span>
                            {task.xp_value && (
                              <span className="text-[10px] font-semibold text-green-600 whitespace-nowrap">
                                +{task.xp_value} XP earned
                              </span>
                            )}
                          </div>
                        </div>
                        {task.description && (
                          <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{task.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {tasks.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <ClipboardDocumentListIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No suggested tasks for this lesson.</p>
            <p className="text-sm mt-1">You can create your own tasks instead!</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default SuggestedTasksModal
