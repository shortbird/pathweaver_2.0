import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  XMarkIcon,
  FlagIcon,
  AcademicCapIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';

const TrackSelector = ({
  value,
  onChange,
  placeholder = 'Select or create topics of interest',
  showAISuggestion = false,
  momentDescription = '',
  className = '',
  studentId = null  // Optional - when parent views child's topics
}) => {
  // Determine if this is parent view mode
  const isParentView = !!studentId;
  const [isOpen, setIsOpen] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [questTopics, setQuestTopics] = useState([]);
  const [courseTopics, setCourseTopics] = useState([]);
  const [expandedCourses, setExpandedCourses] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTrackName, setNewTrackName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchTopics();
  }, [studentId]);

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

  const fetchTopics = async () => {
    try {
      setIsLoading(true);
      const endpoint = isParentView
        ? `/api/parent/children/${studentId}/topics`
        : '/api/topics/unified';
      const response = await api.get(endpoint);
      if (response.data.success) {
        const topics = response.data.topics || [];
        setQuestTopics(topics.filter(t => t.type === 'quest'));
        setTracks(topics.filter(t => t.type === 'track'));
        setCourseTopics(response.data.course_topics || []);
      }
    } catch (error) {
      console.error('Failed to fetch topics:', error);
      if (!isParentView) {
        try {
          const fallbackResponse = await api.get('/api/interest-tracks');
          if (fallbackResponse.data.success) {
            setTracks(fallbackResponse.data.tracks);
            setQuestTopics([]);
            setCourseTopics([]);
          }
        } catch (fallbackError) {
          console.error('Fallback also failed:', fallbackError);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCourseExpanded = (e, courseId) => {
    e.stopPropagation();
    setExpandedCourses(prev => ({
      ...prev,
      [courseId]: !prev[courseId]
    }));
  };

  // Normalize value to always be an array of { type, id }
  const normalizeValue = () => {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(v => v && v.id);
    // Legacy: single object { type, id }
    if (typeof value === 'object' && value.id) return [value];
    // Legacy: string (track_id)
    if (typeof value === 'string') return [{ type: 'track', id: value }];
    return [];
  };

  const selectedTopics = normalizeValue();

  const isSelected = (type, id) => {
    return selectedTopics.some(t => t.id === id && (t.type === type || (type === 'project' && t.type === 'quest')));
  };

  const handleToggle = (type, id) => {
    // Map 'project' to 'quest' for storage (projects are quests in a course)
    const storeType = type === 'project' ? 'quest' : (type === 'quest' ? 'quest' : 'topic');

    if (isSelected(type, id)) {
      // Remove
      const newTopics = selectedTopics.filter(t => t.id !== id);
      onChange(newTopics);
    } else {
      // Add
      const newTopics = [...selectedTopics, { type: storeType, id }];
      onChange(newTopics);
    }
    // Keep dropdown open for multi-select
  };

  const handleClearAll = () => {
    onChange([]);
    setIsOpen(false);
    setIsCreating(false);
    setNewTrackName('');
  };

  const handleRemoveChip = (e, id) => {
    e.stopPropagation();
    const newTopics = selectedTopics.filter(t => t.id !== id);
    onChange(newTopics);
  };

  const handleCreateTrack = async () => {
    if (!newTrackName.trim()) return;

    try {
      setIsSubmitting(true);
      const endpoint = isParentView
        ? `/api/parent/children/${studentId}/topics`
        : '/api/interest-tracks';
      const response = await api.post(endpoint, {
        name: newTrackName.trim()
      });

      if (response.data.success) {
        const newTrack = response.data.track;
        setTracks([...tracks, newTrack]);
        // Add to selection immediately
        const newTopics = [...selectedTopics, { type: 'topic', id: newTrack.id }];
        onChange(newTopics);
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

  // Find topic metadata by type+id for display
  const getTopicInfo = (type, id) => {
    if (type === 'quest') {
      const quest = questTopics.find(q => q.id === id);
      if (quest) return { name: quest.name, color: null, isQuest: true };
      // Check course projects
      for (const course of courseTopics) {
        const project = course.projects?.find(p => p.id === id);
        if (project) return { name: project.name, color: null, isQuest: true, courseName: course.name };
      }
    }
    if (type === 'topic') {
      const track = tracks.find(t => t.id === id);
      if (track) return { name: track.name, color: track.color || '#9333ea', isQuest: false };
    }
    return null;
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Main Button / Chips Area */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 border border-gray-300 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent transition-colors text-left min-h-[44px]"
      >
        <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
          {selectedTopics.length > 0 ? (
            selectedTopics.map(t => {
              const info = getTopicInfo(t.type, t.id);
              if (!info) return null;
              return (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 max-w-[180px]"
                >
                  {info.isQuest ? (
                    <span className="w-2 h-2 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex-shrink-0" />
                  ) : (
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: info.color }}
                    />
                  )}
                  <span className="truncate">{info.name}</span>
                  <button
                    type="button"
                    onClick={(e) => handleRemoveChip(e, t.id)}
                    className="flex-shrink-0 hover:text-red-600 transition-colors"
                  >
                    <XMarkIcon className="w-3 h-3" />
                  </button>
                </span>
              );
            })
          ) : (
            <span className="text-sm text-gray-500">{placeholder}</span>
          )}
        </div>
        <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
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

              {/* No topic option (clear all) */}
              <button
                type="button"
                onClick={handleClearAll}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors ${selectedTopics.length === 0 ? 'bg-gray-50' : ''}`}
              >
                <div className="w-3 h-3 rounded-full bg-gray-300" />
                <span className="text-sm text-gray-600">No topic</span>
                {selectedTopics.length === 0 && (
                  <CheckIcon className="w-4 h-4 text-optio-purple ml-auto" />
                )}
              </button>

              {/* Courses Section */}
              {courseTopics.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-gradient-to-r from-purple-50 to-pink-50 border-y border-purple-100">
                    <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Courses</span>
                  </div>
                  {courseTopics.map(course => {
                    const isExpanded = expandedCourses[course.id];
                    const hasSelectedProject = course.projects?.some(p => isSelected('project', p.id));

                    return (
                      <div key={course.id}>
                        <button
                          type="button"
                          onClick={(e) => toggleCourseExpanded(e, course.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-purple-50 transition-colors ${hasSelectedProject ? 'bg-purple-50' : ''}`}
                        >
                          {isExpanded ? (
                            <ChevronDownIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          ) : (
                            <ChevronRightIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          )}
                          <AcademicCapIcon className="w-4 h-4 text-purple-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{course.name}</p>
                          </div>
                          <span className="text-xs text-gray-400">{course.projects?.length || 0}</span>
                        </button>
                        {isExpanded && course.projects?.map(project => {
                          const selected = isSelected('project', project.id);
                          return (
                            <button
                              key={project.id}
                              type="button"
                              onClick={() => handleToggle('project', project.id)}
                              className={`w-full flex items-center gap-2 pl-8 pr-3 py-2 text-left hover:bg-purple-50 transition-colors ${selected ? 'bg-purple-100' : ''}`}
                            >
                              <FlagIcon className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-700 truncate">{project.name}</p>
                              </div>
                              {selected && <CheckIcon className="w-4 h-4 text-optio-purple flex-shrink-0" />}
                              <span className="text-xs text-gray-400">{project.moment_count || 0}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </>
              )}

              {/* Standalone Quests Section */}
              {questTopics.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-gradient-to-r from-purple-50 to-pink-50 border-y border-purple-100">
                    <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Standalone Quests</span>
                  </div>
                  {questTopics.map(quest => {
                    const selected = isSelected('quest', quest.id);
                    return (
                      <button
                        key={quest.id}
                        type="button"
                        onClick={() => handleToggle('quest', quest.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-purple-50 transition-colors ${selected ? 'bg-purple-50' : ''}`}
                      >
                        <div className="w-3 h-3 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{quest.name}</p>
                        </div>
                        {selected && <CheckIcon className="w-4 h-4 text-optio-purple flex-shrink-0" />}
                        <FlagIcon className="w-3.5 h-3.5 text-purple-500" />
                        <span className="text-xs text-gray-400">{quest.moment_count || 0}</span>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Interest Tracks Section */}
              {tracks.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-gray-50 border-y border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Topics of Interest</span>
                  </div>
                  {tracks.map(track => {
                    const selected = isSelected('track', track.id);
                    return (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => handleToggle('track', track.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors ${selected ? 'bg-gray-100' : ''}`}
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: track.color || '#9333ea' }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{track.name}</p>
                        </div>
                        {selected && <CheckIcon className="w-4 h-4 text-optio-purple flex-shrink-0" />}
                        <span className="text-xs text-gray-400">{track.moment_count || 0}</span>
                      </button>
                    );
                  })}
                </>
              )}

              {tracks.length === 0 && questTopics.length === 0 && courseTopics.length === 0 && !isCreating && (
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
