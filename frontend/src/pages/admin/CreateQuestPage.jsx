import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { PILLAR_KEYS, getPillarData } from '../../utils/pillarMappings';
import { ChevronDown, ChevronUp, Plus, Trash2, MapPin, Calendar, Save, X } from 'lucide-react';

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
  const [source, setSource] = useState('');
  const [isSeasonal, setIsSeasonal] = useState(false);
  const [seasonalStart, setSeasonalStart] = useState('');
  const [seasonalEnd, setSeasonalEnd] = useState('');
  
  // Location features
  const [locationType, setLocationType] = useState('anywhere');
  const [locationAddress, setLocationAddress] = useState('');
  const [venueName, setVenueName] = useState('');
  
  // Tasks
  const [tasks, setTasks] = useState([{
    title: '',
    description: '',
    pillar: 'life_wellness',
    subcategory: '',
    xp_value: 100,
    evidence_prompt: '',
    materials_needed: [],
    order_index: 1
  }]);
  
  // UI state
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    tasks: true,
    location: false,
    advanced: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

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
      materials_needed: [],
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

  const addMaterialToTask = (taskIndex) => {
    const material = tasks[taskIndex].materialInput;
    if (material && material.trim()) {
      const updatedTasks = [...tasks];
      if (!updatedTasks[taskIndex].materials_needed) {
        updatedTasks[taskIndex].materials_needed = [];
      }
      updatedTasks[taskIndex].materials_needed.push(material.trim());
      updatedTasks[taskIndex].materialInput = '';
      setTasks(updatedTasks);
    }
  };

  const removeMaterialFromTask = (taskIndex, material) => {
    const updatedTasks = [...tasks];
    updatedTasks[taskIndex].materials_needed = updatedTasks[taskIndex].materials_needed.filter(m => m !== material);
    setTasks(updatedTasks);
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
    
    // Validate tasks
    tasks.forEach((task, index) => {
      if (!task.title.trim()) {
        newErrors[`task_${index}_title`] = 'Task title is required';
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
        source,
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
          // Location
          location_type: locationType,
          location_address: locationAddress,
          venue_name: venueName,
          
          // Seasonal
          seasonal_start: isSeasonal ? seasonalStart : null,
          seasonal_end: isSeasonal ? seasonalEnd : null,
        }
      };

      const response = await api.post('/v3/admin/quests/create', questData);
      
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Source URL
                </label>
                <input
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#6d469b] focus:border-transparent border-gray-300"
                  placeholder="e.g., https://example.com/quest-resources"
                />
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
                        Task Description
                      </label>
                      <textarea
                        value={task.description}
                        onChange={(e) => updateTask(index, 'description', e.target.value)}
                        rows={2}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#6d469b] border-gray-300'
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
                        Evidence Prompt
                      </label>
                      <input
                        type="text"
                        value={task.evidence_prompt}
                        onChange={(e) => updateTask(index, 'evidence_prompt', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#6d469b] border-gray-300'
                        }`}
                        placeholder="What evidence should students submit?"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Materials Needed
                      </label>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={task.materialInput}
                          onChange={(e) => updateTask(index, 'materialInput', e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addMaterialToTask(index))}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b]"
                          placeholder="Add material and press Enter"
                        />
                        <button
                          onClick={() => addMaterialToTask(index)}
                          className="px-4 py-2 bg-[#6d469b] text-white rounded-lg hover:bg-[#5a3784] transition-colors"
                        >
                          Add
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {task.materials_needed && task.materials_needed.map(material => (
                          <span
                            key={material}
                            className="px-3 py-1 bg-gray-100 rounded-full text-sm flex items-center gap-1"
                          >
                            {material}
                            <button
                              onClick={() => removeMaterialFromTask(index, material)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
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
                    </>
                  )}
                </>
              )}
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