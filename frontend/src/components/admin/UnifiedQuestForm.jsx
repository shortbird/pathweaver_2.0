import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronUp, Save, AlertCircle, Sparkles, Link as LinkIcon } from 'lucide-react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

const UnifiedQuestForm = ({ mode = 'create', quest = null, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false)
  const [sources, setSources] = useState([])
  const [availableSubjects, setAvailableSubjects] = useState([])
  const [showNewSourceForm, setShowNewSourceForm] = useState(false)
  const [errors, setErrors] = useState({})
  const [expandedTasks, setExpandedTasks] = useState({})
  const [showAIModal, setShowAIModal] = useState(false)
  const [AIModalComponent, setAIModalComponent] = useState(null)

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    big_idea: '',
    source: 'optio',
    material_link: '',  // NEW: Material link field
    is_active: true,
    tasks: [
      {
        title: '',
        description: '',
        pillar: '',
        subject_xp_distribution: {},  // NEW: XP distribution by subject
        evidence_prompt: '',
        materials_needed: [],
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

  // Initialize form data for edit mode or pre-filled create mode
  useEffect(() => {
    if ((mode === 'edit' || mode === 'create') && quest) {
      setFormData({
        title: quest.title || '',
        big_idea: quest.big_idea || quest.description || '',
        source: quest.source || 'optio',
        material_link: quest.material_link || '',
        is_active: quest.is_active !== undefined ? quest.is_active : true,
        tasks: quest.quest_tasks ? quest.quest_tasks.map((task, index) => ({
          title: task.title || '',
          description: task.description || '',
          pillar: task.pillar || '',
          subject_xp_distribution: task.subject_xp_distribution || {},
          evidence_prompt: task.evidence_prompt || '',
          materials_needed: task.materials_needed || [],
          order_index: task.order_index || index
        })) : [{
          title: '',
          description: '',
          pillar: '',
          subject_xp_distribution: {},
          evidence_prompt: '',
          materials_needed: [],
          order_index: 0
        }],
        metadata: quest.metadata || {
          location_type: 'anywhere',
          location_address: '',
          venue_name: '',
          seasonal_start: '',
          seasonal_end: ''
        }
      })

      // Expand all tasks for edit mode
      if (quest.quest_tasks) {
        const expanded = {}
        quest.quest_tasks.forEach((_, index) => {
          expanded[index] = true
        })
        setExpandedTasks(expanded)
      }
    }
  }, [mode, quest])

  // Pillar options (matching database enum values)
  const pillarOptions = [
    { value: 'stem_logic', label: 'STEM & Logic' },
    { value: 'life_wellness', label: 'Life & Wellness' },
    { value: 'language_communication', label: 'Language & Communication' },
    { value: 'society_culture', label: 'Society & Culture' },
    { value: 'arts_creativity', label: 'Arts & Creativity' }
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
    loadAIModalComponent()
  }, [])

  const loadAIModalComponent = async () => {
    try {
      const { default: AIQuestGenerationModal } = await import('./AIQuestGenerationModal')
      setAIModalComponent(() => AIQuestGenerationModal)
    } catch (error) {
      console.log('AI Modal not available:', error)
    }
  }

  const fetchSources = async () => {
    try {
      const response = await api.get('/api/v3/admin/quest-sources')
      setSources(response.data.sources || [])
    } catch (error) {
      console.error('Error fetching sources:', error)
      toast.error('Failed to load quest sources')
    }
  }

  const fetchSchoolSubjects = async () => {
    try {
      const response = await api.get('/api/v3/admin/school-subjects')
      if (response.data.success) {
        setAvailableSubjects(response.data.school_subjects || [])
      } else {
        // Fallback subjects
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

  const toggleTaskExpansion = (index) => {
    setExpandedTasks(prev => ({
      ...prev,
      [index]: !prev[index]
    }))
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
    }

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

      // Validate subject XP distribution
      const totalXP = Object.values(task.subject_xp_distribution).reduce((sum, xp) => sum + (xp || 0), 0)
      if (totalXP <= 0) {
        newErrors[`task_${index}_xp`] = 'Total XP must be greater than 0'
      }

      // Check that at least one subject has XP
      const hasValidSubjectXP = Object.keys(task.subject_xp_distribution).some(
        subject => task.subject_xp_distribution[subject] > 0
      )
      if (!hasValidSubjectXP) {
        newErrors[`task_${index}_subjects`] = 'At least one school subject must have XP assigned'
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
        material_link: formData.material_link.trim() || null,
        is_active: formData.is_active,
        tasks: formData.tasks.map((task, index) => {
          // Get selected subjects with XP > 0
          const selectedSubjects = Object.keys(task.subject_xp_distribution).filter(
            subject => task.subject_xp_distribution[subject] > 0
          )

          return {
            ...task,
            title: task.title.trim(),
            description: task.description.trim(),
            evidence_prompt: task.evidence_prompt.trim() || `Provide evidence for completing: ${task.title}`,
            materials_needed: task.materials_needed.filter(m => m.trim()),
            school_subjects: selectedSubjects,
            xp_amount: Object.values(task.subject_xp_distribution).reduce((sum, xp) => sum + (xp || 0), 0),
            order_index: index
          }
        }),
        metadata: formData.metadata.location_type !== 'anywhere' ? formData.metadata : undefined
      }

      const endpoint = mode === 'edit'
        ? `/api/v3/admin/quests/${quest.id}`
        : '/api/v3/admin/quests/create-v3'

      const method = mode === 'edit' ? 'put' : 'post'
      const response = await api[method](endpoint, submitData)

      toast.success(`Quest ${mode === 'edit' ? 'updated' : 'created'} successfully!`)
      onSuccess && onSuccess(response.data.quest)
      onClose()
    } catch (error) {
      console.error(`Error ${mode === 'edit' ? 'updating' : 'creating'} quest:`, error)
      const errorMessage = error.response?.data?.error || `Failed to ${mode === 'edit' ? 'update' : 'create'} quest`
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
      subject_xp_distribution: {},
      evidence_prompt: '',
      materials_needed: [],
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
    newTasks.forEach((task, i) => {
      task.order_index = i
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

    const errorKey = `task_${index}_${field}`
    if (errors[errorKey]) {
      const newErrors = { ...errors }
      delete newErrors[errorKey]
      setErrors(newErrors)
    }
  }

  const updateSubjectXP = (taskIndex, subject, xp) => {
    const newTasks = [...formData.tasks]
    const newDistribution = { ...newTasks[taskIndex].subject_xp_distribution }

    if (xp > 0) {
      newDistribution[subject] = parseInt(xp) || 0
    } else {
      delete newDistribution[subject]
    }

    newTasks[taskIndex].subject_xp_distribution = newDistribution

    setFormData({
      ...formData,
      tasks: newTasks
    })
  }

  const getTotalTaskXP = (task) => {
    if (!task.subject_xp_distribution) return 0
    return Object.values(task.subject_xp_distribution).reduce((sum, xp) => sum + (xp || 0), 0)
  }

  const handleAIQuestGenerated = (generatedQuest) => {
    // Ensure AI-generated tasks have all required fields
    const normalizedTasks = (generatedQuest.tasks || []).map((task, index) => ({
      title: task.title || '',
      description: task.description || '',
      pillar: task.pillar || 'life_wellness',
      subject_xp_distribution: task.subject_xp_distribution || {},
      evidence_prompt: task.evidence_prompt || `Provide evidence for completing: ${task.title}`,
      materials_needed: task.materials_needed || [],
      order_index: index
    }))

    setFormData({
      title: generatedQuest.title || '',
      big_idea: generatedQuest.big_idea || '',
      source: 'optio',
      material_link: '',
      is_active: true,
      tasks: normalizedTasks,
      metadata: {
        location_type: 'anywhere',
        location_address: '',
        venue_name: '',
        seasonal_start: '',
        seasonal_end: ''
      }
    })

    setErrors({})

    const expanded = {}
    generatedQuest.tasks?.forEach((_, index) => {
      expanded[index] = true
    })
    setExpandedTasks(expanded)

    toast.success('AI-generated quest loaded! Review and modify as needed.')
  }

  // Component render helpers
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
      <div className="w-full h-px bg-gradient-to-r from-[#ef597b] to-[#6d469b] mb-6"></div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
            {mode === 'edit' ? 'Edit Quest' : 'Create New Quest'}
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
                className="flex items-center space-x-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
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

            <div>
              <OptionalFieldLabel>Material Link</OptionalFieldLabel>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  type="url"
                  value={formData.material_link}
                  onChange={(e) => setFormData({ ...formData, material_link: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 border rounded-lg border-gray-200 bg-gray-50/50 transition-all focus:bg-white focus:border-gray-400"
                  placeholder="https://example.com/materials (optional)"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Link to external materials, resources, or websites students will need
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Source</label>
                <select
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {sources.map(source => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
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
            description="Define what students need to accomplish with XP distribution"
            required
          />

          <div className="space-y-6">
            {formData.tasks.map((task, index) => (
              <div key={index} className="border-2 border-gray-100 rounded-xl p-6 hover:border-purple-200 transition-colors">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-800">Task {index + 1}</h4>
                    <p className="text-sm text-gray-500">
                      Total XP: <span className="font-bold text-purple-600">{getTotalTaskXP(task)}</span>
                    </p>
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

                {/* Essential Fields */}
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

                  {/* Subject XP Distribution */}
                  <div>
                    <RequiredFieldLabel>School Subject Credits & XP Distribution</RequiredFieldLabel>
                    <div className="text-xs text-gray-500 mb-3">
                      Assign XP points to each school subject this task covers. Total will determine the task's overall XP value.
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 border rounded-lg bg-gray-50">
                      {availableSubjects.map(subject => (
                        <div key={subject.key} className="flex items-center space-x-3 p-3 bg-white rounded-lg shadow-sm">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900 text-sm">{subject.name}</div>
                            <div className="text-xs text-gray-500">{subject.description}</div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              value={task.subject_xp_distribution[subject.key] || ''}
                              onChange={(e) => updateSubjectXP(index, subject.key, e.target.value)}
                              className="w-16 px-2 py-1 text-sm border rounded text-center"
                              placeholder="0"
                              min="0"
                              step="25"
                            />
                            <span className="text-xs text-gray-500">XP</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* XP Summary */}
                    <div className="mt-3 p-3 bg-purple-50 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-purple-800">Total Task XP:</span>
                        <span className="text-lg font-bold text-purple-600">{getTotalTaskXP(task)}</span>
                      </div>
                      {Object.keys(task.subject_xp_distribution).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {Object.entries(task.subject_xp_distribution)
                            .filter(([_, xp]) => xp > 0)
                            .map(([subject, xp]) => {
                              const subjectInfo = availableSubjects.find(s => s.key === subject)
                              return (
                                <span key={subject} className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-full">
                                  {subjectInfo?.name || subject}: {xp} XP
                                </span>
                              )
                            })}
                        </div>
                      )}
                    </div>

                    {errors[`task_${index}_xp`] && (
                      <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-700 text-sm flex items-center">
                          <AlertCircle size={16} className="mr-2 flex-shrink-0" />
                          {errors[`task_${index}_xp`]}
                        </p>
                      </div>
                    )}

                    {errors[`task_${index}_subjects`] && (
                      <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-700 text-sm flex items-center">
                          <AlertCircle size={16} className="mr-2 flex-shrink-0" />
                          {errors[`task_${index}_subjects`]}
                        </p>
                      </div>
                    )}
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
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Add Task Button */}
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={addTask}
                className="px-6 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90 transition-all shadow-md hover:shadow-lg"
              >
                <Plus size={20} className="inline mr-2" />
                Add Another Task
              </button>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-4 pt-8 border-t">
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
              {loading ? (mode === 'edit' ? 'Updating...' : 'Creating...') : (mode === 'edit' ? 'Update Quest' : 'Create Quest')}
            </button>
          </div>
        </form>
      </div>

      {/* AI Quest Generation Modal */}
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

export default UnifiedQuestForm