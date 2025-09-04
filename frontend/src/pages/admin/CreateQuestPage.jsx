import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { Sparkles, Plus, X, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const CreateQuestPage = () => {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, loading, navigate]);
  
  // Simple quest data - all fields are optional
  const [questData, setQuestData] = useState({
    title: '',
    description: '',
    big_idea: '',
    topic: '',
    age_group: '',
    difficulty: '',
    notes: ''
  });
  
  // User's task ideas
  const [taskIdeas, setTaskIdeas] = useState(['']);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleInputChange = (field, value) => {
    setQuestData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTaskIdeaChange = (index, value) => {
    const newTaskIdeas = [...taskIdeas];
    newTaskIdeas[index] = value;
    setTaskIdeas(newTaskIdeas);
  };

  const addTaskIdea = () => {
    setTaskIdeas([...taskIdeas, '']);
  };

  const removeTaskIdea = (index) => {
    if (taskIdeas.length > 1) {
      setTaskIdeas(taskIdeas.filter((_, i) => i !== index));
    }
  };

  const handleGenerateQuest = async () => {
    setIsGenerating(true);
    
    try {
      // Filter out empty fields
      const dataToSend = Object.entries(questData).reduce((acc, [key, value]) => {
        if (value && value.trim()) {
          acc[key] = value.trim();
        }
        return acc;
      }, {});

      // Add non-empty task ideas
      const nonEmptyTasks = taskIdeas.filter(task => task.trim());
      if (nonEmptyTasks.length > 0) {
        dataToSend.user_tasks = nonEmptyTasks;
      }

      // Call the AI endpoint to generate and save the quest
      const response = await api.post('/v1/ai/generate-and-save-quest', dataToSend);
      
      if (response.data.success) {
        toast.success(
          response.data.is_approved 
            ? 'Quest created and approved successfully!' 
            : 'Quest created and submitted for review!'
        );
        
        // Navigate to the quests page
        navigate('/admin/quests');
      } else {
        throw new Error(response.data.message || 'Failed to generate quest');
      }
    } catch (error) {
      console.error('Error generating quest:', error);
      toast.error(error.response?.data?.error || 'Failed to generate quest. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Create AI-Powered Quest</h2>
              <p className="mt-1 text-sm text-gray-600">
                Fill in any details you have - AI will complete the rest and create at least 8 tasks across all 5 pillars
              </p>
            </div>
            <button
              onClick={() => navigate('/admin/quests')}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 space-y-6">
          {/* Info Box */}
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-purple-900">AI-Enhanced Quest Creation</h3>
                <p className="text-sm text-purple-700 mt-1">
                  No fields are required! Share whatever ideas you have - a title, a topic, learning goals, or just task ideas. 
                  The AI will enhance your input, fill in missing details, and generate a complete quest with diverse tasks.
                </p>
              </div>
            </div>
          </div>

          {/* Optional Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={questData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="e.g., 'Explore Ancient Civilizations' or leave blank for AI to generate"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                value={questData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe what students will learn or do..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Big Idea / Learning Goal <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={questData.big_idea}
                onChange={(e) => handleInputChange('big_idea', e.target.value)}
                placeholder="What's the main concept or skill to be learned?"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Topic or Subject <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={questData.topic}
                  onChange={(e) => handleInputChange('topic', e.target.value)}
                  placeholder="e.g., Science, History, Art..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Age Group <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={questData.age_group}
                  onChange={(e) => handleInputChange('age_group', e.target.value)}
                  placeholder="e.g., 8-12, Teens, All ages..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Difficulty Level <span className="text-gray-400">(optional)</span>
              </label>
              <select
                value={questData.difficulty}
                onChange={(e) => handleInputChange('difficulty', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">AI will determine</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="mixed">Mixed Levels</option>
              </select>
            </div>

            {/* Task Ideas Section */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Task Ideas <span className="text-gray-400">(optional - add your own task ideas)</span>
                </label>
                <button
                  type="button"
                  onClick={addTaskIdea}
                  className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Task
                </button>
              </div>
              <div className="space-y-2">
                {taskIdeas.map((task, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={task}
                      onChange={(e) => handleTaskIdeaChange(index, e.target.value)}
                      placeholder={`Task ${index + 1}: e.g., "Research famous scientists" or "Build a model volcano"`}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    {taskIdeas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTaskIdea(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                AI will enhance your tasks and add more to ensure all 5 pillars are covered
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Notes or Ideas <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                value={questData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Any other ideas, requirements, or inspiration for the quest..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* AI Features Info */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">What the AI will do:</h3>
            <ul className="space-y-1 text-sm text-blue-700">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">✓</span>
                <span>Clean up grammar and enhance language clarity</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">✓</span>
                <span>Generate a compelling title and description if not provided</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">✓</span>
                <span>Incorporate and enhance your task ideas</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">✓</span>
                <span>Create at least 8 diverse tasks across all 5 skill pillars</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">✓</span>
                <span>Add appropriate XP values and evidence prompts for each task</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">✓</span>
                <span>Ensure educational value and age-appropriate content</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg">
          <div className="flex justify-between items-center">
            <button
              onClick={() => navigate('/admin/quests')}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerateQuest}
              disabled={isGenerating}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Generating Quest...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Quest with AI
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateQuestPage;