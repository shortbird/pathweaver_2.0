import React, { useState, useEffect } from 'react';
import { PlusIcon, FolderIcon, SparklesIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';
import CreateTrackModal from './CreateTrackModal';

// Icon mapping
const ICON_MAP = {
  folder: FolderIcon,
  star: ({ className }) => <span className={className}>⭐</span>,
  book: ({ className }) => <span className={className}>📚</span>,
  code: ({ className }) => <span className={className}>💻</span>,
  paint: ({ className }) => <span className={className}>🎨</span>,
  music: ({ className }) => <span className={className}>🎵</span>,
  science: ({ className }) => <span className={className}>🔬</span>,
  globe: ({ className }) => <span className={className}>🌍</span>,
  lightbulb: ({ className }) => <span className={className}>💡</span>,
  heart: ({ className }) => <span className={className}>❤️</span>,
};

const InterestTracksList = ({
  selectedTrackId,
  onSelectTrack,
  onSelectUnassigned,
  showUnassigned = false,
  className = ''
}) => {
  const [tracks, setTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [suggestedTracks, setSuggestedTracks] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  useEffect(() => {
    fetchTracks();
  }, []);

  const fetchTracks = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/interest-tracks');
      if (response.data.success) {
        setTracks(response.data.tracks);
      }
    } catch (error) {
      console.error('Failed to fetch tracks:', error);
      toast.error('Failed to load topics');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSuggestions = async () => {
    try {
      setIsLoadingSuggestions(true);
      const response = await api.get('/api/interest-tracks/suggestions');
      if (response.data.success) {
        setSuggestedTracks(response.data.suggested_tracks || []);
      }
    } catch (error) {
      console.error('Failed to get track suggestions:', error);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleCreateTrack = async (trackData) => {
    try {
      const response = await api.post('/api/interest-tracks', trackData);
      if (response.data.success) {
        toast.success('Topic created!');
        setShowCreateModal(false);
        fetchTracks();
        onSelectTrack?.(response.data.track.id);
      }
    } catch (error) {
      console.error('Failed to create track:', error);
      toast.error('Failed to create topic');
    }
  };

  const getIconComponent = (iconName) => {
    const IconComponent = ICON_MAP[iconName] || FolderIcon;
    return IconComponent;
  };

  if (isLoading) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-gray-900">Topics of Interest</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-2.5 text-optio-purple hover:bg-purple-50 rounded-xl transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Create new topic"
          >
            <PlusIcon className="w-6 h-6" />
          </button>
        </div>
        <p className="text-xs text-gray-500">Organize your learning moments</p>
      </div>

      {/* Track List */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Unassigned moments option */}
        <button
          onClick={() => {
            onSelectUnassigned?.();
            onSelectTrack?.(null);
          }}
          className={`
            w-full p-4 rounded-xl text-left mb-2 transition-all min-h-[60px] touch-manipulation
            ${showUnassigned
              ? 'bg-gray-100 border-2 border-gray-300'
              : 'hover:bg-gray-50 border-2 border-transparent active:bg-gray-100'}
          `}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
              <FolderIcon className="w-5 h-5 text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-700 truncate">Unassigned</p>
              <p className="text-xs text-gray-500">Moments without a topic</p>
            </div>
          </div>
        </button>

        {/* Track cards */}
        {tracks.map(track => {
          const IconComponent = getIconComponent(track.icon);
          const isSelected = selectedTrackId === track.id;

          return (
            <button
              key={track.id}
              onClick={() => onSelectTrack?.(track.id)}
              className={`
                w-full p-4 rounded-xl text-left mb-2 transition-all min-h-[60px] touch-manipulation
                ${isSelected
                  ? 'border-2 shadow-sm'
                  : 'hover:bg-gray-50 border-2 border-transparent active:bg-gray-100'}
              `}
              style={{
                borderColor: isSelected ? track.color : 'transparent',
                backgroundColor: isSelected ? `${track.color}10` : undefined
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                  style={{ backgroundColor: track.color }}
                >
                  {typeof IconComponent === 'function' && IconComponent.prototype?.render ? (
                    <IconComponent className="w-5 h-5" />
                  ) : (
                    <IconComponent className="text-base" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{track.name}</p>
                  <p className="text-xs text-gray-500">
                    {track.moment_count || 0} moment{track.moment_count !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </button>
          );
        })}

        {tracks.length === 0 && (
          <div className="text-center py-8 px-4">
            <FolderIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-4">No topics yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full py-3 px-4 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-xl font-medium text-sm touch-manipulation active:opacity-80"
            >
              Create your first topic
            </button>
          </div>
        )}
      </div>

      {/* AI Suggestions Section */}
      {tracks.length > 0 && (
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={fetchSuggestions}
            disabled={isLoadingSuggestions}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm text-purple-600 hover:bg-purple-50 rounded-xl transition-colors touch-manipulation min-h-[44px]"
          >
            <SparklesIcon className={`w-4 h-4 ${isLoadingSuggestions ? 'animate-spin' : ''}`} />
            {isLoadingSuggestions ? 'Analyzing...' : 'Suggest new topics'}
          </button>

          {suggestedTracks.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500 font-medium">AI Suggested Topics:</p>
              {suggestedTracks.slice(0, 3).map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setShowCreateModal(true);
                    // Pass suggestion data to modal via state or context
                  }}
                  className="w-full p-3 text-left bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100 hover:border-purple-200 transition-all touch-manipulation active:opacity-80"
                >
                  <p className="text-sm font-semibold text-purple-900">{suggestion.name}</p>
                  <p className="text-xs text-purple-600">{suggestion.moment_count} potential moments</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Track Modal */}
      <CreateTrackModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateTrack}
      />
    </div>
  );
};

export default InterestTracksList;
