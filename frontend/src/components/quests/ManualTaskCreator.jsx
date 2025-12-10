import React, { useState } from 'react';
import PropTypes from 'prop-types';
import api from '../../services/api';

/**
 * ManualTaskCreator Component
 *
 * Allows students to create custom quest tasks manually.
 * Features:
 * - Clean, simple form focused on creativity
 * - Manual task entry with title, description, and pillar selection
 * - No AI assistance - pure student-driven task creation
 */
const ManualTaskCreator = ({ questId, sessionId, onTasksCreated, onCancel }) => {
  const [currentTask, setCurrentTask] = useState({
    title: '',
    description: '',
    pillar: '',
    xp_value: 100
  });

  const [addedTasks, setAddedTasks] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const pillars = [
    { key: 'stem', label: 'STEM' },
    { key: 'wellness', label: 'Wellness' },
    { key: 'communication', label: 'Communication' },
    { key: 'civics', label: 'Civics' },
    { key: 'art', label: 'Art' }
  ];

  const xpOptions = [
    { value: 50, label: '50 XP - Small task' },
    { value: 100, label: '100 XP - Medium task' },
    { value: 150, label: '150 XP - Large task' },
    { value: 200, label: '200 XP - Major task' }
  ];

  const handleInputChange = (field, value) => {
    setCurrentTask(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleAddTask = () => {
    setError('');

    // Validation
    if (!currentTask.title || currentTask.title.length < 3) {
      setError('Task title must be at least 3 characters');
      return;
    }

    if (!currentTask.description || currentTask.description.trim().length === 0) {
      setError('Task description is required');
      return;
    }

    if (!currentTask.pillar) {
      setError('Please select a pillar for this task');
      return;
    }

    // Add to tasks list
    const taskData = {
      title: currentTask.title,
      description: currentTask.description,
      pillar: currentTask.pillar,
      xp_value: currentTask.xp_value || 100,
      diploma_subjects: { 'Electives': 100 }
    };

    setAddedTasks(prev => [...prev, taskData]);

    // Reset form
    setCurrentTask({ title: '', description: '', pillar: '', xp_value: 100 });
    setError('');
  };

  const handleRemoveTask = (index) => {
    setAddedTasks(prev => prev.filter((_, i) => i !== index));
  };

  const handleFinish = async () => {
    if (addedTasks.length === 0) {
      setError('Please add at least one task');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await api.post(`/api/quests/${questId}/add-manual-tasks`, {
        tasks: addedTasks
      });

      if (response.data.success) {
        onTasksCreated(response.data);
      } else {
        setError(response.data.error || 'Failed to add tasks');
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error('Error adding tasks:', err);
      setError(err.response?.data?.error || 'Failed to add tasks. Please try again.');
      setIsSubmitting(false);
    }
  };

  const renderAddedTasksList = () => {
    if (addedTasks.length === 0) return null;

    return (
      <div className="mt-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-3">
          Your Tasks ({addedTasks.length})
        </h4>

        <div className="space-y-2">
          {addedTasks.map((task, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h5 className="font-semibold text-gray-900">{task.title}</h5>
                  <span className="text-sm text-optio-purple font-bold">{task.xp_value || 100} XP</span>
                  <span className="text-xs text-gray-500 capitalize">({task.pillar || 'stem'})</span>
                </div>
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">{task.description}</p>
              </div>
              <button
                onClick={() => handleRemoveTask(index)}
                className="ml-4 text-red-600 hover:text-red-700 font-semibold"
                aria-label="Remove task"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Your Quest Tasks</h2>
        <p className="text-gray-600">
          Design custom tasks that match your interests and learning goals.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Task Creation Form */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="space-y-4">
          {/* Title Input */}
          <div>
            <label htmlFor="task-title" className="block text-sm font-semibold text-gray-700 mb-2">
              Task Title *
            </label>
            <input
              id="task-title"
              type="text"
              value={currentTask.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="e.g., Interview my grandparent about their childhood"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Description Textarea */}
          <div>
            <label htmlFor="task-description" className="block text-sm font-semibold text-gray-700 mb-2">
              Description (What will you do?) *
            </label>
            <textarea
              id="task-description"
              value={currentTask.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Describe what you'll do, how you'll explore, and what you hope to discover..."
              rows={5}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              {currentTask.description.length} characters
            </p>
          </div>

          {/* Pillar Selection */}
          <div>
            <label htmlFor="task-pillar" className="block text-sm font-semibold text-gray-700 mb-2">
              Pillar *
            </label>
            <select
              id="task-pillar"
              value={currentTask.pillar}
              onChange={(e) => handleInputChange('pillar', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select a pillar...</option>
              {pillars.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* XP Value Selection */}
          <div>
            <label htmlFor="task-xp" className="block text-sm font-semibold text-gray-700 mb-2">
              Task Size *
            </label>
            <select
              id="task-xp"
              value={currentTask.xp_value}
              onChange={(e) => handleInputChange('xp_value', parseInt(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {xpOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {/* Add Task Button */}
          <button
            onClick={handleAddTask}
            disabled={!currentTask.title || !currentTask.description || !currentTask.pillar}
            className="w-full px-6 py-3 bg-optio-purple hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            Add This Task
          </button>
        </div>
      </div>

      {/* Added Tasks List */}
      {renderAddedTasksList()}

      {/* Footer Actions */}
      <div className="mt-6 flex gap-4">
        <button
          onClick={onCancel}
          className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleFinish}
          disabled={addedTasks.length === 0 || isSubmitting}
          className="flex-1 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink hover:from-purple-700 hover:to-pink-700 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
        >
          {isSubmitting ? 'Finishing...' : `Finish (${addedTasks.length} task${addedTasks.length !== 1 ? 's' : ''})`}
        </button>
      </div>
    </div>
  );
};

ManualTaskCreator.propTypes = {
  questId: PropTypes.string.isRequired,
  sessionId: PropTypes.string.isRequired,
  onTasksCreated: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
};

export default ManualTaskCreator;
