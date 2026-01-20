import React, { useState, useEffect } from 'react';
import { XMarkIcon, SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';

const PILLAR_COLORS = {
  stem: 'bg-blue-100 text-blue-700',
  wellness: 'bg-green-100 text-green-700',
  communication: 'bg-purple-100 text-purple-700',
  civics: 'bg-orange-100 text-orange-700',
  art: 'bg-pink-100 text-pink-700'
};

const PILLAR_LABELS = {
  stem: 'STEM',
  wellness: 'Wellness',
  communication: 'Communication',
  civics: 'Civics',
  art: 'Art'
};

const EvolveTopicModal = ({
  isOpen,
  onClose,
  track,
  onSuccess
}) => {
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);

  // Editable fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tasks, setTasks] = useState([]);

  // Fetch AI preview when modal opens
  useEffect(() => {
    if (isOpen && track?.id) {
      fetchPreview();
    }
  }, [isOpen, track?.id]);

  const fetchPreview = async () => {
    setIsLoadingPreview(true);
    setError(null);
    setPreview(null);

    try {
      const response = await api.get(`/api/interest-tracks/${track.id}/evolve/preview`);

      if (response.data.success) {
        const previewData = response.data.preview;
        setPreview(previewData);
        setTitle(previewData.title || '');
        setDescription(previewData.description || '');
        setTasks(previewData.tasks || []);
      } else {
        setError(response.data.error || 'Failed to generate preview');
      }
    } catch (err) {
      console.error('Failed to fetch preview:', err);
      setError(err.response?.data?.error || 'Failed to generate quest preview');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Quest title is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post(`/api/interest-tracks/${track.id}/evolve`, {
        title: title.trim(),
        description: description.trim() || null,
        tasks: tasks
      });

      if (response.data.success) {
        toast.success(response.data.message || 'Topic evolved into quest!');
        handleClose();
        onSuccess?.(response.data.quest_id);
      } else {
        toast.error(response.data.error || 'Failed to evolve topic');
      }
    } catch (err) {
      console.error('Failed to evolve topic:', err);
      const errorMessage = err.response?.data?.error || 'Failed to evolve topic into quest';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setTasks([]);
    setPreview(null);
    setError(null);
    onClose();
  };

  if (!isOpen || !track) return null;

  const momentCount = track.moment_count || track.moments?.length || 0;
  const totalXp = tasks.reduce((sum, t) => sum + (t.xp_value || 0), 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50 rounded-t-xl">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Evolve into Quest</h2>
            <p className="text-sm text-gray-600">
              AI will suggest a quest structure from your {momentCount} moments
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoadingPreview ? (
            // Loading state
            <div className="py-12 text-center">
              <div className="w-12 h-12 mx-auto mb-4 relative">
                <div className="absolute inset-0 border-4 border-purple-200 rounded-full" />
                <div className="absolute inset-0 border-4 border-transparent border-t-optio-purple rounded-full animate-spin" />
              </div>
              <p className="text-gray-600 font-medium">Generating quest structure...</p>
              <p className="text-sm text-gray-500 mt-1">
                AI is analyzing your learning moments
              </p>
            </div>
          ) : error ? (
            // Error state
            <div className="py-12 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                <XMarkIcon className="w-6 h-6 text-red-600" />
              </div>
              <p className="text-gray-900 font-medium mb-2">Failed to generate preview</p>
              <p className="text-sm text-gray-500 mb-4">{error}</p>
              <button
                onClick={fetchPreview}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-optio-purple hover:bg-purple-50 rounded-lg"
              >
                <ArrowPathIcon className="w-4 h-4" />
                Try Again
              </button>
            </div>
          ) : preview ? (
            // Preview loaded - show editable form
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* AI Notice */}
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                <div className="flex items-start gap-2">
                  <SparklesIcon className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-purple-900">
                      AI has analyzed your moments and suggested a quest structure.
                      Review and edit as needed.
                    </p>
                    <p className="text-xs text-purple-600 mt-1">
                      This quest will be private and only visible to you.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quest Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quest Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple text-base"
                  placeholder="Quest title"
                  maxLength={200}
                  required
                />
              </div>

              {/* Quest Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple text-base resize-none"
                  placeholder="What is this quest about?"
                  rows={2}
                  maxLength={1000}
                />
              </div>

              {/* Suggested Tasks */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Suggested Tasks ({tasks.length})
                  </label>
                  <span className="text-sm text-gray-500">
                    Total: {totalXp} XP
                  </span>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {tasks.map((task, index) => (
                    <div
                      key={index}
                      className="p-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm">
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                              {task.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${PILLAR_COLORS[task.pillar] || 'bg-gray-100 text-gray-700'}`}>
                            {PILLAR_LABELS[task.pillar] || task.pillar}
                          </span>
                          <span className="text-xs font-medium text-gray-500">
                            {task.xp_value} XP
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Learning Outcomes */}
              {preview.learning_outcomes && preview.learning_outcomes.length > 0 && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-xs font-medium text-green-800 mb-1">Learning Outcomes:</p>
                  <ul className="text-xs text-green-700 space-y-0.5">
                    {preview.learning_outcomes.map((outcome, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                        {outcome}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </form>
          ) : null}
        </div>

        {/* Footer - Actions */}
        {preview && !isLoadingPreview && !error && (
          <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !title.trim()}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:shadow-lg disabled:opacity-50 font-medium flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Create Quest</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EvolveTopicModal;
