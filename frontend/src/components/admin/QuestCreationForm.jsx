import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronUp, Save, AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

const QuestCreationForm = ({ onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false)
  const [sources, setSources] = useState([])
  const [showNewSourceForm, setShowNewSourceForm] = useState(false)
  const [errors, setErrors] = useState({})
  
  // Form state matching the quest template structure
  const [formData, setFormData] = useState({
    title: '',
    big_idea: '',
    source: 'optio',
    is_active: true,
    tasks: [
      {
        title: '',
        description: '',
        pillar: '',
        xp_value: 100,
        evidence_prompt: '',
        materials_needed: [],
        subcategory: '',
        order_index: 1,
        task_order: 0
      }
    ],
    metadata: {
      location_type: 'anywhere',
      location_address: '',
      venue_name: '',
      seasonal_start: '',
      seasonal_end: ''
    }
  })

  // Pillar options with proper database values
  const pillarOptions = [
    { value: 'STEM & Logic', label: 'STEM & Logic' },
    { value: 'Life & Wellness', label: 'Life & Wellness' },
    { value: 'Language & Communication', label: 'Language & Communication' },
    { value: 'Society & Culture', label: 'Society & Culture' },
    { value: 'Arts & Creativity', label: 'Arts & Creativity' }
  ]

  // Location type options
  const locationTypes = [
    { value: 'anywhere', label: 'Anywhere' },
    { value: 'specific_location', label: 'Specific Location' },
    { value: 'online', label: 'Online Only' },
    { value: 'outdoors', label: 'Outdoors' }
  ]

  useEffect(() => {
    fetchSources()
  }, [])

  const fetchSources = async () => {
    try {
      const response = await api.get('/v3/admin/quest-sources')
      setSources(response.data.sources || [])
    } catch (error) {
      console.error('Error fetching sources:', error)
      toast.error('Failed to load quest sources')
    }
  }

  const validateForm = () => {
    const newErrors = {}
    
    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
    }
    
    if (!formData.big_idea.trim()) {
      newErrors.big_idea = 'Big idea/description is required'
    }
    
    // Validate tasks
    formData.tasks.forEach((task, index) => {
      if (!task.title.trim()) {
        newErrors[`task_${index}_title`] = 'Task title is required'
      }
      if (!task.description.trim()) {
        newErrors[`task_${index}_description`] = 'Task description is required'
      }
      if (!task.pillar) {
        newErrors[`task_${index}_pillar`] = 'Pillar is required'
      }
      if (task.xp_value <= 0) {
        newErrors[`task_${index}_xp`] = 'XP must be positive'
      }
    })
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validateForm()) {
      toast.error('Please fix all errors before submitting')
      return
    }
    
    setLoading(true)
    
    try {
      // Prepare data for submission
      const submitData = {
        title: formData.title.trim(),
        big_idea: formData.big_idea.trim(),
        source: formData.source,
        is_active: formData.is_active,
        tasks: formData.tasks.map((task, index) => ({
          ...task,
          title: task.title.trim(),
          description: task.description.trim(),
          evidence_prompt: task.evidence_prompt.trim() || `Provide evidence for completing: ${task.title}`,
          materials_needed: task.materials_needed.filter(m => m.trim()),
          order_index: index + 1,
          task_order: index
        })),
        metadata: formData.metadata.location_type !== 'anywhere' ? formData.metadata : undefined
      }
      
      const response = await api.post('/v3/admin/quests/create-v3', submitData)
      
      toast.success('Quest created successfully!')
      onSuccess && onSuccess(response.data.quest)
      onClose()
    } catch (error) {
      console.error('Error creating quest:', error)
      const errorMessage = error.response?.data?.error || 'Failed to create quest'
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const addTask = () => {
    const newTask = {
      title: '',
      description: '',
      pillar: '',
      xp_value: 100,
      evidence_prompt: '',
      materials_needed: [],
      subcategory: '',
      order_index: formData.tasks.length + 1,
      task_order: formData.tasks.length
    }
    
    setFormData({
      ...formData,
      tasks: [...formData.tasks, newTask]
    })
  }

  const removeTask = (index) => {
    if (formData.tasks.length === 1) {
      toast.error('At least one task is required')
      return
    }
    
    const newTasks = formData.tasks.filter((_, i) => i !== index)
    // Reorder remaining tasks
    newTasks.forEach((task, i) => {
      task.order_index = i + 1
      task.task_order = i
    })
    
    setFormData({
      ...formData,
      tasks: newTasks
    })
  }

  const updateTask = (index, field, value) => {
    const newTasks = [...formData.tasks]
    newTasks[index] = {
      ...newTasks[index],
      [field]: value
    }
    
    setFormData({
      ...formData,
      tasks: newTasks
    })
    
    // Clear error for this field if it exists
    const errorKey = `task_${index}_${field}`
    if (errors[errorKey]) {
      const newErrors = { ...errors }
      delete newErrors[errorKey]
      setErrors(newErrors)
    }
  }

  const addMaterial = (taskIndex) => {
    const material = prompt('Enter material needed:')
    if (material) {
      updateTask(taskIndex, 'materials_needed', [...formData.tasks[taskIndex].materials_needed, material])
    }
  }

  const removeMaterial = (taskIndex, materialIndex) => {
    const newMaterials = formData.tasks[taskIndex].materials_needed.filter((_, i) => i !== materialIndex)
    updateTask(taskIndex, 'materials_needed', newMaterials)
  }

  const NewSourceForm = () => {
    const [newSource, setNewSource] = useState({ id: '', name: '' })
    
    const handleCreateSource = async () => {
      if (!newSource.id || !newSource.name) {
        toast.error('Source ID and name are required')
        return
      }
      
      try {
        const response = await api.post('/v3/admin/quest-sources', {
          id: newSource.id.toLowerCase().replace(/\s+/g, '_'),
          name: newSource.name
        })
        
        toast.success('Source created successfully')
        setSources([...sources, response.data.source])
        setFormData({ ...formData, source: response.data.source.id })
        setShowNewSourceForm(false)
        setNewSource({ id: '', name: '' })
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to create source')
      }
    }
    
    return (
      <div className="border rounded-lg p-4 mb-4 bg-gray-50">
        <h4 className="font-semibold mb-2">Create New Source</h4>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Source ID (e.g., khan_academy)"
            value={newSource.id}
            onChange={(e) => setNewSource({ ...newSource, id: e.target.value })}
            className="px-3 py-2 border rounded"
          />
          <input
            type="text"
            placeholder="Display Name"
            value={newSource.name}
            onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
            className="px-3 py-2 border rounded"
          />
        </div>
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={handleCreateSource}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Create Source
          </button>
          <button
            type="button"
            onClick={() => setShowNewSourceForm(false)}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
            Create New Quest
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          {/* Basic Information */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Quest Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => {
                  setFormData({ ...formData, title: e.target.value })
                  if (errors.title) {
                    setErrors({ ...errors, title: '' })
                  }
                }}
                className={`w-full px-3 py-2 border rounded-lg ${errors.title ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="e.g., Build a Community Garden"
              />
              {errors.title && (
                <p className="text-red-500 text-sm mt-1 flex items-center">
                  <AlertCircle size={16} className="mr-1" />
                  {errors.title}
                </p>
              )}
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Big Idea / Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.big_idea}
                onChange={(e) => {
                  setFormData({ ...formData, big_idea: e.target.value })
                  if (errors.big_idea) {
                    setErrors({ ...errors, big_idea: '' })
                  }
                }}
                className={`w-full px-3 py-2 border rounded-lg ${errors.big_idea ? 'border-red-500' : 'border-gray-300'}`}
                rows={3}
                placeholder="Describe the quest's main concept and goals"
              />
              {errors.big_idea && (
                <p className="text-red-500 text-sm mt-1 flex items-center">
                  <AlertCircle size={16} className="mr-1" />
                  {errors.big_idea}
                </p>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Source</label>
                {showNewSourceForm ? (
                  <NewSourceForm />
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={formData.source}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      className="flex-1 px-3 py-2 border rounded-lg"
                    >
                      {sources.map(source => (
                        <option key={source.id} value={source.id}>
                          {source.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNewSourceForm(true)}
                      className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <select
                  value={formData.is_active.toString()}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* Tasks Section */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Tasks</h3>
              <button
                type="button"
                onClick={addTask}
                className="px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90"
              >
                <Plus size={20} className="inline mr-1" />
                Add Task
              </button>
            </div>
            
            {formData.tasks.map((task, index) => (
              <div key={index} className="border rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-semibold">Task {index + 1}</h4>
                  {formData.tasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTask(index)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={task.title}
                      onChange={(e) => updateTask(index, 'title', e.target.value)}
                      className={`w-full px-3 py-2 border rounded ${errors[`task_${index}_title`] ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="Task title"
                    />
                    {errors[`task_${index}_title`] && (
                      <p className="text-red-500 text-xs mt-1">{errors[`task_${index}_title`]}</p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Pillar <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={task.pillar}
                      onChange={(e) => updateTask(index, 'pillar', e.target.value)}
                      className={`w-full px-3 py-2 border rounded ${errors[`task_${index}_pillar`] ? 'border-red-500' : 'border-gray-300'}`}
                    >
                      <option value="">Select a pillar</option>
                      {pillarOptions.map(pillar => (
                        <option key={pillar.value} value={pillar.value}>
                          {pillar.label}
                        </option>
                      ))}
                    </select>
                    {errors[`task_${index}_pillar`] && (
                      <p className="text-red-500 text-xs mt-1">{errors[`task_${index}_pillar`]}</p>
                    )}
                  </div>
                </div>
                
                <div className="mt-3">
                  <label className="block text-sm font-medium mb-1">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={task.description}
                    onChange={(e) => updateTask(index, 'description', e.target.value)}
                    className={`w-full px-3 py-2 border rounded ${errors[`task_${index}_description`] ? 'border-red-500' : 'border-gray-300'}`}
                    rows={2}
                    placeholder="Describe what the student needs to do"
                  />
                  {errors[`task_${index}_description`] && (
                    <p className="text-red-500 text-xs mt-1">{errors[`task_${index}_description`]}</p>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">XP Value</label>
                    <input
                      type="number"
                      value={task.xp_value}
                      onChange={(e) => updateTask(index, 'xp_value', parseInt(e.target.value) || 0)}
                      className={`w-full px-3 py-2 border rounded ${errors[`task_${index}_xp`] ? 'border-red-500' : 'border-gray-300'}`}
                      min="0"
                    />
                    {errors[`task_${index}_xp`] && (
                      <p className="text-red-500 text-xs mt-1">{errors[`task_${index}_xp`]}</p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Subcategory (Optional)</label>
                    <input
                      type="text"
                      value={task.subcategory}
                      onChange={(e) => updateTask(index, 'subcategory', e.target.value)}
                      className="w-full px-3 py-2 border rounded"
                      placeholder="e.g., Biology, Public Speaking"
                    />
                  </div>
                </div>
                
                <div className="mt-3">
                  <label className="block text-sm font-medium mb-1">Evidence Prompt</label>
                  <input
                    type="text"
                    value={task.evidence_prompt}
                    onChange={(e) => updateTask(index, 'evidence_prompt', e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="What evidence should students provide?"
                  />
                </div>
                
                <div className="mt-3">
                  <label className="block text-sm font-medium mb-1">Materials Needed</label>
                  <div className="flex flex-wrap gap-2">
                    {task.materials_needed.map((material, mIndex) => (
                      <span key={mIndex} className="px-3 py-1 bg-gray-100 rounded-full text-sm flex items-center">
                        {material}
                        <button
                          type="button"
                          onClick={() => removeMaterial(index, mIndex)}
                          className="ml-2 text-red-500 hover:text-red-700"
                        >
                          <X size={16} />
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => addMaterial(index)}
                      className="px-3 py-1 bg-gray-200 rounded-full text-sm hover:bg-gray-300"
                    >
                      <Plus size={16} className="inline" /> Add Material
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Metadata Section (Optional) */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4">Metadata (Optional)</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Location Type</label>
                <select
                  value={formData.metadata.location_type}
                  onChange={(e) => setFormData({
                    ...formData,
                    metadata: { ...formData.metadata, location_type: e.target.value }
                  })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {locationTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              
              {formData.metadata.location_type === 'specific_location' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">Venue Name</label>
                    <input
                      type="text"
                      value={formData.metadata.venue_name}
                      onChange={(e) => setFormData({
                        ...formData,
                        metadata: { ...formData.metadata, venue_name: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="e.g., Community Center"
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-2">Address</label>
                    <input
                      type="text"
                      value={formData.metadata.location_address}
                      onChange={(e) => setFormData({
                        ...formData,
                        metadata: { ...formData.metadata, location_address: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="Full address"
                    />
                  </div>
                </>
              )}
              
              <div>
                <label className="block text-sm font-medium mb-2">Seasonal Start Date</label>
                <input
                  type="date"
                  value={formData.metadata.seasonal_start}
                  onChange={(e) => setFormData({
                    ...formData,
                    metadata: { ...formData.metadata, seasonal_start: e.target.value }
                  })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Seasonal End Date</label>
                <input
                  type="date"
                  value={formData.metadata.seasonal_end}
                  onChange={(e) => setFormData({
                    ...formData,
                    metadata: { ...formData.metadata, seasonal_end: e.target.value }
                  })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
          </div>
          
          {/* Form Actions */}
          <div className="flex justify-end gap-4 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Quest'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default QuestCreationForm