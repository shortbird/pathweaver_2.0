import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  FlagIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';
import LearningEventCard from '../learning-events/LearningEventCard';
import PromoteToTaskModal from '../learning-events/PromoteToTaskModal';

const PILLAR_CONFIG = {
  art: { label: 'Art', color: 'bg-purple-600', light: 'bg-purple-50 text-purple-700 border-purple-200' },
  stem: { label: 'STEM', color: 'bg-blue-600', light: 'bg-blue-50 text-blue-700 border-blue-200' },
  wellness: { label: 'Wellness', color: 'bg-orange-600', light: 'bg-orange-50 text-orange-700 border-orange-200' },
  communication: { label: 'Communication', color: 'bg-green-600', light: 'bg-green-50 text-green-700 border-green-200' },
  civics: { label: 'Civics', color: 'bg-red-600', light: 'bg-red-50 text-red-700 border-red-200' }
};

const QuestMomentsDetail = ({ questId, refreshKey = 0, onMomentConverted, studentId = null }) => {
  const [quest, setQuest] = useState(null);
  const [moments, setMoments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [promoteModalOpen, setPromoteModalOpen] = useState(false);
  const [momentToPromote, setMomentToPromote] = useState(null);

  useEffect(() => {
    if (questId) {
      fetchQuestMoments();
    }
  }, [questId, refreshKey]);

  const fetchQuestMoments = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const response = await api.get(`/api/quests/${questId}/moments`);
      if (response.data.success) {
        setQuest(response.data.quest);
        setMoments(response.data.moments || []);
      } else {
        const message = response.data.error || 'Failed to load quest moments';
        setLoadError(message);
        toast.error(message);
      }
    } catch (error) {
      const message = error?.response?.data?.error || 'Failed to load quest moments';
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePromote = (moment) => {
    setMomentToPromote(moment);
    setPromoteModalOpen(true);
  };

  const handlePromoteSuccess = (task) => {
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
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center">
          <FlagIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-red-600 mb-3">{loadError}</p>
          <button
            onClick={fetchQuestMoments}
            className="px-4 py-2 text-sm font-medium text-optio-purple bg-purple-50 hover:bg-purple-100 rounded-lg"
          >
            Retry
          </button>
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

        <div className="mt-4 p-3 bg-white/70 rounded-lg border border-purple-200">
          <p className="text-xs text-purple-700">
            <span className="font-medium">Tip:</span> Promote a moment into a task to earn XP. Default 50 XP — adjust on the quest page after.
          </p>
        </div>
      </div>

      {/* Moments List */}
      <div className="flex-1 overflow-y-auto p-6">
        {moments.length > 0 ? (
          <div className="space-y-4">
            {moments.map((item) => (
              <div key={item.id} className="relative">
                {item.item_type === 'completed_task' ? (
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
                  <>
                    <LearningEventCard
                      event={item}
                      showTrackAssign={false}
                      studentId={studentId}
                    />
                    {(() => {
                      // A moment counts as "already promoted" once a quest
                      // task has been created from it, regardless of whether
                      // that task is still pending or already completed.
                      const isPromoted = !!item.promoted_task || !!item.has_task;
                      if (item.item_type !== 'moment') return null;
                      if (isPromoted) {
                        return (
                          <div className="absolute top-3 right-3 px-3 py-1.5 bg-green-100 text-green-700 text-xs font-medium rounded-lg">
                            Task Created
                          </div>
                        );
                      }
                      if (studentId) return null;
                      return (
                        <button
                          onClick={() => handlePromote(item)}
                          className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white text-xs font-medium rounded-lg shadow-sm hover:shadow-md transition-all"
                        >
                          <SparklesIcon className="w-3.5 h-3.5" />
                          Promote to task
                        </button>
                      );
                    })()}
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

      <PromoteToTaskModal
        isOpen={promoteModalOpen}
        onClose={() => {
          setPromoteModalOpen(false);
          setMomentToPromote(null);
        }}
        moment={momentToPromote}
        presetQuestId={questId}
        onSuccess={handlePromoteSuccess}
      />
    </div>
  );
};

export default QuestMomentsDetail;
