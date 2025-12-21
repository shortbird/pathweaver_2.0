import React, { useState, useEffect } from 'react'
import { XMarkIcon, PlusIcon, CheckIcon, EyeIcon, ExclamationCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

const AdvisorTaskForm = ({ student, questId, userQuestId, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false)
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [templates, setTemplates] = useState([])
  const [selectedTemplates, setSelectedTemplates] = useState(new Set())
  const [previewTask, setPreviewTask] = useState(null)
  const [errors, setErrors] = useState({})

  // Custom task form state - simplified to use xp_value
  const [customTask, setCustomTask] = useState({
    title: '',
    description: '',
    pillar: '',
    xp_value: 100
  })

  // Pillar options (using simplified single-word keys)
  const pillarOptions = [
    { value: 'stem', label: 'STEM' },
    { value: 'wellness', label: 'Wellness' },
    { value: 'communication', label: 'Communication' },
    { value: 'civics', label: 'Civics' },
    { value: 'art', label: 'Art' }
  ]

  useEffect(() => {
    fetchTemplates()
  }, [questId, student.id])

  const fetchTemplates = async () => {
    setLoadingTemplates(true)
    try {
      // Pass target_user_id to filter out tasks already assigned to this student
      const response = await api.get(`/api/admin/quests/${questId}/task-templates?target_user_id=${student.id}`)
      setTemplates(response.data.templates || [])
    } catch (error) {
      console.error('Error fetching templates:', error)
      toast.error('Failed to load task templates')
    } finally {
      setLoadingTemplates(false)
    }
  }


  const toggleTemplateSelection = (templateId) => {
    setSelectedTemplates(prev => {
      const newSet = new Set(prev)
      if (newSet.has(templateId)) {
        newSet.delete(templateId)
      } else {
        newSet.add(templateId)
      }
      return newSet
    })
  }

  const getPillarColor = (pillar) => {
    const colors = {
      stem: 'bg-blue-100 text-blue-700',
      wellness: 'bg-red-100 text-red-700',
      communication: 'bg-green-100 text-green-700',
      civics: 'bg-orange-100 text-orange-700',
      art: 'bg-purple-100 text-purple-700'
    }
    return colors[pillar] || 'bg-gray-100 text-gray-700'
  }

  const getPillarLabel = (pillar) => {
    const labels = {
      stem: 'STEM',
      wellness: 'Wellness',
      communication: 'Communication',
      civics: 'Civics',
      art: 'Art'
    }
    return labels[pillar] || pillar
  }

  const getTotalTaskXP = (task) => {
    return task.xp_value || 100
  }

  const validateCustomTask = () => {
    const newErrors = {}

    if (!customTask.title.trim()) {
      newErrors.title = 'Task title is required'
    }

    if (!customTask.pillar) {
      newErrors.pillar = 'Learning pillar is required'
    }

    if (!customTask.xp_value || customTask.xp_value <= 0) {
      newErrors.xp = 'XP value must be greater than 0'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleAddCustomTask = async () => {
    if (!validateCustomTask()) {
      toast.error('Please fix all errors before adding task')
      return
    }

    setLoading(true)
    try {
      await api.post(`/api/admin/users/${student.id}/quests/${questId}/tasks`, customTask)
      toast.success('Custom task added successfully!')

      // Reset form
      setCustomTask({
        title: '',
        description: '',
        pillar: '',
        xp_value: 100
      })
      setErrors({})

      // Refresh templates to include the new task
      fetchTemplates()
    } catch (error) {
      console.error('Error adding custom task:', error)
      toast.error(error.response?.data?.error || 'Failed to add custom task')
    } finally {
      setLoading(false)
    }
  }

  const handleAddSelectedTemplates = async () => {
    if (selectedTemplates.size === 0) {
      toast.error('Please select at least one template')
      return
    }

    setLoading(true)
    try {
      const templateIds = Array.from(selectedTemplates)
      await api.post(`/api/admin/users/${student.id}/quests/${questId}/tasks/batch`, {
        template_task_ids: templateIds
      })

      toast.success(`${templateIds.length} task${templateIds.length > 1 ? 's' : ''} added successfully!`)
      setSelectedTemplates(new Set())
      onSuccess && onSuccess()
      onClose()
    } catch (error) {
      console.error('Error adding templates:', error)
      toast.error(error.response?.data?.error || 'Failed to add templates')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitAll = async () => {
    const hasSelectedTemplates = selectedTemplates.size > 0
    const hasCustomTask = customTask.title.trim() || customTask.pillar

    if (!hasSelectedTemplates && !hasCustomTask) {
      toast.error('Please select templates or create a custom task')
      return
    }

    // If we have both, add them sequentially
    setLoading(true)
    try {
      let tasksAdded = 0

      // Add selected templates first
      if (hasSelectedTemplates) {
        const templateIds = Array.from(selectedTemplates)
        await api.post(`/api/admin/users/${student.id}/quests/${questId}/tasks/batch`, {
          template_task_ids: templateIds
        })
        tasksAdded += templateIds.length
      }

      // Add custom task if valid
      if (hasCustomTask && validateCustomTask()) {
        await api.post(`/api/admin/users/${student.id}/quests/${questId}/tasks`, customTask)
        tasksAdded += 1
      }

      toast.success(`${tasksAdded} task${tasksAdded > 1 ? 's' : ''} added successfully!`)
      onSuccess && onSuccess()
      onClose()
    } catch (error) {
      console.error('Error adding tasks:', error)
      toast.error(error.response?.data?.error || 'Failed to add tasks')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b px-6 py-4 flex justify-between items-center bg-gradient-primary">
          <div className="text-white">
            <h2 className="text-2xl font-bold">Add Tasks to {student.first_name}'s Quest</h2>
            <p className="text-sm opacity-90">Select existing templates or create custom tasks</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full text-white"
          >
            <XMarkIcon size={24} />
          </button>
        </div>

        {/* Two-Panel Layout */}
        <div className="flex-1 overflow-hidden flex">
          {/* LEFT PANEL: Task Templates */}
          <div className="w-1/2 border-r flex flex-col">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-semibold text-lg">Task Templates</h3>
              <p className="text-sm text-gray-600">Select from tasks used by other students</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-12">
                  <ArrowPathIcon className="animate-spin text-optio-purple" size={32} />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>No task templates available yet for this quest.</p>
                  <p className="text-sm mt-2">Be the first to create tasks!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        selectedTemplates.has(template.id)
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-purple-300'
                      }`}
                      onClick={() => toggleTemplateSelection(template.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          <div className={`w-5 h-5 border-2 rounded flex items-center justify-center ${
                            selectedTemplates.has(template.id)
                              ? 'border-optio-purple bg-optio-purple'
                              : 'border-gray-300'
                          }`}>
                            {selectedTemplates.has(template.id) && (
                              <CheckIcon size={14} className="text-white" />
                            )}
                          </div>
                        </div>

                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900">{template.title}</h4>
                          {template.description && (
                            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{template.description}</p>
                          )}

                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className={`text-xs px-2 py-1 rounded ${getPillarColor(template.pillar)}`}>
                              {getPillarLabel(template.pillar)}
                            </span>
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                              {getTotalTaskXP(template)} XP
                            </span>
                            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                              Used by {template.usage_count} student{template.usage_count !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setPreviewTask(template)
                          }}
                          className="text-optio-purple hover:text-purple-800 p-1"
                          title="Preview task details"
                        >
                          <EyeIcon size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedTemplates.size > 0 && (
              <div className="p-4 border-t bg-gray-50">
                <button
                  onClick={handleAddSelectedTemplates}
                  disabled={loading}
                  className="w-full bg-optio-purple text-white py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  Add {selectedTemplates.size} Selected Template{selectedTemplates.size > 1 ? 's' : ''}
                </button>
              </div>
            )}
          </div>

          {/* RIGHT PANEL: Custom Task Creation */}
          <div className="w-1/2 flex flex-col">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-semibold text-lg">Create Custom Task</h3>
              <p className="text-sm text-gray-600">Design a new task for this student</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-800">
                    Task Title
                    <span className="text-red-500 font-bold ml-1">*</span>
                  </label>
                  <input
                    type="text"
                    value={customTask.title}
                    onChange={(e) => {
                      setCustomTask({ ...customTask, title: e.target.value })
                      if (errors.title) setErrors({ ...errors, title: '' })
                    }}
                    className={`w-full px-4 py-2 border rounded-lg ${errors.title ? 'border-red-500' : 'border-gray-300'}`}
                    placeholder="e.g., Research local plant species"
                  />
                  {errors.title && (
                    <p className="text-red-600 text-sm mt-1 flex items-center">
                      <ExclamationCircleIcon size={14} className="mr-1" />
                      {errors.title}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-600">
                    Task Description (Optional)
                  </label>
                  <textarea
                    value={customTask.description}
                    onChange={(e) => setCustomTask({ ...customTask, description: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg border-gray-300"
                    rows={3}
                    placeholder="Provide detailed instructions..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-800">
                    Learning Pillar
                    <span className="text-red-500 font-bold ml-1">*</span>
                  </label>
                  <select
                    value={customTask.pillar}
                    onChange={(e) => {
                      setCustomTask({ ...customTask, pillar: e.target.value })
                      if (errors.pillar) setErrors({ ...errors, pillar: '' })
                    }}
                    className={`w-full px-4 py-2 border rounded-lg ${errors.pillar ? 'border-red-500' : 'border-gray-300'}`}
                  >
                    <option value="">Choose a learning pillar...</option>
                    {pillarOptions.map(pillar => (
                      <option key={pillar.value} value={pillar.value}>
                        {pillar.label}
                      </option>
                    ))}
                  </select>
                  {errors.pillar && (
                    <p className="text-red-600 text-sm mt-1 flex items-center">
                      <ExclamationCircleIcon size={14} className="mr-1" />
                      {errors.pillar}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-800">
                    XP Value
                    <span className="text-red-500 font-bold ml-1">*</span>
                  </label>
                  <input
                    type="number"
                    value={customTask.xp_value}
                    onChange={(e) => {
                      setCustomTask({ ...customTask, xp_value: parseInt(e.target.value) || 0 })
                      if (errors.xp) setErrors({ ...errors, xp: '' })
                    }}
                    className={`w-full px-4 py-2 border rounded-lg ${errors.xp ? 'border-red-500' : 'border-gray-300'}`}
                    placeholder="Enter XP value..."
                    min="25"
                    max="500"
                    step="25"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Recommended: 25-100 XP for small tasks, 100-250 XP for medium tasks, 250-500 XP for large tasks
                  </p>
                  {errors.xp && (
                    <p className="text-red-600 text-sm mt-1 flex items-center">
                      <ExclamationCircleIcon size={14} className="mr-1" />
                      {errors.xp}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={handleAddCustomTask}
                disabled={loading || !customTask.title.trim()}
                className="w-full bg-gradient-primary text-white py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                <PlusIcon size={18} className="inline mr-2" />
                Add Custom Task
              </button>
            </div>
          </div>
        </div>

        {/* Footer with Submit All Button */}
        <div className="border-t p-4 bg-gray-50 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {selectedTemplates.size > 0 && (
              <span>{selectedTemplates.size} template{selectedTemplates.size > 1 ? 's' : ''} selected</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Close
            </button>
            <button
              onClick={handleSubmitAll}
              disabled={loading || (selectedTemplates.size === 0 && !customTask.title.trim())}
              className="px-6 py-2 bg-gradient-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Adding Tasks...' : 'Add All Tasks'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="text-xl font-bold">Task Preview</h3>
              <button
                onClick={() => setPreviewTask(null)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <XMarkIcon size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <h4 className="font-semibold text-gray-900 text-lg">{previewTask.title}</h4>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-xs px-2 py-1 rounded ${getPillarColor(previewTask.pillar)}`}>
                    {getPillarLabel(previewTask.pillar)}
                  </span>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                    {getTotalTaskXP(previewTask)} XP Total
                  </span>
                </div>
              </div>

              {previewTask.description && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                  <p className="text-gray-700">{previewTask.description}</p>
                </div>
              )}

              <div className="pt-4 border-t">
                <button
                  onClick={() => {
                    toggleTemplateSelection(previewTask.id)
                    setPreviewTask(null)
                  }}
                  className="w-full bg-optio-purple text-white py-2 rounded-lg hover:bg-purple-700"
                >
                  {selectedTemplates.has(previewTask.id) ? 'Unselect This Task' : 'Select This Task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdvisorTaskForm
