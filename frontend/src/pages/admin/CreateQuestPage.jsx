import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { PILLAR_KEYS, getPillarData, getAllPillars } from '../../utils/pillarMappings';
import { ChevronDown, ChevronUp, Plus, Trash2, MapPin, Calendar, Users, Sparkles, Save, X } from 'lucide-react';

const CreateQuestPage = () => {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, loading, navigate]);
  
  // Quest basic info
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Life Skills');
  const [difficultyTier, setDifficultyTier] = useState(2);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  
  // Location features
  const [locationType, setLocationType] = useState('anywhere');
  const [locationAddress, setLocationAddress] = useState('');
  const [venueName, setVenueName] = useState('');
  const [locationRadius, setLocationRadius] = useState(5);
  
  // Time and requirements
  const [estimatedHours, setEstimatedHours] = useState('');
  const [materialsNeeded, setMaterialsNeeded] = useState([]);
  const [materialInput, setMaterialInput] = useState('');
  const [prerequisites, setPrerequisites] = useState([]);
  
  // Seasonal
  const [isSeasonal, setIsSeasonal] = useState(false);
  const [seasonalStart, setSeasonalStart] = useState('');
  const [seasonalEnd, setSeasonalEnd] = useState('');
  
  // Collaboration
  const [teamSizeLimit, setTeamSizeLimit] = useState(5);
  const [collaborationPrompts, setCollaborationPrompts] = useState([]);
  const [promptInput, setPromptInput] = useState('');
  
  // Tasks
  const [tasks, setTasks] = useState([{
    title: '',
    description: '',
    pillar: 'life_wellness',
    subcategory: '',
    xp_value: 100,
    evidence_prompt: '',
    evidence_types: ['text', 'image'],
    collaboration_eligible: true,
    location_required: false,
    is_optional: false,
    order_index: 1
  }]);
  
  // UI state
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    tasks: true,
    location: false,
    time: false,
    collaboration: false,
    advanced: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const categories = [
    'Creative Arts',
    'STEM',
    'Life Skills',
    'Social Impact',
    'Entrepreneurship',
    'Sports & Wellness'
  ];

  const evidenceTypes = [
    { value: 'text', label: 'Text', icon: '📝' },
    { value: 'image', label: 'Image', icon: '📷' },
    { value: 'video_link', label: 'Video Link', icon: '🎥' },
    { value: 'document', label: 'Document', icon: '📄' },
    { value: 'link', label: 'Link', icon: '🔗' }
  ];

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const addTask = () => {
    setTasks([...tasks, {
      title: '',
      description: '',
      pillar: 'life_wellness',
      subcategory: '',
      xp_value: 100,
      evidence_prompt: '',
      evidence_types: ['text', 'image'],
      collaboration_eligible: true,
      location_required: false,
      is_optional: false,
      order_index: tasks.length + 1
    }]);
  };

  const updateTask = (index, field, value) => {
    const updatedTasks = [...tasks];
    updatedTasks[index][field] = value;
    setTasks(updatedTasks);
  };

  const removeTask = (index) => {
    if (tasks.length > 1) {
      const updatedTasks = tasks.filter((_, i) => i !== index);
      // Reorder remaining tasks
      updatedTasks.forEach((task, i) => {
        task.order_index = i + 1;
      });
      setTasks(updatedTasks);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const addMaterial = () => {
    if (materialInput.trim() && !materialsNeeded.includes(materialInput.trim())) {
      setMaterialsNeeded([...materialsNeeded, materialInput.trim()]);
      setMaterialInput('');
    }
  };

  const removeMaterial = (material) => {
    setMaterialsNeeded(materialsNeeded.filter(m => m !== material));
  };

  const addPrompt = () => {
    if (promptInput.trim() && !collaborationPrompts.includes(promptInput.trim())) {
      setCollaborationPrompts([...collaborationPrompts, promptInput.trim()]);
      setPromptInput('');
    }
  };

  const removePrompt = (prompt) => {
    setCollaborationPrompts(collaborationPrompts.filter(p => p !== prompt));
  };

  const calculateTotalXP = () => {
    const baseXP = tasks.reduce((sum, task) => sum + (task.xp_value || 0), 0);
    const completionBonus = Math.round(baseXP * 0.5);
    return { baseXP, completionBonus, total: baseXP + completionBonus };
  };

  const getPillarBreakdown = () => {
    const breakdown = {};
    tasks.forEach(task => {
      if (!breakdown[task.pillar]) {
        breakdown[task.pillar] = 0;
      }
      breakdown[task.pillar] += task.xp_value || 0;
    });
    return breakdown;
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!title.trim()) newErrors.title = 'Title is required';
    if (!description.trim()) newErrors.description = 'Description is required';
    
    // Validate tasks
    tasks.forEach((task, index) => {
      if (!task.title.trim()) {
        newErrors[`task_${index}_title`] = 'Task title is required';
      }
      if (!task.description.trim()) {
        newErrors[`task_${index}_description`] = 'Task description is required';
      }
      if (!task.evidence_prompt.trim()) {
        newErrors[`task_${index}_evidence`] = 'Evidence prompt is required';
      }
    });
    
    // Validate location if specific
    if (locationType === 'specific_location' && !locationAddress.trim()) {
      newErrors.locationAddress = 'Address is required for specific locations';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      const questData = {
        title,
        description,
        big_idea: description,
        source: 'admin',
        is_active: true,
        
        // Tasks
        tasks: tasks.map((task, index) => ({
          ...task,
          order_index: index + 1,
          xp_amount: task.xp_value, // Backend expects xp_amount
          task_order: index // Legacy field
        })),
        
        // Metadata
        metadata: {
          category,
          difficulty_tier: difficultyTier,
          tags,
          estimated_hours: estimatedHours,
          materials_needed: materialsNeeded,
          team_size_limit: teamSizeLimit,
          collaboration_prompts: collaborationPrompts,
          
          // Location
          location_type: locationType,
          location_address: locationAddress,
          venue_name: venueName,
          location_radius_km: locationRadius,
          
          // Seasonal
          seasonal_start: isSeasonal ? seasonalStart : null,
          seasonal_end: isSeasonal ? seasonalEnd : null,
          
          prerequisites
        }
      };

      const response = await api.post('/api/v3/admin/quests/create', questData);
      
      if (response.data.success) {
        navigate(`/quests/${response.data.quest_id}`);
      }
    } catch (error) {
      console.error('Error creating quest:', error);
      alert('Failed to create quest. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  const xpInfo = calculateTotalXP();
  const pillarBreakdown = getPillarBreakdown();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#6d469b]/5 via-white to-[#ef597b]/5 py-8">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
              Create New Quest
            </h1>
            <button
              onClick={() => navigate('/admin')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-gray-600" />
            </button>
          </div>
          
          {/* XP Summary */}
          <div className="flex items-center gap-6 p-4 bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-lg">
            <div>
              <p className="text-sm text-gray-600">Base XP</p>
              <p className="text-xl font-bold text-gray-900">{xpInfo.baseXP}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Completion Bonus</p>
              <p className="text-xl font-bold text-green-600">+{xpInfo.completionBonus}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total XP</p>
              <p className="text-2xl font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
                {xpInfo.total}
              </p>
            </div>
            <div className="ml-auto flex gap-2">
              {Object.entries(pillarBreakdown).map(([pillar, xp]) => {
                const pillarData = getPillarData(pillar);
                return (
                  <div key={pillar} className={`px-3 py-1 rounded-full ${pillarData.bg} ${pillarData.text} text-sm font-medium`}>
                    {pillarData.name}: {xp} XP
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Basic Information Section */}
        <div className="bg-white rounded-xl shadow-lg mb-6 overflow-hidden">
          <button
            onClick={() => toggleSection('basic')}
            className="w-full px-6 py-4 bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 flex items-center justify-between hover:bg-gradient-to-r hover:from-[#ef597b]/20 hover:to-[#6d469b]/20 transition-colors"
          >
            <h2 className="text-xl font-bold text-gray-900">Basic Information</h2>
            {expandedSections.basic ? <ChevronUp /> : <ChevronDown />}
          </button>
          
          {expandedSections.basic && (
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quest Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#6d469b] focus:border-transparent ${
                    errors.title ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="e.g., Build a Community Garden"
                />
                {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#6d469b] focus:border-transparent ${
                    errors.description ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="What will students create or accomplish in this quest?"
                />
                {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Difficulty Tier (1-5)
                  </label>
                  <select
                    value={difficultyTier}
                    onChange={(e) => setDifficultyTier(Number(e.target.value))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
                  >
                    {[1, 2, 3, 4, 5].map(tier => (
                      <option key={tier} value={tier}>
                        Tier {tier} {tier === 1 ? '(Beginner)' : tier === 5 ? '(Expert)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tags
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
                    placeholder="Add a tag and press Enter"
                  />
                  <button
                    onClick={addTag}
                    className="px-4 py-2 bg-[#6d469b] text-white rounded-lg hover:bg-[#5a3784] transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-gray-100 rounded-full text-sm flex items-center gap-1"
                    >
                      {tag}
                      <button
                        onClick={() => removeTag(tag)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tasks Section */}
        <div className="bg-white rounded-xl shadow-lg mb-6 overflow-hidden">
          <button
            onClick={() => toggleSection('tasks')}
            className="w-full px-6 py-4 bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 flex items-center justify-between hover:bg-gradient-to-r hover:from-[#ef597b]/20 hover:to-[#6d469b]/20 transition-colors"
          >
            <h2 className="text-xl font-bold text-gray-900">Tasks ({tasks.length})</h2>
            {expandedSections.tasks ? <ChevronUp /> : <ChevronDown />}
          </button>
          
          {expandedSections.tasks && (
            <div className="p-6">
              {tasks.map((task, index) => (
                <div key={index} className="mb-6 p-4 border-2 border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Task {index + 1}
                    </h3>
                    {tasks.length > 1 && (
                      <button
                        onClick={() => removeTask(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Task Title *
                      </label>
                      <input
                        type="text"
                        value={task.title}
                        onChange={(e) => updateTask(index, 'title', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#6d469b] ${
                          errors[`task_${index}_title`] ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder="e.g., Research Local Growing Conditions"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        XP Value
                      </label>
                      <input
                        type="number"
                        value={task.xp_value}
                        onChange={(e) => updateTask(index, 'xp_value', Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b]"
                        min="25"
                        max="500"
                        step="25"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Task Description *
                      </label>
                      <textarea
                        value={task.description}
                        onChange={(e) => updateTask(index, 'description', e.target.value)}
                        rows={2}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#6d469b] ${
                          errors[`task_${index}_description`] ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder="Clear instructions on what to create/do"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Pillar
                      </label>
                      <select
                        value={task.pillar}
                        onChange={(e) => updateTask(index, 'pillar', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b]"
                      >
                        {PILLAR_KEYS.map(pillar => {
                          const pillarData = getPillarData(pillar);
                          return (
                            <option key={pillar} value={pillar}>
                              {pillarData.name}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Subcategory
                      </label>
                      <select
                        value={task.subcategory}
                        onChange={(e) => updateTask(index, 'subcategory', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b]"
                      >
                        <option value="">Select subcategory</option>
                        {getPillarData(task.pillar).competencies.map(sub => (
                          <option key={sub} value={sub}>{sub}</option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Evidence Prompt *
                      </label>
                      <input
                        type="text"
                        value={task.evidence_prompt}
                        onChange={(e) => updateTask(index, 'evidence_prompt', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#6d469b] ${
                          errors[`task_${index}_evidence`] ? 'border-red-500' : 'border-gray-300'
                        }`}
                        placeholder="What evidence should students submit?"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Evidence Types
                      </label>
                      <div className="flex gap-3">
                        {evidenceTypes.map(type => (
                          <label key={type.value} className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={task.evidence_types.includes(type.value)}
                              onChange={(e) => {
                                const types = e.target.checked
                                  ? [...task.evidence_types, type.value]
                                  : task.evidence_types.filter(t => t !== type.value);
                                updateTask(index, 'evidence_types', types);
                              }}
                              className="rounded border-gray-300 text-[#6d469b] focus:ring-[#6d469b]"
                            />
                            <span className="text-sm">{type.icon} {type.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="md:col-span-2 flex gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={task.collaboration_eligible}
                          onChange={(e) => updateTask(index, 'collaboration_eligible', e.target.checked)}
                          className="rounded border-gray-300 text-[#6d469b] focus:ring-[#6d469b]"
                        />
                        <span className="text-sm font-medium">Collaboration Eligible (2x XP)</span>
                      </label>

                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={task.location_required}
                          onChange={(e) => updateTask(index, 'location_required', e.target.checked)}
                          className="rounded border-gray-300 text-[#6d469b] focus:ring-[#6d469b]"
                        />
                        <span className="text-sm font-medium">Location Required</span>
                      </label>

                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={task.is_optional}
                          onChange={(e) => updateTask(index, 'is_optional', e.target.checked)}
                          className="rounded border-gray-300 text-[#6d469b] focus:ring-[#6d469b]"
                        />
                        <span className="text-sm font-medium">Optional Task</span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={addTask}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-[#6d469b] transition-colors flex items-center justify-center gap-2 text-gray-600 hover:text-[#6d469b]"
              >
                <Plus className="w-5 h-5" />
                Add Another Task
              </button>
            </div>
          )}
        </div>

        {/* Location Section */}
        <div className="bg-white rounded-xl shadow-lg mb-6 overflow-hidden">
          <button
            onClick={() => toggleSection('location')}
            className="w-full px-6 py-4 bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 flex items-center justify-between hover:bg-gradient-to-r hover:from-[#ef597b]/20 hover:to-[#6d469b]/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              <h2 className="text-xl font-bold text-gray-900">Location Settings</h2>
            </div>
            {expandedSections.location ? <ChevronUp /> : <ChevronDown />}
          </button>
          
          {expandedSections.location && (
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location Type
                </label>
                <select
                  value={locationType}
                  onChange={(e) => setLocationType(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b]"
                >
                  <option value="anywhere">Anywhere</option>
                  <option value="local_community">Local Community</option>
                  <option value="specific_location">Specific Location</option>
                </select>
              </div>

              {locationType !== 'anywhere' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Venue Name
                    </label>
                    <input
                      type="text"
                      value={venueName}
                      onChange={(e) => setVenueName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b]"
                      placeholder="e.g., Natural History Museum"
                    />
                  </div>

                  {locationType === 'specific_location' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Address *
                        </label>
                        <input
                          type="text"
                          value={locationAddress}
                          onChange={(e) => setLocationAddress(e.target.value)}
                          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#6d469b] ${
                            errors.locationAddress ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="123 Museum Way, City, State"
                        />
                        {errors.locationAddress && (
                          <p className="text-red-500 text-sm mt-1">{errors.locationAddress}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Radius (km)
                        </label>
                        <input
                          type="number"
                          value={locationRadius}
                          onChange={(e) => setLocationRadius(Number(e.target.value))}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b]"
                          min="1"
                          max="100"
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Time & Requirements Section */}
        <div className="bg-white rounded-xl shadow-lg mb-6 overflow-hidden">
          <button
            onClick={() => toggleSection('time')}
            className="w-full px-6 py-4 bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 flex items-center justify-between hover:bg-gradient-to-r hover:from-[#ef597b]/20 hover:to-[#6d469b]/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              <h2 className="text-xl font-bold text-gray-900">Time & Requirements</h2>
            </div>
            {expandedSections.time ? <ChevronUp /> : <ChevronDown />}
          </button>
          
          {expandedSections.time && (
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estimated Hours
                </label>
                <input
                  type="text"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b]"
                  placeholder="e.g., 6-10 hours over 2 weeks"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Materials Needed
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={materialInput}
                    onChange={(e) => setMaterialInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addMaterial())}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b]"
                    placeholder="Add material and press Enter"
                  />
                  <button
                    onClick={addMaterial}
                    className="px-4 py-2 bg-[#6d469b] text-white rounded-lg hover:bg-[#5a3784] transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {materialsNeeded.map(material => (
                    <span
                      key={material}
                      className="px-3 py-1 bg-gray-100 rounded-full text-sm flex items-center gap-1"
                    >
                      {material}
                      <button
                        onClick={() => removeMaterial(material)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={isSeasonal}
                    onChange={(e) => setIsSeasonal(e.target.checked)}
                    className="rounded border-gray-300 text-[#6d469b] focus:ring-[#6d469b]"
                  />
                  <span className="text-sm font-medium text-gray-700">This is a seasonal quest</span>
                </label>
                
                {isSeasonal && (
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={seasonalStart}
                        onChange={(e) => setSeasonalStart(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={seasonalEnd}
                        onChange={(e) => setSeasonalEnd(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Collaboration Section */}
        <div className="bg-white rounded-xl shadow-lg mb-6 overflow-hidden">
          <button
            onClick={() => toggleSection('collaboration')}
            className="w-full px-6 py-4 bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 flex items-center justify-between hover:bg-gradient-to-r hover:from-[#ef597b]/20 hover:to-[#6d469b]/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              <h2 className="text-xl font-bold text-gray-900">Collaboration</h2>
            </div>
            {expandedSections.collaboration ? <ChevronUp /> : <ChevronDown />}
          </button>
          
          {expandedSections.collaboration && (
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Team Size Limit
                </label>
                <select
                  value={teamSizeLimit}
                  onChange={(e) => setTeamSizeLimit(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b]"
                >
                  {[2, 3, 4, 5].map(size => (
                    <option key={size} value={size}>{size} people</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Collaboration Prompts
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addPrompt())}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b]"
                    placeholder="e.g., Partner with someone who has different skills"
                  />
                  <button
                    onClick={addPrompt}
                    className="px-4 py-2 bg-[#6d469b] text-white rounded-lg hover:bg-[#5a3784] transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="space-y-2">
                  {collaborationPrompts.map(prompt => (
                    <div
                      key={prompt}
                      className="px-3 py-2 bg-gray-50 rounded-lg text-sm flex items-center justify-between"
                    >
                      <span>{prompt}</span>
                      <button
                        onClick={() => removePrompt(prompt)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>Creating Quest...</>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Create Quest
              </>
            )}
          </button>
          
          <button
            onClick={() => navigate('/admin')}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateQuestPage;