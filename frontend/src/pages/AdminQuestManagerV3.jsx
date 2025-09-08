import React, { useState, useEffect } from 'react';
import { PILLAR_KEYS, getPillarData } from '../utils/pillarMappings';
import { ChevronDown, ChevronUp, Plus, Trash2, MapPin, Calendar, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const AdminQuestManagerV3 = ({ quest, onClose, onSave }) => {
  // Quest basic info
  const [title, setTitle] = useState(quest?.title || '');
  const [description, setDescription] = useState(quest?.big_idea || quest?.description || '');
  const [source, setSource] = useState(quest?.source || 'optio');
  const [isSeasonal, setIsSeasonal] = useState(false);
  const [seasonalStart, setSeasonalStart] = useState('');
  const [seasonalEnd, setSeasonalEnd] = useState('');
  const [isActive, setIsActive] = useState(quest?.is_active !== undefined ? quest.is_active : true);
  
  // Location features
  const [locationType, setLocationType] = useState('anywhere');
  const [locationAddress, setLocationAddress] = useState('');
  const [venueName, setVenueName] = useState('');
  
  // Custom header image
  const [headerImageFile, setHeaderImageFile] = useState(null);
  const [headerImageUrl, setHeaderImageUrl] = useState(quest?.header_image_url || '');
  
  // Tasks - initialize from quest data if editing
  const [tasks, setTasks] = useState(() => {
    if (quest?.quest_tasks) {
      return quest.quest_tasks.map((task, index) => ({
        title: task.title || '',
        description: task.description || '',
        pillar: task.pillar || 'arts_creativity',
        subcategory: task.subcategory || '',
        xp_value: task.xp_amount || task.xp_value || 100,
        evidence_prompt: task.evidence_prompt || '',
        materials_needed: task.materials_needed || [],
        order_index: task.order_index || task.task_order || index + 1
      }));
    }
    return [{
      title: '',
      description: '',
      pillar: 'life_wellness',
      subcategory: '',
      xp_value: 100,
      evidence_prompt: '',
      materials_needed: [],
      order_index: 1
    }];
  });
  
  // UI state
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    tasks: true,
    advanced: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [customSources, setCustomSources] = useState(() => {
    const saved = localStorage.getItem('customQuestSources');
    return saved ? JSON.parse(saved) : {};
  });

  // Initialize location data from quest metadata
  useEffect(() => {
    if (quest?.metadata) {
      setLocationType(quest.metadata.location_type || 'anywhere');
      setLocationAddress(quest.metadata.location_address || '');
      setVenueName(quest.metadata.venue_name || '');
      if (quest.metadata.seasonal_start) {
        setIsSeasonal(true);
        setSeasonalStart(quest.metadata.seasonal_start);
        setSeasonalEnd(quest.metadata.seasonal_end || '');
      }
    }
  }, [quest]);

  // Predefined sources
  const DEFAULT_QUEST_SOURCES = {
    optio: 'Optio',
    khan_academy: 'Khan Academy'
  };

  const allSources = { ...DEFAULT_QUEST_SOURCES, ...customSources };

  const handleAddSource = () => {
    if (!newSourceName.trim()) {
      toast.error('Please enter a source name');
      return;
    }
    
    const sourceKey = newSourceName.toLowerCase().replace(/\s+/g, '_');
    if (DEFAULT_QUEST_SOURCES[sourceKey] || customSources[sourceKey]) {
      toast.error('This source already exists');
      return;
    }
    
    const updatedCustomSources = {
      ...customSources,
      [sourceKey]: newSourceName
    };
    
    setCustomSources(updatedCustomSources);
    localStorage.setItem('customQuestSources', JSON.stringify(updatedCustomSources));
    setSource(sourceKey);
    setNewSourceName('');
    setShowAddSource(false);
    toast.success(`Added new source: ${newSourceName}`);
  };

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

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        return;
      }
      
      // Create image to check dimensions and resize if needed
      const img = new Image();
      const reader = new FileReader();
      
      reader.onloadend = () => {
        img.onload = () => {
          // Recommended dimensions for quest cards (16:9 aspect ratio, optimized for display)
          const maxWidth = 1200;
          const maxHeight = 675;
          
          // Check if resizing is needed
          if (img.width > maxWidth || img.height > maxHeight) {
            // Resize image using canvas
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // Calculate new dimensions maintaining aspect ratio
            if (width > height) {
              if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              }
            } else {
              if (height > maxHeight) {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }
            
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert canvas to blob
            canvas.toBlob((blob) => {
              const resizedFile = new File([blob], file.name, {
                type: file.type || 'image/jpeg',
                lastModified: Date.now()
              });
              setHeaderImageFile(resizedFile);
              
              // Set preview
              const resizedUrl = canvas.toDataURL(file.type || 'image/jpeg', 0.9);
              setHeaderImageUrl(resizedUrl);
              
              if (width !== img.width || height !== img.height) {
                toast.success(`Image resized to ${width}x${height} for optimal display`);
              }
            }, file.type || 'image/jpeg', 0.9);
          } else {
            // Image is already optimal size
            setHeaderImageFile(file);
            setHeaderImageUrl(reader.result);
          }
        };
        
        img.src = reader.result;
      };
      
      reader.readAsDataURL(file);
    }
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Prepare quest data for V3 API
      let questData = {
        title,
        description,
        big_idea: description,
        source,
        is_active: isActive,
        
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

      // Handle image upload
      if (headerImageFile) {
        // Convert image to base64
        const reader = new FileReader();
        const base64Promise = new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result);
        });
        reader.readAsDataURL(headerImageFile);
        const base64Data = await base64Promise;
        
        questData.header_image_base64 = base64Data;
        questData.header_image_filename = headerImageFile.name;
      } else if (headerImageUrl) {
        // Preserve existing image URL when editing
        questData.header_image_url = headerImageUrl;
      }

      const endpoint = quest ? `/api/v3/admin/quests/${quest.id}` : '/v3/admin/quests/create';
      const method = quest ? 'put' : 'post';
      
      const response = await api[method](endpoint, questData);
      
      if (response.data && (response.data.id || quest?.id)) {
        toast.success(quest ? 'Quest updated successfully!' : 'Quest created successfully!');
        onSave(response.data);
        onClose();
      }
    } catch (error) {
      // Error already handled by toast below
      const errorMessage = error.response?.data?.error || error.message || 'Failed to save quest. Please try again.';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const xpInfo = calculateTotalXP();
  const pillarBreakdown = getPillarBreakdown();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 rounded-t-xl">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
              {quest ? 'Edit Quest' : 'Create New Quest'}
            </h1>
            <button
              onClick={onClose}
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

        <form onSubmit={handleSubmit} className="p-6">
          {/* Quest Details Section */}
          <div className="bg-white rounded-xl shadow-lg mb-6 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('basic')}
              className="w-full px-6 py-4 bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 flex items-center justify-between hover:bg-gradient-to-r hover:from-[#ef597b]/20 hover:to-[#6d469b]/20 transition-colors"
            >
              <h2 className="text-xl font-bold text-gray-900">Quest Details</h2>
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
                    Quest Source *
                  </label>
                  {!showAddSource ? (
                    <div>
                      <div className="flex items-center gap-2">
                        <select
                          value={source}
                          onChange={(e) => setSource(e.target.value)}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
                          required
                        >
                          {Object.entries(allSources).map(([key, name]) => (
                            <option key={key} value={key}>{name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setShowAddSource(true)}
                          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          + Add New Source
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newSourceName}
                        onChange={(e) => setNewSourceName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSource())}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
                        placeholder="Enter new source name (e.g., Coursera, edX)"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleAddSource}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddSource(false);
                          setNewSourceName('');
                        }}
                        className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Custom Header Image (Optional)
                  </label>
                  {headerImageUrl && (
                    <div className="mb-2">
                      <img 
                        src={headerImageUrl} 
                        alt="Quest header" 
                        className="w-full h-48 object-cover rounded-lg"
                      />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Max size: 5MB • Recommended: 1200x675px (16:9 ratio) • Images will be automatically resized
                  </p>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 text-[#6d469b] focus:ring-[#6d469b] border-gray-300 rounded"
                  />
                  <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
                    Quest is active and visible to students
                  </label>
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

                {/* Location Settings */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <MapPin className="w-4 h-4 inline mr-1" />
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
                        Location Name
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
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Tasks Section */}
          <div className="bg-white rounded-xl shadow-lg mb-6 overflow-hidden">
            <button
              type="button"
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
                          type="button"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b]"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6d469b]"
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
                            type="button"
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
                                type="button"
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
                  type="button"
                  onClick={addTask}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-[#6d469b] transition-colors flex items-center justify-center gap-2 text-gray-600 hover:text-[#6d469b]"
                >
                  <Plus className="w-5 h-5" />
                  Add Another Task
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>Saving...</>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  {quest ? 'Update Quest' : 'Create Quest'}
                </>
              )}
            </button>
            
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminQuestManagerV3;