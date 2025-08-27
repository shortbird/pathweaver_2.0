import React, { useState } from 'react';
import toast from 'react-hot-toast';

const AdminQuestManagerV3 = ({ quest, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    title: quest?.title || '',
    big_idea: quest?.big_idea || '',
    header_image_url: quest?.header_image_url || '',
    is_active: quest?.is_active !== undefined ? quest.is_active : true
  });

  const [tasks, setTasks] = useState(quest?.quest_tasks || []);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    xp_amount: 50,
    pillar: 'creativity'
  });
  const [editingTaskIndex, setEditingTaskIndex] = useState(null);

  const [headerImageFile, setHeaderImageFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pillars = [
    { value: 'creativity', label: 'Creativity', color: 'from-purple-500 to-pink-500' },
    { value: 'critical_thinking', label: 'Critical Thinking', color: 'from-blue-500 to-cyan-500' },
    { value: 'practical_skills', label: 'Practical Skills', color: 'from-green-500 to-emerald-500' },
    { value: 'communication', label: 'Communication', color: 'from-orange-500 to-yellow-500' },
    { value: 'cultural_literacy', label: 'Cultural Literacy', color: 'from-red-500 to-rose-500' }
  ];

  const handleAddTask = () => {
    if (!newTask.title) {
      toast.error('Task title is required');
      return;
    }

    setTasks([...tasks, { ...newTask, task_order: tasks.length }]);
    setNewTask({
      title: '',
      description: '',
      xp_amount: 50,
      pillar: 'creativity'
    });
    toast.success('Task added');
  };

  const handleRemoveTask = (index) => {
    const updatedTasks = tasks.filter((_, i) => i !== index);
    // Reorder remaining tasks
    updatedTasks.forEach((task, i) => {
      task.task_order = i;
    });
    setTasks(updatedTasks);
    // Cancel editing if this task was being edited
    if (editingTaskIndex === index) {
      setEditingTaskIndex(null);
    }
  };

  const handleEditTask = (index) => {
    setEditingTaskIndex(index);
  };

  const handleSaveEditedTask = (index, updatedTask) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], ...updatedTask };
    setTasks(newTasks);
    setEditingTaskIndex(null);
    toast.success('Task updated');
  };

  const handleCancelEdit = () => {
    setEditingTaskIndex(null);
  };

  const handleMoveTask = (index, direction) => {
    const newTasks = [...tasks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex >= 0 && targetIndex < tasks.length) {
      [newTasks[index], newTasks[targetIndex]] = [newTasks[targetIndex], newTasks[index]];
      newTasks.forEach((task, i) => {
        task.task_order = i;
      });
      setTasks(newTasks);
    }
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
              setFormData({ ...formData, header_image_url: resizedUrl });
              
              if (width !== img.width || height !== img.height) {
                toast.success(`Image resized to ${width}x${height} for optimal display`);
              }
            }, file.type || 'image/jpeg', 0.9);
          } else {
            // Image is already optimal size
            setHeaderImageFile(file);
            setFormData({ ...formData, header_image_url: reader.result });
          }
        };
        
        img.src = reader.result;
      };
      
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.title || !formData.big_idea) {
      toast.error('Title and Big Idea are required');
      return;
    }

    if (tasks.length === 0) {
      toast.error('Please add at least one task');
      return;
    }

    setIsSubmitting(true);

    try {
      // Try V3 endpoint first
      const method = quest ? 'PUT' : 'POST';
      // In production, use relative URLs. In dev, use the environment variable
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      let url = quest ? `${apiBase}/v3/admin/quests/${quest.id}` : `${apiBase}/v3/admin/quests`;
      
      let response;
      
      // If we have an image file, convert to base64 and send as JSON
      if (headerImageFile) {
        // Convert image to base64
        const reader = new FileReader();
        const base64Promise = new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result);
        });
        reader.readAsDataURL(headerImageFile);
        const base64Data = await base64Promise;
        
        const jsonData = {
          title: formData.title,
          big_idea: formData.big_idea,
          is_active: formData.is_active,
          tasks: tasks,
          header_image_base64: base64Data,
          header_image_filename: headerImageFile.name
        };
        
        response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(jsonData)
        });
      } else {
        // No new image, but preserve existing image URL if editing
        const jsonData = {
          title: formData.title,
          big_idea: formData.big_idea,
          is_active: formData.is_active,
          tasks: tasks,
          // Preserve existing image URL when editing
          ...(quest && formData.header_image_url ? { header_image_url: formData.header_image_url } : {})
        };
        
        response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(jsonData)
        });
      }
      
      // If V3 endpoint doesn't exist (404/405), fallback to old endpoint
      if (response.status === 405 || response.status === 404) {
        // Convert to old format for backward compatibility
        const oldFormatData = {
          title: formData.title,
          description: formData.big_idea,
          difficulty_level: 'intermediate',
          effort_level: 'moderate',
          estimated_hours: 2,
          evidence_requirements: 'Complete all tasks and provide evidence',
          accepted_evidence_types: ['text', 'link', 'image', 'video'],
          is_active: formData.is_active,
          // Add XP awards based on tasks (using old endpoint field name)
          skill_xp_awards: tasks.map(task => ({
            skill_category: 
              task.pillar === 'creativity' ? 'making_creating' :
              task.pillar === 'critical_thinking' ? 'thinking_skills' :
              task.pillar === 'practical_skills' ? 'life_skills' :
              task.pillar === 'communication' ? 'reading_writing' :
              task.pillar === 'cultural_literacy' ? 'world_understanding' :
              'personal_growth',
            xp_amount: task.xp_amount
          }))
        };
        
        url = quest ? `${apiBase}/admin/quests/${quest.id}` : `${apiBase}/admin/quests`;
        response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(oldFormatData)
        });
      }

      // Check if response has content
      let data = {};
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (jsonError) {
          console.error('Failed to parse JSON response:', jsonError);
          if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
          }
        }
      }

      if (!response.ok) {
        // Better error handling - check different error formats
        let errorMessage = `Failed to save quest: ${response.status}`;
        if (data) {
          if (typeof data.error === 'string') {
            errorMessage = data.error;
          } else if (data.message) {
            errorMessage = data.message;
          } else if (data.detail) {
            errorMessage = data.detail;
          } else if (typeof data === 'string') {
            errorMessage = data;
          }
        }
        console.error('Server error response:', data);
        console.error('Server error details:', JSON.stringify(data, null, 2));
        throw new Error(errorMessage);
      }

      toast.success(quest ? 'Quest updated successfully!' : 'Quest created successfully!');
      
      // For old endpoint, construct the quest object if not returned
      const questData = data.quest || {
        id: data.quest_id || data.id || quest?.id,
        title: formData.title,
        big_idea: formData.big_idea,
        quest_tasks: tasks,
        is_active: formData.is_active
      };
      
      onSave(questData);
      onClose();
    } catch (error) {
      console.error('Error saving quest:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        error: error
      });
      toast.error(error.message || 'Failed to save quest');
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateTotalXP = () => {
    return tasks.reduce((sum, task) => sum + (task.xp_amount || 0), 0);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">
              {quest ? 'Edit Quest' : 'Create New Quest'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Quest Basic Info */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Quest Information</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quest Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter an engaging quest title"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Big Idea *
                </label>
                <textarea
                  value={formData.big_idea}
                  onChange={(e) => setFormData({ ...formData, big_idea: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Describe the main concept or learning goal"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Header Image (Optional)
                </label>
                {formData.header_image_url && (
                  <div className="mb-2">
                    <img 
                      src={formData.header_image_url} 
                      alt="Quest header" 
                      className="w-full h-48 object-cover rounded-lg"
                    />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Max size: 5MB • Recommended: 1200x675px (16:9 ratio) • Images will be automatically resized
                </p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
                  Quest is active and visible to students
                </label>
              </div>
            </div>
          </div>

          {/* Tasks Section */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                Tasks ({tasks.length})
              </h3>
              <div className="text-sm text-gray-600">
                Total XP: <span className="font-bold text-green-600">{calculateTotalXP()}</span>
              </div>
            </div>

            {/* Existing Tasks */}
            {tasks.length > 0 && (
              <div className="space-y-3 mb-6">
                {tasks.map((task, index) => (
                  <div key={index} className="border rounded-lg p-4 bg-gray-50">
                    {editingTaskIndex === index ? (
                      // Edit mode
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) => {
                            const newTasks = [...tasks];
                            newTasks[index].title = e.target.value;
                            setTasks(newTasks);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Task title"
                        />
                        <textarea
                          value={task.description || ''}
                          onChange={(e) => {
                            const newTasks = [...tasks];
                            newTasks[index].description = e.target.value;
                            setTasks(newTasks);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Task description (optional)"
                          rows="2"
                        />
                        <div className="flex gap-3">
                          <select
                            value={task.pillar}
                            onChange={(e) => {
                              const newTasks = [...tasks];
                              newTasks[index].pillar = e.target.value;
                              setTasks(newTasks);
                            }}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {pillars.map(p => (
                              <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={task.xp_amount}
                            onChange={(e) => {
                              const newTasks = [...tasks];
                              newTasks[index].xp_amount = parseInt(e.target.value) || 0;
                              setTasks(newTasks);
                            }}
                            className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            min="0"
                            step="10"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEditedTask(index, task)}
                            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="px-3 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // View mode
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium text-gray-800 mb-1">{task.title}</div>
                          {task.description && (
                            <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                          )}
                          <div className="flex items-center gap-3 text-sm">
                            <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium text-white bg-gradient-to-r ${
                              pillars.find(p => p.value === task.pillar)?.color || 'from-gray-500 to-gray-600'
                            }`}>
                              {task.pillar.replace('_', ' ')}
                            </span>
                            <span className="font-medium text-green-600">{task.xp_amount} XP</span>
                          </div>
                        </div>
                        <div className="flex gap-1 ml-4">
                          <button
                            type="button"
                            onClick={() => handleEditTask(index)}
                            className="p-1 text-blue-500 hover:text-blue-700"
                            title="Edit task"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveTask(index, 'up')}
                            disabled={index === 0}
                            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveTask(index, 'down')}
                            disabled={index === tasks.length - 1}
                            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveTask(index)}
                            className="p-1 text-red-500 hover:text-red-700"
                            title="Delete task"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add New Task */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <h4 className="font-medium text-gray-700 mb-3">Add New Task</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Task Title *
                  </label>
                  <input
                    type="text"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="What will students do?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    XP Amount *
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    value={newTask.xp_amount}
                    onChange={(e) => setNewTask({ ...newTask, xp_amount: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="Additional details or instructions"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pillar *
                </label>
                <select
                  value={newTask.pillar}
                  onChange={(e) => setNewTask({ ...newTask, pillar: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {pillars.map(pillar => (
                    <option key={pillar.value} value={pillar.value}>
                      {pillar.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleAddTask}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add Task
              </button>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || tasks.length === 0}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : (quest ? 'Update Quest' : 'Create Quest')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminQuestManagerV3;