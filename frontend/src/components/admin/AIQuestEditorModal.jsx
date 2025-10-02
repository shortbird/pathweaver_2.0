import React, { useState } from 'react'
import { X, Save, Plus, Trash2, AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'

const PILLARS = [
  'STEM & Logic',
  'Life & Wellness',
  'Language & Communication',
  'Society & Culture',
  'Arts & Creativity'
]

const AIQuestEditorModal = ({ reviewItem, isOpen, onClose, onSave, isProcessing }) => {
  const [questData, setQuestData] = useState(reviewItem?.quest_data || {})

  if (!isOpen || !reviewItem) return null

  const handleFieldChange = (field, value) => {
    setQuestData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleTaskChange = (taskIndex, field, value) => {
    setQuestData(prev => ({
      ...prev,
      tasks: prev.tasks.map((task, idx) =>
        idx === taskIndex ? { ...task, [field]: value } : task
      )
    }))
  }

  const handleAddTask = () => {
    setQuestData(prev => ({
      ...prev,
      tasks: [
        ...(prev.tasks || []),
        {
          title: '',
          description: '',
          pillar: 'STEM & Logic',
          xp_value: 100,
          evidence_prompt: '',
          order_index: (prev.tasks?.length || 0) + 1
        }
      ]
    }))
  }

  const handleRemoveTask = (taskIndex) => {
    setQuestData(prev => ({
      ...prev,
      tasks: prev.tasks.filter((_, idx) => idx !== taskIndex)
    }))
  }

  const handleSave = () => {
    // Validation
    if (!questData.title?.trim()) {
      toast.error('Quest title is required')
      return
    }

    if (!questData.big_idea?.trim()) {
      toast.error('Quest description (big idea) is required')
      return
    }

    if (!questData.tasks || questData.tasks.length === 0) {
      toast.error('At least one task is required')
      return
    }

    // Validate all tasks
    for (let i = 0; i < questData.tasks.length; i++) {
      const task = questData.tasks[i]
      if (!task.title?.trim()) {
        toast.error(`Task ${i + 1}: Title is required`)
        return
      }
      if (!task.description?.trim()) {
        toast.error(`Task ${i + 1}: Description is required`)
        return
      }
      if (!task.pillar) {
        toast.error(`Task ${i + 1}: Pillar is required`)
        return
      }
    }

    // Save
    if (onSave) {
      onSave(reviewItem.id, questData)
    }
  }

  const totalXP = questData.tasks?.reduce((sum, task) => sum + (Number(task.xp_value) || 0), 0) || 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl my-8">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Edit AI-Generated Quest</h2>
            <p className="text-sm text-gray-600 mt-1">Make changes before approving this quest</p>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Quest Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Quest Title *
              </label>
              <input
                type="text"
                value={questData.title || ''}
                onChange={(e) => handleFieldChange('title', e.target.value)}
                placeholder="Enter quest title..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Quest Description (Big Idea) *
              </label>
              <textarea
                value={questData.big_idea || ''}
                onChange={(e) => handleFieldChange('big_idea', e.target.value)}
                rows={3}
                placeholder="What is this quest about? What will students learn?"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              />
            </div>
          </div>

          {/* Tasks Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Tasks ({questData.tasks?.length || 0})</h3>
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium text-gray-600">
                  Total XP: <span className="text-blue-600 font-bold">{totalXP}</span>
                </span>
                <button
                  onClick={handleAddTask}
                  disabled={isProcessing}
                  className="flex items-center space-x-1 px-3 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Task</span>
                </button>
              </div>
            </div>

            {(!questData.tasks || questData.tasks.length === 0) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                <AlertCircle className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
                <p className="text-sm text-yellow-800 font-medium">No tasks yet. Add at least one task.</p>
              </div>
            )}

            <div className="space-y-4">
              {questData.tasks?.map((task, taskIdx) => (
                <div key={taskIdx} className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="text-sm font-bold text-gray-900">Task {taskIdx + 1}</h4>
                    <button
                      onClick={() => handleRemoveTask(taskIdx)}
                      disabled={isProcessing}
                      className="text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {/* Task Title */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Task Title *
                      </label>
                      <input
                        type="text"
                        value={task.title || ''}
                        onChange={(e) => handleTaskChange(taskIdx, 'title', e.target.value)}
                        placeholder="E.g., Research and gather information"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>

                    {/* Task Description */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Description *
                      </label>
                      <textarea
                        value={task.description || ''}
                        onChange={(e) => handleTaskChange(taskIdx, 'description', e.target.value)}
                        rows={2}
                        placeholder="What should students do for this task?"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                      />
                    </div>

                    {/* Task Metadata Row */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Pillar */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Pillar *
                        </label>
                        <select
                          value={task.pillar || 'STEM & Logic'}
                          onChange={(e) => handleTaskChange(taskIdx, 'pillar', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                          {PILLARS.map(pillar => (
                            <option key={pillar} value={pillar}>{pillar}</option>
                          ))}
                        </select>
                      </div>

                      {/* XP Value */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          XP Value
                        </label>
                        <input
                          type="number"
                          value={task.xp_value || 100}
                          onChange={(e) => handleTaskChange(taskIdx, 'xp_value', Number(e.target.value))}
                          min={50}
                          max={500}
                          step={50}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    {/* Evidence Prompt */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Evidence Prompt (Optional)
                      </label>
                      <input
                        type="text"
                        value={task.evidence_prompt || ''}
                        onChange={(e) => handleTaskChange(taskIdx, 'evidence_prompt', e.target.value)}
                        placeholder="What should students submit as evidence?"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Warning */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-blue-800 font-medium mb-1">Changes will be saved to review queue</p>
                <p className="text-xs text-blue-700">
                  After saving, you can approve the quest or continue editing. The quest will be marked as "edited".
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 rounded-b-xl flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={isProcessing}
            className="flex items-center space-x-2 px-6 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Save className="h-4 w-4" />
            <span>{isProcessing ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default AIQuestEditorModal
