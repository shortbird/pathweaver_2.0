import React, { useState, useEffect } from 'react';
import {
  ArrowPathIcon,
  SparklesIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';

const ThreadMomentCard = ({ moment, isRoot, isCurrent, depth = 0, onClick }) => {
  const formattedDate = moment.created_at
    ? new Date(moment.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
    : '';

  return (
    <div className={`flex items-start ${depth > 0 ? 'ml-6' : ''}`}>
      {/* Connector line */}
      {depth > 0 && (
        <div className="flex items-center mr-2">
          <div className="w-4 h-px bg-gray-300" />
          <ChevronRightIcon className="w-3 h-3 text-gray-400" />
        </div>
      )}

      <button
        onClick={() => onClick?.(moment)}
        className={`
          flex-1 p-3 rounded-lg border-2 text-left transition-all
          hover:shadow-md
          ${isCurrent
            ? 'border-optio-purple bg-purple-50'
            : isRoot
              ? 'border-amber-300 bg-amber-50'
              : 'border-gray-200 bg-white hover:border-gray-300'}
        `}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isRoot && (
                <span className="text-xs px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded-full font-medium">
                  Root
                </span>
              )}
              {isCurrent && (
                <span className="text-xs px-1.5 py-0.5 bg-purple-200 text-purple-800 rounded-full font-medium">
                  Current
                </span>
              )}
            </div>
            <h4 className="text-sm font-medium text-gray-900 truncate">
              {moment.title || 'Untitled Moment'}
            </h4>
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
              {moment.description?.slice(0, 100)}
              {moment.description?.length > 100 ? '...' : ''}
            </p>
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">{formattedDate}</span>
        </div>

        {/* Pillars */}
        {moment.pillars && moment.pillars.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {moment.pillars.slice(0, 2).map(pillar => (
              <span
                key={pillar}
                className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded"
              >
                {pillar.split('_')[0]}
              </span>
            ))}
          </div>
        )}
      </button>
    </div>
  );
};

const ThreadView = ({
  momentId,
  onMomentClick,
  className = ''
}) => {
  const [thread, setThread] = useState(null);
  const [narrative, setNarrative] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingNarrative, setIsLoadingNarrative] = useState(false);

  useEffect(() => {
    if (momentId) {
      fetchThread();
    }
  }, [momentId]);

  const fetchThread = async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/api/learning-events/${momentId}/thread`);
      if (response.data.success) {
        setThread(response.data.thread);
      }
    } catch (error) {
      console.error('Failed to fetch thread:', error);
      toast.error('Failed to load thread');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNarrative = async () => {
    try {
      setIsLoadingNarrative(true);
      const response = await api.get(`/api/learning-events/${momentId}/thread-narrative`);
      if (response.data.success) {
        setNarrative(response.data.narrative);
      }
    } catch (error) {
      console.error('Failed to fetch narrative:', error);
    } finally {
      setIsLoadingNarrative(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-20 bg-gray-100 rounded-lg" />
          <div className="h-20 bg-gray-100 rounded-lg ml-6" />
          <div className="h-20 bg-gray-100 rounded-lg ml-6" />
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className={`p-4 text-center text-gray-500 ${className}`}>
        Thread not found
      </div>
    );
  }

  const allMoments = [
    ...(thread.ancestors || []),
    thread.current_moment,
    ...(thread.descendants || [])
  ];

  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Thread View</h3>
          <p className="text-sm text-gray-500">
            {thread.total_moments} moment{thread.total_moments !== 1 ? 's' : ''} in this thread
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchThread}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <ArrowPathIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Thread Timeline */}
      <div className="space-y-3 mb-6">
        {/* Ancestors */}
        {thread.ancestors?.map((moment, index) => (
          <ThreadMomentCard
            key={moment.id}
            moment={moment}
            isRoot={index === 0}
            isCurrent={false}
            depth={0}
            onClick={onMomentClick}
          />
        ))}

        {/* Current moment */}
        <ThreadMomentCard
          moment={thread.current_moment}
          isRoot={thread.ancestors?.length === 0}
          isCurrent={true}
          depth={thread.ancestors?.length > 0 ? 1 : 0}
          onClick={onMomentClick}
        />

        {/* Descendants */}
        {thread.descendants?.map((moment) => (
          <ThreadMomentCard
            key={moment.id}
            moment={moment}
            isRoot={false}
            isCurrent={false}
            depth={(moment.depth || 1) + (thread.ancestors?.length > 0 ? 1 : 0)}
            onClick={onMomentClick}
          />
        ))}
      </div>

      {/* AI Narrative Section */}
      {thread.total_moments >= 2 && (
        <div className="border-t border-gray-200 pt-4">
          {narrative ? (
            <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <SparklesIcon className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-purple-900">Thread Narrative</span>
                {narrative.theme && (
                  <span className="text-xs px-2 py-0.5 bg-purple-200 text-purple-800 rounded-full">
                    {narrative.theme}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-700 mb-3">{narrative.text}</p>

              {narrative.key_insight && (
                <div className="mb-2">
                  <span className="text-xs font-medium text-purple-700">Key Insight: </span>
                  <span className="text-xs text-gray-600">{narrative.key_insight}</span>
                </div>
              )}

              {narrative.potential_next_step && (
                <div className="p-2 bg-white/50 rounded-lg">
                  <span className="text-xs font-medium text-purple-700">Where this might lead: </span>
                  <span className="text-xs text-gray-600">{narrative.potential_next_step}</span>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={fetchNarrative}
              disabled={isLoadingNarrative}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors border border-purple-200"
            >
              <SparklesIcon className={`w-4 h-4 ${isLoadingNarrative ? 'animate-spin' : ''}`} />
              {isLoadingNarrative ? 'Generating narrative...' : 'Generate AI Narrative'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ThreadView;
