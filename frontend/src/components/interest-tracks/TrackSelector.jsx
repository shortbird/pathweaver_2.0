import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDownIcon,
  PlusIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';

const TrackSelector = ({
  value,
  onChange,
  placeholder = 'Select or create a topic of interest',
  showAISuggestion = false,
  momentDescription = '',
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTrackName, setNewTrackName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchTracks();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setIsCreating(false);
        setNewTrackName('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  const fetchTracks = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/interest-tracks');
      if (response.data.success) {
        setTracks(response.data.tracks);
      }
    } catch (error) {
      console.error('Failed to fetch tracks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (trackId) => {
    onChange(trackId);
    setIsOpen(false);
    setIsCreating(false);
    setNewTrackName('');
  };

  const handleCreateTrack = async () => {
    if (!newTrackName.trim()) return;

    try {
      setIsSubmitting(true);
      const response = await api.post('/api/interest-tracks', {
        name: newTrackName.trim()
      });

      if (response.data.success) {
        const newTrack = response.data.track;
        setTracks([...tracks, newTrack]);
        onChange(newTrack.id);
        setIsOpen(false);
        setIsCreating(false);
        setNewTrackName('');
        toast.success(`Created "${newTrack.name}"`);
      }
    } catch (error) {
      console.error('Failed to create track:', error);
      toast.error('Failed to create topic');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateTrack();
    } else if (e.key === 'Escape') {
      setIsCreating(false);
      setNewTrackName('');
    }
  };

  const selectedTrack = tracks.find(t => t.id === value);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Main Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 border border-gray-300 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent transition-colors text-left"
      >
        {selectedTrack ? (
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: selectedTrack.color || '#9333ea' }}
            />
            <span className="text-sm font-medium text-gray-900">{selectedTrack.name}</span>
          </div>
        ) : (
          <span className="text-sm text-gray-500">{placeholder}</span>
        )}
        <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 text-center text-sm text-gray-500">Loading...</div>
          ) : (
            <>
              {/* Create new track input */}
              {isCreating ? (
                <div className="p-2 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={newTrackName}
                      onChange={(e) => setNewTrackName(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Enter topic name..."
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={handleCreateTrack}
                      disabled={!newTrackName.trim() || isSubmitting}
                      className="px-3 py-2 text-sm font-medium text-white bg-optio-purple rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? '...' : 'Add'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreating(false);
                        setNewTrackName('');
                      }}
                      className="p-2 text-gray-400 hover:text-gray-600"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left border-b border-gray-100 hover:bg-gray-50 text-optio-purple transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  <span className="text-sm font-medium">Create new topic</span>
                </button>
              )}

              {/* Unassigned option */}
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors ${value === null ? 'bg-gray-50' : ''}`}
              >
                <div className="w-3 h-3 rounded-full bg-gray-300" />
                <span className="text-sm text-gray-600">No topic</span>
              </button>

              {/* Track options */}
              {tracks.map(track => (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => handleSelect(track.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors ${value === track.id ? 'bg-gray-50' : ''}`}
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: track.color || '#9333ea' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{track.name}</p>
                  </div>
                  <span className="text-xs text-gray-400">{track.moment_count || 0}</span>
                </button>
              ))}

              {tracks.length === 0 && !isCreating && (
                <div className="p-3 text-center text-sm text-gray-500">
                  No topics yet
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default TrackSelector;
