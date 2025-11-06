import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import SuggestionBox from './SuggestionBox';
import api from '../../services/api';

/**
 * ManualTaskCreator Component
 *
 * Allows students to create custom quest tasks with optional AI suggestions.
 * Features:
 * - Clean, simple form focused on creativity
 * - Auto-trigger suggestions after 3-second typing pause (first time only)
 * - Manual refresh on >20 character changes
 * - Clickable suggestion chips with undo functionality
 * - No gates or approval requirements
 */
const ManualTaskCreator = ({ questId, sessionId, onTasksCreated, onCancel }) => {
  const [currentTask, setCurrentTask] = useState({
    title: '',
    description: '',
    pillar: ''
  });

  const [analysis, setAnalysis] = useState(null); // Store full analysis response
  const [suggestions, setSuggestions] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [addedTasks, setAddedTasks] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Undo functionality
  const [lastAppliedSuggestion, setLastAppliedSuggestion] = useState(null);
  const [previousDescription, setPreviousDescription] = useState('');

  // Auto-trigger state
  const [hasAutoTriggered, setHasAutoTriggered] = useState(false);
  const [descriptionAtLastAnalysis, setDescriptionAtLastAnalysis] = useState('');
  const typingTimeoutRef = useRef(null);

  const pillars = [
    { key: '', label: 'Let AI suggest' },
    { key: 'stem', label: 'STEM' },
    { key: 'wellness', label: 'Wellness' },
    { key: 'communication', label: 'Communication' },
    { key: 'civics', label: 'Civics' },
    { key: 'art', label: 'Art' }
  ];

  // Auto-trigger logic: First call after 3-second typing pause
  useEffect(() => {
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Only auto-trigger if:
    // 1. Haven't triggered yet
    // 2. Have title (3+ chars) and description
    // 3. User stopped typing for 3 seconds
    if (!hasAutoTriggered && currentTask.title.length >= 3 && currentTask.description.trim().length > 0) {
      typingTimeoutRef.current = setTimeout(() => {
        handleAnalyzeTask(true); // true = auto-triggered
      }, 3000);
    }

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [currentTask.title, currentTask.description, hasAutoTriggered]);

  const handleInputChange = (field, value) => {
    setCurrentTask(prev => ({ ...prev, [field]: value }));
    setError('');

    // Smart refresh: Check if description changed significantly (>20 chars) since last analysis
    if (field === 'description' && descriptionAtLastAnalysis) {
      const changeAmount = Math.abs(value.length - descriptionAtLastAnalysis.length);
      if (changeAmount > 20 && !isAnalyzing) {
        // Significant change - refresh suggestions
        handleAnalyzeTask(false);
      }
    }
  };

  const handleAnalyzeTask = async (isAutoTriggered = false) => {
    setError('');

    // Validation
    if (!currentTask.title || currentTask.title.length < 3) {
      if (!isAutoTriggered) {
        setError('Task title must be at least 3 characters');
      }
      return;
    }

    if (!currentTask.description || currentTask.description.trim().length === 0) {
      if (!isAutoTriggered) {
        setError('Task description is required');
      }
      return;
    }

    setIsAnalyzing(true);

    try {
      const response = await api.post(`/api/quests/${questId}/analyze-manual-task`, {
        title: currentTask.title,
        description: currentTask.description,
        pillar: currentTask.pillar || undefined
      });

      if (response.data.success) {
        // Store full analysis for later use
        setAnalysis({
          suggested_xp: response.data.suggested_xp,
          suggested_pillar: response.data.suggested_pillar,
          diploma_subjects: response.data.diploma_subjects
        });

        setSuggestions(response.data.suggestions || []);
        setDescriptionAtLastAnalysis(currentTask.description);

        if (isAutoTriggered) {
          setHasAutoTriggered(true);
        }
      } else {
        setError(response.data.error || 'Failed to get suggestions');
      }
    } catch (err) {
      console.error('Error getting suggestions:', err);
      if (!isAutoTriggered) {
        setError(err.response?.data?.error || 'Failed to get suggestions. Please try again.');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplySuggestion = useCallback((suggestion) => {
    // Save current state for undo
    setPreviousDescription(currentTask.description);
    setLastAppliedSuggestion(suggestion);

    // Append suggestion to description with proper spacing
    const newDescription = currentTask.description.trim()
      ? `${currentTask.description.trim()} ${suggestion}`
      : suggestion;

    setCurrentTask(prev => ({
      ...prev,
      description: newDescription
    }));
  }, [currentTask.description]);

  const handleUndo = useCallback(() => {
    if (previousDescription !== null) {
      setCurrentTask(prev => ({
        ...prev,
        description: previousDescription
      }));
      setPreviousDescription('');
      setLastAppliedSuggestion(null);
    }
  }, [previousDescription]);

  const handleAddTask = async () => {
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

    // If no analysis yet, get it to determine XP and pillar
    let taskData = { ...currentTask };

    if (!analysis) {
      setIsAnalyzing(true);
      try {
        const response = await api.post(`/api/quests/${questId}/analyze-manual-task`, {
          title: currentTask.title,
          description: currentTask.description,
          pillar: currentTask.pillar || undefined
        });

        if (response.data.success) {
          taskData.xp_value = response.data.suggested_xp;
          taskData.pillar = response.data.suggested_pillar;
          taskData.diploma_subjects = response.data.diploma_subjects;
        }
      } catch (err) {
        console.error('Error analyzing task:', err);
        // Use defaults if analysis fails
        taskData.xp_value = 100;
        taskData.pillar = currentTask.pillar || 'stem';
        taskData.diploma_subjects = { 'Electives': 100 };
      } finally {
        setIsAnalyzing(false);
      }
    } else {
      // Use values from last analysis
      taskData.xp_value = analysis.suggested_xp;
      taskData.pillar = analysis.suggested_pillar;
      taskData.diploma_subjects = analysis.diploma_subjects;
    }

    // Add to tasks list
    setAddedTasks(prev => [...prev, taskData]);

    // Reset form
    setCurrentTask({ title: '', description: '', pillar: '' });
    setAnalysis(null);
    setSuggestions(null);
    setDescriptionAtLastAnalysis('');
    setHasAutoTriggered(false);
    setLastAppliedSuggestion(null);
    setPreviousDescription('');
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
                  <span className="text-sm text-purple-600 font-bold">{task.xp_value || 100} XP</span>
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
          Design tasks that spark your curiosity. Our AI can suggest ideas, but you're in control.
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
              disabled={isAnalyzing}
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
              disabled={isAnalyzing}
            />
            <p className="text-xs text-gray-500 mt-1">
              {currentTask.description.length} characters
            </p>
          </div>

          {/* Pillar Selection */}
          <div>
            <label htmlFor="task-pillar" className="block text-sm font-semibold text-gray-700 mb-2">
              Pillar (Optional)
            </label>
            <select
              id="task-pillar"
              value={currentTask.pillar}
              onChange={(e) => handleInputChange('pillar', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={isAnalyzing}
            >
              {pillars.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Suggestion Box (appears automatically or on demand) */}
          <SuggestionBox
            suggestions={suggestions}
            onApplySuggestion={handleApplySuggestion}
            lastAppliedSuggestion={lastAppliedSuggestion}
            onUndo={handleUndo}
            isLoading={isAnalyzing}
          />

          {/* Get Suggestions Button (manual trigger) */}
          {!suggestions && !isAnalyzing && hasAutoTriggered && (
            <button
              onClick={() => handleAnalyzeTask(false)}
              disabled={!currentTask.title || !currentTask.description}
              className="w-full px-6 py-3 bg-purple-100 hover:bg-purple-200 disabled:bg-gray-100 disabled:cursor-not-allowed text-purple-700 font-semibold rounded-lg transition-colors"
            >
              Get Fresh Ideas
            </button>
          )}

          {/* Add Task Button */}
          <button
            onClick={handleAddTask}
            disabled={!currentTask.title || !currentTask.description || isAnalyzing}
            className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
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
          className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
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
