import React, { useState, useEffect } from 'react';
import {
  ArrowPathIcon,
  SparklesIcon,
  ChevronRightIcon,
  LinkIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';

const ThreadCard = ({ thread, onClick }) => {
  const rootMoment = thread.root_moment;
  const formattedDate = rootMoment.created_at
    ? new Date(rootMoment.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
    : '';

  return (
    <button
      onClick={() => onClick?.(thread)}
      className="w-full p-4 bg-white border border-gray-200 rounded-xl text-left hover:shadow-md hover:border-gray-300 transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-amber-100 to-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <LinkIcon className="w-5 h-5 text-amber-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium text-gray-900 truncate">
              {rootMoment.title || 'Untitled Thread'}
            </h4>
            <span className="text-xs text-gray-400">{formattedDate}</span>
          </div>

          <p className="text-xs text-gray-500 line-clamp-2 mb-2">
            {rootMoment.description?.slice(0, 120)}
            {rootMoment.description?.length > 120 ? '...' : ''}
          </p>

          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
              {thread.child_count + 1} moments
            </span>

            {rootMoment.pillars?.slice(0, 2).map(pillar => (
              <span
                key={pillar}
                className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full"
              >
                {pillar.split('_')[0]}
              </span>
            ))}
          </div>
        </div>

        <ChevronRightIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
      </div>
    </button>
  );
};

const HiddenThreadCard = ({ thread, onCreateThread }) => {
  return (
    <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <SparklesIcon className="w-5 h-5 text-purple-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium text-purple-900">{thread.theme}</h4>
            <span className="text-xs px-2 py-0.5 bg-purple-200 text-purple-700 rounded-full">
              AI Detected
            </span>
          </div>

          <p className="text-xs text-purple-700 mb-2">
            {thread.narrative}
          </p>

          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-600">
              {thread.moments?.length || 0} related moments
            </span>

            <button
              onClick={() => onCreateThread?.(thread)}
              className="text-xs px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Link these moments
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ThreadExplorer = ({
  onThreadSelect,
  onMomentSelect,
  className = ''
}) => {
  const [threads, setThreads] = useState([]);
  const [hiddenThreads, setHiddenThreads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [activeTab, setActiveTab] = useState('existing'); // 'existing' | 'hidden'

  useEffect(() => {
    fetchThreads();
  }, []);

  const fetchThreads = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/learning-events/threads');
      if (response.data.success) {
        setThreads(response.data.threads || []);
      }
    } catch (error) {
      console.error('Failed to fetch threads:', error);
      toast.error('Failed to load threads');
    } finally {
      setIsLoading(false);
    }
  };

  const detectHiddenThreads = async () => {
    try {
      setIsDetecting(true);
      const response = await api.get('/api/learning-events/detect-threads');
      if (response.data.success) {
        setHiddenThreads(response.data.hidden_threads || []);
        if (response.data.hidden_threads?.length > 0) {
          toast.success(`Found ${response.data.hidden_threads.length} potential threads!`);
        } else {
          toast.success('No hidden threads detected');
        }
      }
    } catch (error) {
      console.error('Failed to detect threads:', error);
      toast.error('Failed to detect hidden threads');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleCreateThreadFromHidden = async (hiddenThread) => {
    // Link the moments by setting parent_moment_id
    // This would require a new endpoint or multiple calls
    toast.success('Thread linking coming soon!');
  };

  const handleThreadClick = (thread) => {
    onThreadSelect?.(thread);
    // Also select the root moment
    if (thread.root_moment) {
      onMomentSelect?.(thread.root_moment);
    }
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">Curiosity Threads</h2>
          <button
            onClick={fetchThreads}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <ArrowPathIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('existing')}
            className={`
              flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors
              ${activeTab === 'existing'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
            `}
          >
            My Threads ({threads.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('hidden');
              if (hiddenThreads.length === 0) {
                detectHiddenThreads();
              }
            }}
            className={`
              flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1
              ${activeTab === 'hidden'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-100 text-purple-700 hover:bg-purple-200'}
            `}
          >
            <SparklesIcon className="w-4 h-4" />
            Discover
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'existing' ? (
          // Existing threads
          isLoading ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-gray-100 rounded-xl" />
              ))}
            </div>
          ) : threads.length > 0 ? (
            <div className="space-y-3">
              {threads.map(thread => (
                <ThreadCard
                  key={thread.root_moment.id}
                  thread={thread}
                  onClick={handleThreadClick}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <LinkIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-2">No threads yet</p>
              <p className="text-sm text-gray-400">
                Link moments together using "What sparked this?" when capturing
              </p>
            </div>
          )
        ) : (
          // Hidden threads (AI detected)
          isDetecting ? (
            <div className="text-center py-12">
              <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-500">Analyzing your learning moments...</p>
              <p className="text-xs text-gray-400 mt-1">Looking for hidden connections</p>
            </div>
          ) : hiddenThreads.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 mb-4">
                AI found {hiddenThreads.length} potential thread{hiddenThreads.length !== 1 ? 's' : ''} in your unlinked moments:
              </p>
              {hiddenThreads.map((thread, index) => (
                <HiddenThreadCard
                  key={index}
                  thread={thread}
                  onCreateThread={handleCreateThreadFromHidden}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <SparklesIcon className="w-12 h-12 text-purple-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-2">No hidden threads detected</p>
              <p className="text-sm text-gray-400 mb-4">
                Keep capturing moments - patterns will emerge over time
              </p>
              <button
                onClick={detectHiddenThreads}
                className="text-sm text-purple-600 hover:underline"
              >
                Scan again
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default ThreadExplorer;
