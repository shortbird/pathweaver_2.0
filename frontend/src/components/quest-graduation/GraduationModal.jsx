import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  AcademicCapIcon,
  SparklesIcon,
  PencilIcon,
  CheckIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';

const PILLAR_CONFIG = {
  arts_creativity: { label: 'Arts & Creativity', color: 'bg-pink-100 text-pink-800' },
  stem_logic: { label: 'STEM & Logic', color: 'bg-blue-100 text-blue-800' },
  life_wellness: { label: 'Life & Wellness', color: 'bg-green-100 text-green-800' },
  language_communication: { label: 'Language & Communication', color: 'bg-orange-100 text-orange-800' },
  society_culture: { label: 'Society & Culture', color: 'bg-red-100 text-red-800' }
};

const GraduationModal = ({
  isOpen,
  onClose,
  onSuccess,
  trackId = null,
  momentIds = null,
  trackName = ''
}) => {
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Editable fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);

  // Suggestions
  const [suggestions, setSuggestions] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (isOpen && (trackId || momentIds)) {
      fetchPreview();
    }
  }, [isOpen, trackId, momentIds]);

  const fetchPreview = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const payload = trackId ? { track_id: trackId } : { moment_ids: momentIds };
      const response = await api.post('/api/quest-conversions/preview', payload);

      if (response.data.success) {
        const previewData = response.data.preview;
        setPreview(previewData);
        setTitle(previewData.title || '');
        setDescription(previewData.description || '');
      } else {
        setError(response.data.error || 'Failed to generate preview');
      }
    } catch (error) {
      console.error('Failed to fetch preview:', error);
      setError('Failed to generate quest preview');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSuggestions = async () => {
    try {
      const payload = trackId ? { track_id: trackId } : { moment_ids: momentIds };
      const response = await api.post('/api/quest-conversions/suggest-improvements', payload);

      if (response.data.success) {
        setSuggestions(response.data.suggestions);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    }
  };

  const handleSubmit = async () => {
    if (!preview) return;

    setIsSubmitting(true);
    try {
      const response = await api.post('/api/quest-conversions/create', {
        preview: preview,
        title: title || preview.title,
        description: description || preview.description
      });

      if (response.data.success) {
        toast.success(`Quest created! You earned ${response.data.xp_awarded} XP.`);
        onSuccess?.(response.data.quest);
        onClose();
      } else {
        toast.error(response.data.error || 'Failed to create quest');
      }
    } catch (error) {
      console.error('Failed to create quest:', error);
      toast.error('Failed to create quest');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <AcademicCapIcon className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Graduate to Quest</h2>
                <p className="text-white/80 text-sm">
                  Convert your learning moments into a formal achievement
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Generating quest preview...</p>
              <p className="text-xs text-gray-400 mt-1">Analyzing your learning moments</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <ExclamationTriangleIcon className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={fetchPreview}
                className="text-sm text-amber-600 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : preview && (
            <div className="space-y-6">
              {/* Quest Title */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Quest Title</label>
                  <button
                    onClick={() => setIsEditingTitle(!isEditingTitle)}
                    className="text-xs text-amber-600 hover:underline flex items-center gap-1"
                  >
                    <PencilIcon className="w-3 h-3" />
                    {isEditingTitle ? 'Done' : 'Edit'}
                  </button>
                </div>
                {isEditingTitle ? (
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-amber-200 rounded-lg focus:outline-none focus:border-amber-400 text-lg font-semibold"
                    placeholder="Enter quest title..."
                  />
                ) : (
                  <h3 className="text-xl font-bold text-gray-900 bg-amber-50 px-4 py-3 rounded-lg">
                    {title || preview.title}
                  </h3>
                )}
              </div>

              {/* Quest Description */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Description</label>
                  <button
                    onClick={() => setIsEditingDescription(!isEditingDescription)}
                    className="text-xs text-amber-600 hover:underline flex items-center gap-1"
                  >
                    <PencilIcon className="w-3 h-3" />
                    {isEditingDescription ? 'Done' : 'Edit'}
                  </button>
                </div>
                {isEditingDescription ? (
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-amber-200 rounded-lg focus:outline-none focus:border-amber-400 resize-none"
                    rows={3}
                    placeholder="Describe your learning journey..."
                  />
                ) : (
                  <p className="text-gray-600 bg-gray-50 px-4 py-3 rounded-lg">
                    {description || preview.description}
                  </p>
                )}
              </div>

              {/* Tasks */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  Tasks ({preview.tasks?.length || 0})
                </h4>
                <div className="space-y-2">
                  {preview.tasks?.map((task, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <CheckIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {task.title}
                          </p>
                          {task.pillar && PILLAR_CONFIG[task.pillar] && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${PILLAR_CONFIG[task.pillar].color}`}>
                              {PILLAR_CONFIG[task.pillar].label}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right ml-3">
                        <p className="text-sm font-bold text-amber-600">+{task.xp_value} XP</p>
                        {task.original_xp && task.original_xp !== task.xp_value && (
                          <p className="text-xs text-gray-400 line-through">
                            {task.original_xp} XP
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* XP Summary */}
              <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Total XP to be awarded</span>
                  <span className="text-2xl font-bold text-amber-600">
                    +{preview.total_xp} XP
                  </span>
                </div>
                {preview.original_total_xp && preview.original_total_xp !== preview.total_xp && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>Retroactive rate ({Math.round(preview.xp_multiplier * 100)}%):</span>
                    <span className="line-through">{preview.original_total_xp} XP</span>
                    <span className="text-amber-600 font-medium">{preview.total_xp} XP</span>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  Learning moments captured retroactively earn {Math.round((preview.xp_multiplier || 0.8) * 100)}% XP
                  to encourage real-time capture.
                </p>
              </div>

              {/* AI Suggestions */}
              {!showSuggestions && (
                <button
                  onClick={fetchSuggestions}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm text-purple-600 hover:bg-purple-50 rounded-lg border border-purple-200 transition-colors"
                >
                  <SparklesIcon className="w-4 h-4" />
                  See what else you could add (optional)
                </button>
              )}

              {showSuggestions && suggestions && (
                <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                  <div className="flex items-center gap-2 mb-3">
                    <SparklesIcon className="w-5 h-5 text-purple-600" />
                    <span className="font-medium text-purple-900">Areas to Consider</span>
                  </div>

                  {suggestions.overall_assessment && (
                    <p className="text-sm text-gray-600 mb-3">{suggestions.overall_assessment}</p>
                  )}

                  {suggestions.missing_areas?.length > 0 ? (
                    <div className="space-y-2">
                      {suggestions.missing_areas.slice(0, 3).map((area, idx) => (
                        <div key={idx} className="p-2 bg-white rounded-lg text-sm">
                          <p className="font-medium text-purple-900">{area.area}</p>
                          <p className="text-gray-500 text-xs">{area.why_valuable}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-purple-700">
                      Your learning coverage looks comprehensive!
                    </p>
                  )}

                  <p className="text-xs text-purple-600 mt-3">
                    These are optional suggestions. You can proceed with graduation now.
                  </p>
                </div>
              )}

              {/* Source Info */}
              <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
                <p>
                  Converting {preview.moment_count} learning moment{preview.moment_count !== 1 ? 's' : ''}
                  {trackName && <span> from track "{trackName}"</span>}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && !error && preview && (
          <div className="p-4 border-t border-gray-200 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:shadow-lg disabled:opacity-50 font-medium flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <AcademicCapIcon className="w-5 h-5" />
                  <span>Graduate to Quest (+{preview.total_xp} XP)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GraduationModal;
