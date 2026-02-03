import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowPathIcon,
  FlagIcon,
  SparklesIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';
import LearningEventCard from '../learning-events/LearningEventCard';

const PILLAR_CONFIG = {
  art: { label: 'Art', color: 'bg-purple-600', light: 'bg-purple-50 text-purple-700 border-purple-200' },
  stem: { label: 'STEM', color: 'bg-blue-600', light: 'bg-blue-50 text-blue-700 border-blue-200' },
  wellness: { label: 'Wellness', color: 'bg-orange-600', light: 'bg-orange-50 text-orange-700 border-orange-200' },
  communication: { label: 'Communication', color: 'bg-green-600', light: 'bg-green-50 text-green-700 border-green-200' },
  civics: { label: 'Civics', color: 'bg-red-600', light: 'bg-red-50 text-red-700 border-red-200' }
};

const ConvertToTaskModal = ({ isOpen, onClose, moment, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [pillar, setPillar] = useState('stem');
  const [xpValue, setXpValue] = useState(100);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && moment) {
      setTitle(moment.title || moment.ai_generated_title || '');
      setPillar(moment.pillars?.[0] || 'stem');
      setXpValue(100);
    }
  }, [isOpen, moment]);

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      const response = await api.post(`/api/learning-events/${moment.id}/convert-to-task`, {
        title: title.trim() || null,
        pillar,
        xp_value: xpValue
      });

      if (response.data.success) {
        toast.success(response.data.message);
        onSuccess?.(response.data.task);
        onClose();
      } else {
        toast.error(response.data.error || 'Failed to create task');
      }
    } catch (error) {
      console.error('Failed to convert moment to task:', error);
      toast.error(error.response?.data?.error || 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink text-white p-5 rounded-t-xl">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold mb-1">Convert to Task</h2>
              <p className="text-white/90 text-sm">Turn this learning moment into a quest task</p>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Task Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title..."
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent text-sm"
            />
          </div>

          {/* Pillar Selection */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Learning Pillar
            </label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PILLAR_CONFIG).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPillar(key)}
                  className={`
                    px-3 py-1.5 rounded-lg border text-sm font-medium transition-all
                    ${pillar === key
                      ? `${config.color} text-white border-transparent`
                      : `${config.light} hover:border-gray-300`}
                  `}
                >
                  {config.label}
                </button>
              ))}
            </div>
          </div>

          {/* XP Value */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              XP Value
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="10"
                max="500"
                step="10"
                value={xpValue}
                onChange={(e) => setXpValue(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-optio-purple"
              />
              <span className="text-sm font-bold text-gray-900 w-16 text-right">{xpValue} XP</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">10 - 500 XP</p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-5 pt-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-xl hover:shadow-lg disabled:opacity-50 transition-all font-medium text-sm flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <SparklesIcon className="w-4 h-4" />
                Create Task
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const QuestMomentsDetail = ({ questId, onMomentConverted, studentId = null }) => {
  const [quest, setQuest] = useState(null);
  const [moments, setMoments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [momentToConvert, setMomentToConvert] = useState(null);

  useEffect(() => {
    console.log('[QuestMomentsDetail] questId changed:', questId);
    if (questId) {
      fetchQuestMoments();
    }
  }, [questId]);

  const fetchQuestMoments = async () => {
    console.log('[QuestMomentsDetail] Fetching moments for quest:', questId);
    try {
      setIsLoading(true);
      const response = await api.get(`/api/quests/${questId}/moments`);
      console.log('[QuestMomentsDetail] API response:', response.data);
      if (response.data.success) {
        setQuest(response.data.quest);
        setMoments(response.data.moments || []);
        console.log('[QuestMomentsDetail] Set moments:', response.data.moments?.length || 0);
      } else {
        console.error('[QuestMomentsDetail] API returned success=false:', response.data.error);
        toast.error(response.data.error || 'Failed to load quest moments');
      }
    } catch (error) {
      console.error('[QuestMomentsDetail] Failed to fetch quest moments:', error);
      toast.error('Failed to load quest moments');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConvertToTask = (moment) => {
    setMomentToConvert(moment);
    setConvertModalOpen(true);
  };

  const handleConvertSuccess = (task) => {
    // Refresh moments to show the task badge
    fetchQuestMoments();
    onMomentConverted?.(task);
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50">
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-gray-200 rounded mb-2" />
            <div className="h-4 w-32 bg-gray-200 rounded" />
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-100 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!quest) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center">
          <FlagIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Quest not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Quest Header */}
      <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">{quest.title}</h2>
              <Link
                to={`/quests/${questId}`}
                className="p-1 text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded transition-colors"
                title="Go to quest"
              >
                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              </Link>
            </div>
            <p className="text-sm text-purple-700">
              {moments.length} learning moment{moments.length !== 1 ? 's' : ''} captured
            </p>
          </div>
          <button
            onClick={fetchQuestMoments}
            className="p-2 text-purple-600 hover:text-purple-800 hover:bg-white/50 rounded-lg transition-colors"
            title="Refresh"
          >
            <ArrowPathIcon className="w-5 h-5" />
          </button>
        </div>

        {quest.description && (
          <p className="mt-3 text-sm text-gray-600 line-clamp-2">{quest.description}</p>
        )}

        {/* Help text */}
        <div className="mt-4 p-3 bg-white/70 rounded-lg border border-purple-200">
          <p className="text-xs text-purple-700">
            <span className="font-medium">Tip:</span> Assign learning moments to this quest to track related discoveries.
            Convert moments into tasks to earn XP!
          </p>
        </div>
      </div>

      {/* Moments List */}
      <div className="flex-1 overflow-y-auto p-6">
        {moments.length > 0 ? (
          <div className="space-y-4">
            {moments.map(item => (
              <div key={item.id} className="relative">
                {item.item_type === 'completed_task' ? (
                  // Completed Task Card
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                            Completed Task
                          </span>
                          {item.xp_value > 0 && (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded">
                              +{item.xp_value} XP
                            </span>
                          )}
                          {item.pillar && PILLAR_CONFIG[item.pillar] && (
                            <span className={`px-2 py-0.5 text-xs font-medium rounded border ${PILLAR_CONFIG[item.pillar].light}`}>
                              {PILLAR_CONFIG[item.pillar].label}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-2">{item.title}</h3>

                        {/* Evidence Blocks */}
                        {item.evidence_blocks && item.evidence_blocks.length > 0 ? (
                          <div className="space-y-2">
                            {item.evidence_blocks.map((block, idx) => (
                              <div key={block.id || idx}>
                                {block.block_type === 'text' && block.content?.text && (
                                  <p className="text-sm text-gray-600">{block.content.text}</p>
                                )}
                                {block.block_type === 'image' && block.content?.url && (
                                  <img
                                    src={block.content.url}
                                    alt={block.content.alt || 'Evidence'}
                                    className="max-w-full max-h-48 rounded-lg border border-gray-200"
                                  />
                                )}
                                {block.block_type === 'link' && block.content?.url && (
                                  <a
                                    href={block.content.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-sm text-green-700 hover:text-green-800 underline"
                                  >
                                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                                    {block.content.title || block.content.url}
                                  </a>
                                )}
                                {block.block_type === 'video' && block.content?.url && (
                                  <a
                                    href={block.content.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-sm text-green-700 hover:text-green-800 underline"
                                  >
                                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                                    {block.content.title || 'Video'}
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : item.description ? (
                          <p className="text-sm text-gray-600">{item.description}</p>
                        ) : null}

                        {item.evidence_url && (
                          <a
                            href={item.evidence_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-2 text-xs text-green-700 hover:text-green-800"
                          >
                            <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                            View evidence
                          </a>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Completed {item.completed_at ? new Date(item.completed_at).toLocaleDateString() : ''}
                    </p>
                  </div>
                ) : (
                  // Learning Moment Card
                  <>
                    <LearningEventCard
                      event={item}
                      showTrackAssign={false}
                      studentId={studentId}
                    />
                    {/* Convert to Task Button - overlaid */}
                    {!item.has_task && item.item_type === 'moment' && (
                      <button
                        onClick={() => handleConvertToTask(item)}
                        className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white text-xs font-medium rounded-lg shadow-sm hover:shadow-md transition-all"
                      >
                        <SparklesIcon className="w-3.5 h-3.5" />
                        Create Task
                      </button>
                    )}
                    {item.has_task && (
                      <div className="absolute top-3 right-3 px-3 py-1.5 bg-green-100 text-green-700 text-xs font-medium rounded-lg">
                        Task Created
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <FlagIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">No moments or completed tasks yet</p>
            <p className="text-sm text-gray-400">
              Capture learning moments or complete tasks to track your progress
            </p>
          </div>
        )}
      </div>

      {/* Convert to Task Modal */}
      <ConvertToTaskModal
        isOpen={convertModalOpen}
        onClose={() => {
          setConvertModalOpen(false);
          setMomentToConvert(null);
        }}
        moment={momentToConvert}
        onSuccess={handleConvertSuccess}
      />
    </div>
  );
};

export default QuestMomentsDetail;
