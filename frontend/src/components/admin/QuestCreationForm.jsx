import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronUp, Save, AlertCircle, Sparkles } from 'lucide-react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

const QuestCreationForm = ({ onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false)
  const [sources, setSources] = useState([])
  const [availableSubjects, setAvailableSubjects] = useState([])
  const [showNewSourceForm, setShowNewSourceForm] = useState(false)
  const [errors, setErrors] = useState({})
  const [expandedTasks, setExpandedTasks] = useState({})
  const [showAIModal, setShowAIModal] = useState(false)
  const [AIModalComponent, setAIModalComponent] = useState(null)
  
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
        school_subjects: [],
        subject_xp_distribution: {},
        order_index: 0
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
    fetchSchoolSubjects()
    // Try to load AI Modal component
    loadAIModalComponent()
  }, [])

  const loadAIModalComponent = async () => {
    try {
      const { default: AIQuestGenerationModal } = await import('./AIQuestGenerationModal')
      setAIModalComponent(() => AIQuestGenerationModal)
    } catch (error) {
    }
  }

  const toggleTaskExpansion = (index) => {
    setExpandedTasks(prev => ({
      ...prev,
      [index]: !prev[index]
    }))
  }

  // Enhanced field components
  const RequiredFieldLabel = ({ children }) => (
    <label className="block text-sm font-semibold mb-2 text-gray-800">
      {children}
      <span className="text-red-500 font-bold ml-1">*</span>
      <span className="text-xs font-normal text-gray-500 ml-1">(Required)</span>
    </label>
  )

  const OptionalFieldLabel = ({ children }) => (
    <label className="block text-sm font-medium mb-2 text-gray-600">
      {children}
      <span className="text-xs text-gray-400 ml-1">(Optional)</span>
    </label>
  )

  const SectionHeader = ({ title, description, required = false, children }) => (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-800 flex items-center">
            {title}
            {required && (
              <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                Required
              </span>
            )}
          </h3>
          {description && (
            <p className="text-gray-600 text-sm mt-1">{description}</p>
          )}
        </div>
        {children}
      </div>
      <div className="w-full h-px bg-gradient-primary mb-6"></div>
    </div>
  )

  const fetchSources = async () => {
    try {
      const response = await api.get('/api/admin/quest-sources')
      setSources(response.data.sources || [])
    } catch (error) {
      console.error('Error fetching sources:', error)
      toast.error('Failed to load quest sources')
    }
  }

  const fetchSchoolSubjects = async () => {
    try {
      const response = await api.get('/api/admin/school-subjects')
      if (response.data.success) {
        setAvailableSubjects(response.data.school_subjects || [])
      } else {
        // Fallback subjects if API fails
        setAvailableSubjects([
          { key: 'language_arts', name: 'Language Arts', description: 'Reading, writing, literature, and language skills' },
          { key: 'math', name: 'Math', description: 'Mathematics, algebra, geometry, statistics' },
          { key: 'science', name: 'Science', description: 'Biology, chemistry, physics, earth science' },
          { key: 'social_studies', name: 'Social Studies', description: 'History, geography, civics, government' },
          { key: 'financial_literacy', name: 'Financial Literacy', description: 'Personal finance, budgeting, investing' },
          { key: 'health', name: 'Health', description: 'Health education, nutrition, wellness' },
          { key: 'pe', name: 'PE', description: 'Physical education, sports, fitness' },
          { key: 'fine_arts', name: 'Fine Arts', description: 'Visual arts, music, theater, dance' },
          { key: 'cte', name: 'CTE', description: 'Career and technical education, vocational skills' },
          { key: 'digital_literacy', name: 'Digital Literacy', description: 'Technology skills, computer science' },
          { key: 'electives', name: 'Electives', description: 'Specialized interests and supplemental learning' }
        ])
      }
    } catch (error) {
      console.error('Error fetching school subjects:', error)
      // Use fallback subjects
      setAvailableSubjects([
        { key: 'language_arts', name: 'Language Arts', description: 'Reading, writing, literature, and language skills' },
        { key: 'math', name: 'Math', description: 'Mathematics, algebra, geometry, statistics' },
        { key: 'science', name: 'Science', description: 'Biology, chemistry, physics, earth science' },
        { key: 'social_studies', name: 'Social Studies', description: 'History, geography, civics, government' },
        { key: 'financial_literacy', name: 'Financial Literacy', description: 'Personal finance, budgeting, investing' },
        { key: 'health', name: 'Health', description: 'Health education, nutrition, wellness' },
        { key: 'pe', name: 'PE', description: 'Physical education, sports, fitness' },
        { key: 'fine_arts', name: 'Fine Arts', description: 'Visual arts, music, theater, dance' },
        { key: 'cte', name: 'CTE', description: 'Career and technical education, vocational skills' },
        { key: 'digital_literacy', name: 'Digital Literacy', description: 'Technology skills, computer science' },
        { key: 'electives', name: 'Electives', description: 'Specialized interests and supplemental learning' }
      ])
    }
  }

  const validateForm = () => {
    const newErrors = {}
    
    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
    }
    
    // Validate tasks (at least one required)
    if (formData.tasks.length === 0) {
      newErrors.tasks = 'At least one task is required'
    }
    
    formData.tasks.forEach((task, index) => {
      if (!task.title.trim()) {
        newErrors[`task_${index}_title`] = 'Task title is required'
      }
      if (!task.pillar) {
        newErrors[`task_${index}_pillar`] = 'Pillar is required'
      }
      if (!task.school_subjects || task.school_subjects.length === 0) {
        newErrors[`task_${index}_school_subjects`] = 'At least one school subject is required'
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
          order_index: index
        })),
        metadata: formData.metadata.location_type !== 'anywhere' ? formData.metadata : undefined
      }
      
      const response = await api.post('/api/admin/quests/create', submitData)
      
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
      school_subjects: [],
      subject_xp_distribution: {},
      order_index: formData.tasks.length
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
      task.order_index = i
    })
    
    setFormData({
      ...formData,
      tasks: newTasks
    })
  }

  const handleAIQuestGenerated = (generatedQuest) => {
    // Update form with AI generated quest data
    setFormData({
      title: generatedQuest.title || '',
      big_idea: generatedQuest.big_idea || '',
      source: 'optio',
      is_active: true,
      tasks: generatedQuest.tasks || [],
      metadata: {
        location_type: 'anywhere',
        location_address: '',
        venue_name: '',
        seasonal_start: '',
        seasonal_end: ''
      }
    })
    
    // Clear any existing errors
    setErrors({})
    
    // Expand all tasks so user can review
    const expanded = {}
    generatedQuest.tasks?.forEach((_, index) => {
      expanded[index] = true
    })
    setExpandedTasks(expanded)
    
    toast.success('AI-generated quest loaded! Review and modify as needed.')
  }

  const updateTask = (index, field, value) => {
    const newTasks = [...formData.tasks]
    newTasks[index] = {
      ...newTasks[index],
      [field]: value
    }
    
    // Clear school subjects if pillar changes to encourage re-selection
    if (field === 'pillar') {
      newTasks[index].school_subjects = []
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
        const response = await api.post('/api/admin/quest-sources', {
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
          <h2 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
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
          <SectionHeader 
            title="Quest Details" 
            description="Basic information about your quest"
            required
          >
            {AIModalComponent && (
              <button
                type="button"
                onClick={() => setShowAIModal(true)}
                className="flex items-center space-x-2 bg-gradient-primary text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
              >
                <Sparkles className="h-4 w-4" />
                <span>AI Assist</span>
              </button>
            )}
          </SectionHeader>
          
          <div className="space-y-6 mb-8">
            <div>
              <RequiredFieldLabel>Quest Title</RequiredFieldLabel>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => {
                  setFormData({ ...formData, title: e.target.value })
                  if (errors.title) {
                    setErrors({ ...errors, title: '' })
                  }
                }}
                className={`w-full px-4 py-3 border-2 rounded-lg transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 ${errors.title ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="e.g., Build a Community Garden"
              />
              <p className="text-xs text-gray-500 mt-1">
                Create an engaging title that clearly describes what students will accomplish
              </p>
              {errors.title && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm flex items-center">
                    <AlertCircle size={16} className="mr-2 flex-shrink-0" />
                    {errors.title}
                  </p>
                  <p className="text-red-600 text-xs mt-1 ml-6">
                    💡 Tip: Quest titles should be descriptive and engaging (5-50 characters)
                  </p>
                </div>
              )}
            </div>
            
            <div>
              <OptionalFieldLabel>Big Idea / Description</OptionalFieldLabel>
              <textarea
                value={formData.big_idea}
                onChange={(e) => {
                  setFormData({ ...formData, big_idea: e.target.value })
                  if (errors.big_idea) {
                    setErrors({ ...errors, big_idea: '' })
                  }
                }}
                className="w-full px-3 py-2 border rounded-lg border-gray-200 bg-gray-50/50 transition-all focus:bg-white focus:border-gray-400"
                rows={3}
                placeholder="Describe the quest's main concept and learning goals (optional)"
              />
              <p className="text-xs text-gray-500 mt-1">
                Provide context about why this quest matters and what students will gain
              </p>
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
          <SectionHeader 
            title="Learning Tasks" 
            description="Define what students need to accomplish"
            required
          />
            
          <div className="space-y-6">
            {formData.tasks.map((task, index) => (
              <div key={index} className="border-2 border-gray-100 rounded-xl p-6 hover:border-purple-200 transition-colors">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-800">Task {index + 1}</h4>
                    <p className="text-sm text-gray-500">Define what students need to accomplish</p>
                  </div>
                  {formData.tasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTask(index)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      title="Remove this task"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
                
                {/* Essential Fields - Always Visible */}
                <div className="space-y-4 mb-6">
                  <div>
                    <RequiredFieldLabel>Task Title</RequiredFieldLabel>
                    <input
                      type="text"
                      value={task.title}
                      onChange={(e) => updateTask(index, 'title', e.target.value)}
                      className={`w-full px-4 py-3 border-2 rounded-lg transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 ${errors[`task_${index}_title`] ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="e.g., Research local plant species"
                    />
                    {errors[`task_${index}_title`] && (
                      <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-700 text-sm flex items-center">
                          <AlertCircle size={16} className="mr-2 flex-shrink-0" />
                          {errors[`task_${index}_title`]}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <RequiredFieldLabel>Learning Pillar</RequiredFieldLabel>
                      <select
                        value={task.pillar}
                        onChange={(e) => updateTask(index, 'pillar', e.target.value)}
                        className={`w-full px-4 py-3 border-2 rounded-lg transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 ${errors[`task_${index}_pillar`] ? 'border-red-500' : 'border-gray-300'}`}
                      >
                        <option value="">Choose a learning pillar...</option>
                        {pillarOptions.map(pillar => (
                          <option key={pillar.value} value={pillar.value}>
                            {pillar.label}
                          </option>
                        ))}
                      </select>
                      {errors[`task_${index}_pillar`] && (
                        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-red-700 text-sm flex items-center">
                            <AlertCircle size={16} className="mr-2 flex-shrink-0" />
                            {errors[`task_${index}_pillar`]}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <RequiredFieldLabel>School Subjects (Diploma Credit)</RequiredFieldLabel>
                      <div className="text-xs text-gray-500 mb-3">
                        Select which school subjects this task provides credit for (appears on diplomas)
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-32 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                        {availableSubjects.map(subject => (
                          <label key={subject.key} className="flex items-start space-x-2 text-sm cursor-pointer hover:bg-white p-2 rounded transition-colors">
                            <input
                              type="checkbox"
                              checked={task.school_subjects?.includes(subject.key) || false}
                              onChange={(e) => {
                                const currentSubjects = task.school_subjects || []
                                let newSubjects
                                if (e.target.checked) {
                                  newSubjects = [...currentSubjects, subject.key]
                                } else {
                                  newSubjects = currentSubjects.filter(s => s !== subject.key)
                                }
                                updateTask(index, 'school_subjects', newSubjects)
                              }}
                              className="mt-0.5 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                            />
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">{subject.name}</div>
                              <div className="text-xs text-gray-500 leading-tight">{subject.description}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                      {task.school_subjects && task.school_subjects.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {task.school_subjects.map(subjectKey => {
                            const subject = availableSubjects.find(s => s.key === subjectKey)
                            return subject ? (
                              <span key={subjectKey} className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-full">
                                {subject.name}
                              </span>
                            ) : null
                          })}
                        </div>
                      )}

                      {/* Subject XP Distribution */}
                      {task.school_subjects && task.school_subjects.length > 0 && (
                        <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                          <OptionalFieldLabel>Subject XP Distribution</OptionalFieldLabel>
                          <div className="text-xs text-gray-600 mb-3">
                            Specify how much XP each subject should receive (for diploma credits). Total can be different from pillar XP.
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {task.school_subjects.map(subjectKey => {
                              const subject = availableSubjects.find(s => s.key === subjectKey)
                              const currentDistribution = task.subject_xp_distribution || {}
                              return subject ? (
                                <div key={subjectKey} className="flex items-center space-x-2">
                                  <label className="text-sm font-medium text-gray-700 min-w-0 flex-1">
                                    {subject.name}:
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="10"
                                    value={currentDistribution[subjectKey] || 0}
                                    onChange={(e) => {
                                      const newDistribution = { ...currentDistribution }
                                      const value = parseInt(e.target.value) || 0
                                      if (value > 0) {
                                        newDistribution[subjectKey] = value
                                      } else {
                                        delete newDistribution[subjectKey]
                                      }
                                      updateTask(index, 'subject_xp_distribution', newDistribution)
                                    }}
                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                                    placeholder="0"
                                  />
                                  <span className="text-xs text-gray-500">XP</span>
                                </div>
                              ) : null
                            })}
                          </div>
                          <div className="mt-2 text-xs text-gray-500">
                            Leave at 0 to not award XP for that subject. You can distribute XP differently than the main pillar XP.
                          </div>
                        </div>
                      )}
                      {errors[`task_${index}_school_subjects`] && (
                        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-red-700 text-sm flex items-center">
                            <AlertCircle size={16} className="mr-2 flex-shrink-0" />
                            {errors[`task_${index}_school_subjects`]}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <RequiredFieldLabel>XP Reward</RequiredFieldLabel>
                      <input
                        type="number"
                        value={task.xp_value}
                        onChange={(e) => updateTask(index, 'xp_value', parseInt(e.target.value) || 0)}
                        className={`w-full px-4 py-3 border-2 rounded-lg transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 ${errors[`task_${index}_xp`] ? 'border-red-500' : 'border-gray-300'}`}
                        min="0"
                        step="50"
                        placeholder="100"
                      />
                      <p className="text-xs text-gray-500 mt-1">Points awarded for completion</p>
                      {errors[`task_${index}_xp`] && (
                        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-red-700 text-sm flex items-center">
                            <AlertCircle size={16} className="mr-2 flex-shrink-0" />
                            {errors[`task_${index}_xp`]}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Expandable Additional Details */}
                <div className="border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    onClick={() => toggleTaskExpansion(index)}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-800 transition-colors mb-3"
                  >
                    {expandedTasks[index] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    <span className="ml-1">
                      {expandedTasks[index] ? 'Hide' : 'Show'} additional options
                    </span>
                    <span className="ml-1 text-gray-400">(description, evidence prompt, materials)</span>
                  </button>
                  
                  {expandedTasks[index] && (
                    <div className="space-y-4 animate-in slide-in-from-top-5 duration-200">
                      <div>
                        <OptionalFieldLabel>Task Description</OptionalFieldLabel>
                        <textarea
                          value={task.description}
                          onChange={(e) => updateTask(index, 'description', e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg border-gray-200 bg-gray-50/50 transition-all focus:bg-white focus:border-gray-400"
                          rows={3}
                          placeholder="Provide detailed instructions for students (optional)"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Help students understand exactly what they need to do
                        </p>
                      </div>

                      <div>
                        <OptionalFieldLabel>Evidence Prompt</OptionalFieldLabel>
                        <input
                          type="text"
                          value={task.evidence_prompt}
                          onChange={(e) => updateTask(index, 'evidence_prompt', e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg border-gray-200 bg-gray-50/50 transition-all focus:bg-white focus:border-gray-400"
                          placeholder="What should students submit as proof? (photos, videos, documents, etc.)"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          If left blank, a default prompt will be generated
                        </p>
                      </div>

                      <div>
                        <OptionalFieldLabel>Materials Needed</OptionalFieldLabel>
                        
                        {/* Existing materials */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          {(task.materials_needed || []).map((material, mIndex) => (
                            <span 
                              key={mIndex} 
                              className="inline-flex items-center px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm"
                            >
                              {material}
                              <button
                                type="button"
                                onClick={() => removeMaterial(index, mIndex)}
                                className="ml-2 text-purple-600 hover:text-purple-800 transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </span>
                          ))}
                        </div>

                        {/* Add new material */}
                        <button
                          type="button"
                          onClick={() => addMaterial(index)}
                          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all text-sm"
                        >
                          <Plus size={16} className="inline mr-1" /> Add Material
                        </button>
                        <p className="text-xs text-gray-500 mt-1">
                          List any physical items or resources students will need
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {/* Add Task Button - Below all tasks */}
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={addTask}
                className="px-6 py-3 bg-gradient-primary text-white rounded-lg hover:opacity-90 transition-all shadow-md hover:shadow-lg"
              >
                <Plus size={20} className="inline mr-2" />
                Add Another Task
              </button>
            </div>
          </div>
          
          {/* Metadata Section (Optional) */}
          <SectionHeader 
            title="Quest Metadata" 
            description="Optional settings for location and timing"
          />
            
          <div className="space-y-6 mb-8">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <OptionalFieldLabel>Location Type</OptionalFieldLabel>
                <select
                  value={formData.metadata.location_type}
                  onChange={(e) => setFormData({
                    ...formData,
                    metadata: { ...formData.metadata, location_type: e.target.value }
                  })}
                  className="w-full px-3 py-2 border rounded-lg border-gray-200 bg-gray-50/50 transition-all focus:bg-white focus:border-gray-400"
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
                    <OptionalFieldLabel>Venue Name</OptionalFieldLabel>
                    <input
                      type="text"
                      value={formData.metadata.venue_name}
                      onChange={(e) => setFormData({
                        ...formData,
                        metadata: { ...formData.metadata, venue_name: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg border-gray-200 bg-gray-50/50 transition-all focus:bg-white focus:border-gray-400"
                      placeholder="e.g., Community Center"
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <OptionalFieldLabel>Address</OptionalFieldLabel>
                    <input
                      type="text"
                      value={formData.metadata.location_address}
                      onChange={(e) => setFormData({
                        ...formData,
                        metadata: { ...formData.metadata, location_address: e.target.value }
                      })}
                      className="w-full px-3 py-2 border rounded-lg border-gray-200 bg-gray-50/50 transition-all focus:bg-white focus:border-gray-400"
                      placeholder="Full address"
                    />
                  </div>
                </>
              )}
              
              <div>
                <OptionalFieldLabel>Seasonal Start Date</OptionalFieldLabel>
                <input
                  type="date"
                  value={formData.metadata.seasonal_start}
                  onChange={(e) => setFormData({
                    ...formData,
                    metadata: { ...formData.metadata, seasonal_start: e.target.value }
                  })}
                  className="w-full px-3 py-2 border rounded-lg border-gray-200 bg-gray-50/50 transition-all focus:bg-white focus:border-gray-400"
                />
              </div>
              
              <div>
                <OptionalFieldLabel>Seasonal End Date</OptionalFieldLabel>
                <input
                  type="date"
                  value={formData.metadata.seasonal_end}
                  onChange={(e) => setFormData({
                    ...formData,
                    metadata: { ...formData.metadata, seasonal_end: e.target.value }
                  })}
                  className="w-full px-3 py-2 border rounded-lg border-gray-200 bg-gray-50/50 transition-all focus:bg-white focus:border-gray-400"
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
              className="px-6 py-2 bg-gradient-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Quest'}
            </button>
          </div>
        </form>
      </div>

      {/* AI Quest Generation Modal - conditionally rendered */}
      {AIModalComponent && (
        <AIModalComponent
          isOpen={showAIModal}
          onClose={() => setShowAIModal(false)}
          onQuestGenerated={handleAIQuestGenerated}
        />
      )}
    </div>
  )
}

export default QuestCreationForm