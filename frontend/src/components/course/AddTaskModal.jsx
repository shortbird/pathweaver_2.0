import React, { useState } from 'react'
import { XMarkIcon, TrophyIcon } from '@heroicons/react/24/outline'
import { getPillarData, PILLAR_KEYS } from '../../utils/pillarMappings'

/**
 * Modal for creating a new task and linking it to a lesson
 */
const AddTaskModal = ({ isOpen, onClose, lessonTitle, onSave }) => {
  const [task, setTask] = useState({
    title: '',
    description: '',
    pillar: 'stem',
    xp_value: 100,
    is_required: false
  })
  const [saving, setSaving] = useState(false)

  const pillarData = getPillarData(task.pillar)

  const handleSave = async () => {
    if (!task.title?.trim()) return

    setSaving(true)
    try {
      const success = await onSave(task)
      if (success) {
        // Reset form
        setTask({
          title: '',
          description: '',
          pillar: 'stem',
          xp_value: 100,
          is_required: false
        })
      }
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add Task</h2>
            {lessonTitle && (
              <p className="text-sm text-gray-500 mt-0.5">For: {lessonTitle}</p>
            )}
          </div>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={task.title}
              onChange={(e) => setTask({ ...task, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              placeholder="Enter a task title..."
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={task.description}
              onChange={(e) => setTask({ ...task, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
              placeholder="Describe what students should do..."
            />
          </div>

          {/* Pillar and XP */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pillar
              </label>
              <select
                value={task.pillar}
                onChange={(e) => setTask({ ...task, pillar: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              >
                {PILLAR_KEYS.map(key => (
                  <option key={key} value={key}>{getPillarData(key).name}</option>
                ))}
              </select>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                XP Value
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="25"
                  max="500"
                  step="25"
                  value={task.xp_value}
                  onChange={(e) => setTask({ ...task, xp_value: parseInt(e.target.value) || 100 })}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                />
                <TrophyIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>
          </div>

          {/* Required Toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <label className="text-sm font-medium text-gray-700">Required Task</label>
              <p className="text-xs text-gray-500 mt-0.5">Students must complete this task to finish the lesson</p>
            </div>
            <button
              type="button"
              onClick={() => setTask({ ...task, is_required: !task.is_required })}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-optio-purple focus:ring-offset-2 ${
                task.is_required ? 'bg-optio-purple' : 'bg-gray-200'
              }`}
              role="switch"
              aria-checked={task.is_required}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  task.is_required ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
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
            disabled={saving || !task.title?.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AddTaskModal
