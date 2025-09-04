import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Wand2, Sparkles, AlertCircle, Plus, Trash2 } from 'lucide-react';
import api from '../services/api';

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
  const [aiEnhancing, setAiEnhancing] = useState(false);
  const [aiEnhanced, setAiEnhanced] = useState(null);
  const [showAiPreview, setShowAiPreview] = useState(false);
  const [similarityCheck, setSimilarityCheck] = useState(null);

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

  const handleAiEnhance = async () => {
    if (!formData.title.trim() || !formData.description.trim()) {
      setError('Please provide a title and description before using AI assistance');
      return;
    }

    setAiEnhancing(true);
    setError('');

    try {
      const response = await api.post('/api/ai/enhance-submission', {
        submission: {
          title: formData.title,
          description: formData.description,
          suggested_tasks: formData.suggested_tasks.filter(
            task => task.title.trim() || task.description.trim()
          )
        }
      });

      if (response.data.success) {
        setAiEnhanced(response.data.enhanced_quest);
        setSimilarityCheck(response.data.similarity);
        setShowAiPreview(true);
      } else {
        setError('Failed to enhance quest with AI');
      }
    } catch (err) {
      console.error('AI enhancement error:', err);
      setError('Failed to enhance quest. AI service may be unavailable.');
    } finally {
      setAiEnhancing(false);
    }
  };

  const applyAiEnhancements = () => {
    if (!aiEnhanced) return;

    // Apply enhanced content to form
    setFormData({
      title: aiEnhanced.title || formData.title,
      description: aiEnhanced.description || formData.description,
      suggested_tasks: aiEnhanced.tasks?.map(task => ({
        title: task.title,
        description: task.description,
        pillar: convertPillarFormat(task.pillar),
        xp: task.xp_value?.toString() || ''
      })) || formData.suggested_tasks,
      make_public: formData.make_public
    });

    setShowAiPreview(false);
    setAiEnhanced(null);
  };

  const convertPillarFormat = (pillar) => {
    // Convert from display format to database format
    const pillarMap = {
      'Arts & Creativity': 'arts_creativity',
      'STEM & Logic': 'stem_logic',
      'Life & Wellness': 'life_wellness',
      'Language & Communication': 'language_communication',
      'Society & Culture': 'society_culture'
    };
    return pillarMap[pillar] || 'arts_creativity';
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
        `${import.meta.env.VITE_API_URL}/v3/quests/submissions`,
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

            {/* AI Enhancement Button */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleAiEnhance}
                disabled={aiEnhancing || !formData.title || !formData.description}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {aiEnhancing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Enhancing with AI...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Enhance with AI Assistant
                  </>
                )}
              </button>
            </div>

            {similarityCheck && similarityCheck.exceeds_threshold && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">Similar Quest Detected</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      Your quest is {(similarityCheck.score * 100).toFixed(0)}% similar to existing quests. 
                      Consider making it more unique to increase approval chances.
                    </p>
                  </div>
                </div>
              </div>
            )}

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
                        className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
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
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Task
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

      {/* AI Enhancement Preview Modal */}
      {showAiPreview && aiEnhanced && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-purple-600" />
                  AI Enhanced Quest Preview
                </h2>
                <button
                  onClick={() => setShowAiPreview(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Enhanced Quest Details */}
              <div>
                <h3 className="font-medium text-lg mb-2">Enhanced Title</h3>
                <p className="p-3 bg-gray-50 rounded">{aiEnhanced.title}</p>
              </div>

              <div>
                <h3 className="font-medium text-lg mb-2">Enhanced Description</h3>
                <p className="p-3 bg-gray-50 rounded">{aiEnhanced.description}</p>
              </div>

              {aiEnhanced.big_idea && (
                <div>
                  <h3 className="font-medium text-lg mb-2">Big Idea</h3>
                  <p className="p-3 bg-gray-50 rounded italic">{aiEnhanced.big_idea}</p>
                </div>
              )}

              {/* Enhanced Tasks */}
              {aiEnhanced.tasks && aiEnhanced.tasks.length > 0 && (
                <div>
                  <h3 className="font-medium text-lg mb-2">Enhanced Tasks</h3>
                  <div className="space-y-3">
                    {aiEnhanced.tasks.map((task, idx) => (
                      <div key={idx} className="p-4 bg-gray-50 rounded">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium">{task.title}</h4>
                          <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {task.xp_value} XP
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mb-2">{task.description}</p>
                        <div className="flex gap-4 text-sm">
                          <span className="text-gray-600">
                            <strong>Pillar:</strong> {task.pillar}
                          </span>
                          <span className="text-gray-600">
                            <strong>Evidence:</strong> {task.evidence_type || 'text'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Similarity Warning */}
              {similarityCheck && similarityCheck.exceeds_threshold && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 mr-2" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800">Similarity Warning</p>
                      <p className="text-sm text-yellow-700 mt-1">
                        This quest is {(similarityCheck.score * 100).toFixed(0)}% similar to "{similarityCheck.most_similar?.title}".
                      </p>
                      {similarityCheck.unique_aspects?.suggestions && (
                        <ul className="mt-2 text-sm text-yellow-700 list-disc list-inside">
                          {similarityCheck.unique_aspects.suggestions.map((suggestion, idx) => (
                            <li key={idx}>{suggestion}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  onClick={() => setShowAiPreview(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={applyAiEnhancements}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:opacity-90 flex items-center gap-2"
                >
                  <Wand2 className="w-4 h-4" />
                  Apply Enhancements
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomizeQuestPage;