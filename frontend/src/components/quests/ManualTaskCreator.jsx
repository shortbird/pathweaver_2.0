import React, { useState } from 'react';
import PropTypes from 'prop-types';
import QualityScoreGauge from './QualityScoreGauge';
import api from '../../services/api';

/**
 * ManualTaskCreator Component
 *
 * Allows students to create custom quest tasks with AI quality analysis.
 * Tasks with quality score >= 70 are auto-approved.
 */
const ManualTaskCreator = ({ questId, sessionId, onTasksCreated, onCancel }) => {
  const [currentTask, setCurrentTask] = useState({
    title: '',
    description: '',
    pillar: ''
  });

  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [addedTasks, setAddedTasks] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const pillars = [
    { key: '', label: 'Let AI suggest' },
    { key: 'stem', label: 'STEM' },
    { key: 'wellness', label: 'Wellness' },
    { key: 'communication', label: 'Communication' },
    { key: 'civics', label: 'Civics' },
    { key: 'art', label: 'Art' }
  ];

  const handleInputChange = (field, value) => {
    setCurrentTask(prev => ({ ...prev, [field]: value }));
    setAnalysis(null); // Clear analysis when user edits
    setError('');
  };

  const handleAnalyzeTask = async () => {
    setError('');

    // Validation
    if (!currentTask.title || currentTask.title.length < 3) {
      setError('Task title must be at least 3 characters');
      return;
    }

    if (!currentTask.description || currentTask.description.length < 50) {
      setError('Task description must be at least 50 characters (about 3 sentences)');
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
        setAnalysis(response.data);
      } else {
        setError(response.data.error || 'Failed to analyze task');
      }
    } catch (err) {
      console.error('Error analyzing task:', err);
      setError(err.response?.data?.error || 'Failed to analyze task. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddTask = () => {
    if (!analysis) return;

    const taskToAdd = {
      title: currentTask.title,
      description: currentTask.description,
      quality_score: analysis.quality_score,
      xp_value: analysis.suggested_xp,
      pillar: analysis.suggested_pillar,
      diploma_subjects: analysis.diploma_subjects,
      approval_status: analysis.approval_status
    };

    setAddedTasks(prev => [...prev, taskToAdd]);

    // Reset form
    setCurrentTask({ title: '', description: '', pillar: '' });
    setAnalysis(null);
    setError('');
  };

  const handleRemoveTask = (index) => {
    setAddedTasks(prev => prev.filter((_, i) => i !== index));
  };

  const handleRevise = () => {
    setAnalysis(null);
    setError('');
  };

  const handleSubmitAnyway = () => {
    // Allow submission of tasks with score 50-69 for admin review
    handleAddTask();
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

  const renderFeedbackSection = () => {
    if (!analysis) return null;

    const { quality_score, feedback, suggested_xp, suggested_pillar, approval_status, overall_feedback } = analysis;

    const getFeedbackIcon = (score) => {
      if (score >= 20) return '✅';
      if (score >= 15) return '⚠️';
      return '❌';
    };

    return (
      <div className="mt-6 p-6 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-start gap-6">
          {/* Quality Score Gauge */}
          <div className="flex-shrink-0">
            <QualityScoreGauge score={quality_score} size="large" />
          </div>

          {/* Feedback Details */}
          <div className="flex-1 space-y-4">
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-1">Quality Analysis</h4>
              <p className="text-sm text-gray-600">{overall_feedback}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(feedback).map(([criterion, data]) => (
                <div key={criterion} className="bg-white p-3 rounded border border-gray-200">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{getFeedbackIcon(data.score)}</span>
                    <span className="text-sm font-semibold text-gray-900 capitalize">
                      {criterion.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto">
                      {data.score}/25
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">{data.comment}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">XP Value:</span>
                <span className="text-purple-600 font-bold">{suggested_xp} XP</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">Pillar:</span>
                <span className="text-gray-900 capitalize">{suggested_pillar}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              {quality_score >= 70 && (
                <button
                  onClick={handleAddTask}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
                >
                  ✓ Add Task
                </button>
              )}

              {quality_score >= 50 && quality_score < 70 && (
                <>
                  <button
                    onClick={handleRevise}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded-lg transition-colors"
                  >
                    ✏️ Revise
                  </button>
                  <button
                    onClick={handleSubmitAnyway}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                  >
                    Submit for Review
                  </button>
                </>
              )}

              {quality_score < 50 && (
                <button
                  onClick={handleRevise}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
                >
                  ✏️ Revise Task
                </button>
              )}
            </div>

            {approval_status === 'pending_review' && (
              <p className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded border border-yellow-200">
                Note: This task will require admin approval before you can complete it.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAddedTasksList = () => {
    if (addedTasks.length === 0) return null;

    const autoApprovedCount = addedTasks.filter(t => t.approval_status === 'approved').length;
    const pendingCount = addedTasks.length - autoApprovedCount;

    return (
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-lg font-semibold text-gray-900">
            Your Tasks ({addedTasks.length})
          </h4>
          {pendingCount > 0 && (
            <span className="text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded">
              {pendingCount} awaiting review
            </span>
          )}
        </div>

        <div className="space-y-2">
          {addedTasks.map((task, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h5 className="font-semibold text-gray-900">{task.title}</h5>
                  <span className="text-sm text-purple-600 font-bold">{task.xp_value} XP</span>
                  <span className="text-xs text-gray-500 capitalize">({task.pillar})</span>
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
          Design tasks that spark your curiosity and help you explore what interests you.
          Our AI will help ensure your tasks are clear and meaningful.
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
              {currentTask.description.length} characters (minimum 50)
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

          {/* Analyze Button */}
          <button
            onClick={handleAnalyzeTask}
            disabled={isAnalyzing || !currentTask.title || !currentTask.description}
            className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {isAnalyzing ? 'Analyzing Task...' : 'Analyze Task'}
          </button>
        </div>

        {/* Feedback Section */}
        {renderFeedbackSection()}
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
