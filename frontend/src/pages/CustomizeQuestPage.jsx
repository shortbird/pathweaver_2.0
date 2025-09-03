import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

const CustomizeQuestPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    suggested_tasks: [{ title: '', description: '', pillar: 'arts_creativity', xp: '' }],
    make_public: false
  });

  const pillars = [
    { value: 'arts_creativity', label: 'Arts & Creativity' },
    { value: 'stem_logic', label: 'STEM & Logic' },
    { value: 'life_wellness', label: 'Life & Wellness' },
    { value: 'language_communication', label: 'Language & Communication' },
    { value: 'society_culture', label: 'Society & Culture' }
  ];

  const handleTaskChange = (index, field, value) => {
    const newTasks = [...formData.suggested_tasks];
    newTasks[index][field] = value;
    setFormData({ ...formData, suggested_tasks: newTasks });
  };

  const addTask = () => {
    setFormData({
      ...formData,
      suggested_tasks: [...formData.suggested_tasks, { title: '', description: '', pillar: 'arts_creativity', xp: '' }]
    });
  };

  const removeTask = (index) => {
    const newTasks = formData.suggested_tasks.filter((_, i) => i !== index);
    setFormData({ ...formData, suggested_tasks: newTasks });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.description.trim()) {
      setError('Title and description are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      // Filter out empty tasks
      const filteredTasks = formData.suggested_tasks.filter(
        task => task.title.trim() || task.description.trim()
      );

      // Process tasks to include XP values
      const processedTasks = filteredTasks.map(task => ({
        ...task,
        xp: task.xp ? parseInt(task.xp) : null
      }));

      const submissionData = {
        title: formData.title,
        description: formData.description,
        suggested_tasks: processedTasks.length > 0 ? processedTasks : null,
        make_public: formData.make_public
      };

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/v3/quests/submissions`,
        submissionData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        alert('Quest submission sent successfully! An admin will review your request.');
        navigate('/quests');
      }
    } catch (err) {
      console.error('Error submitting quest:', err);
      setError(err.response?.data?.error || 'Failed to submit quest');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Please log in to customize a quest</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Customize Your Quest</h1>
            <button
              onClick={() => navigate('/quests')}
              className="text-gray-600 hover:text-gray-800"
            >
              ← Back to Quest Hub
            </button>
          </div>

          <p className="text-gray-600 mb-6">
            Create your own custom quest! Fill in the details below and an admin will review your submission.
            Once approved, the quest will be available in your account.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quest Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter a compelling title for your quest"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quest Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Describe what students will learn and accomplish in this quest"
                required
              />
            </div>

            {/* Suggested Tasks */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Suggested Tasks (Optional)
              </label>
              <p className="text-sm text-gray-500 mb-3">
                Add tasks that students should complete as part of this quest
              </p>
              
              {formData.suggested_tasks.map((task, index) => (
                <div key={index} className="mb-4 p-4 border border-gray-200 rounded">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-medium text-gray-600">Task {index + 1}</span>
                    {formData.suggested_tasks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTask(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={task.title}
                    onChange={(e) => handleTaskChange(index, 'title', e.target.value)}
                    placeholder="Task title"
                    className="w-full px-3 py-2 mb-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <textarea
                    value={task.description}
                    onChange={(e) => handleTaskChange(index, 'description', e.target.value)}
                    placeholder="Task description"
                    rows={2}
                    className="w-full px-3 py-2 mb-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={task.pillar || ''}
                      onChange={(e) => handleTaskChange(index, 'pillar', e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select skill pillar</option>
                      {pillars.map(pillar => (
                        <option key={pillar.value} value={pillar.value}>
                          {pillar.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={task.xp || ''}
                      onChange={(e) => handleTaskChange(index, 'xp', e.target.value)}
                      placeholder="XP (e.g., 50)"
                      min="10"
                      step="10"
                      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              ))}
              
              <button
                type="button"
                onClick={addTask}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                + Add Task
              </button>
            </div>

            {/* Make Public */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="make_public"
                checked={formData.make_public}
                onChange={(e) => setFormData({ ...formData, make_public: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="make_public" className="ml-2 text-sm text-gray-700">
                Make this quest publicly available once approved
              </label>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => navigate('/quests')}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Submitting...' : 'Submit Quest'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CustomizeQuestPage;