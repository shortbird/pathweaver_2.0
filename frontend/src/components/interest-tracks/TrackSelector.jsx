import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  XMarkIcon,
  FlagIcon,
  AcademicCapIcon
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

  const fetchTopics = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/topics/unified');
      if (response.data.success) {
        const topics = response.data.topics || [];
        // Separate quests and tracks
        setQuestTopics(topics.filter(t => t.type === 'quest'));
        setTracks(topics.filter(t => t.type === 'track'));
        // Course topics with nested projects
        setCourseTopics(response.data.course_topics || []);
      }
    } catch (error) {
      console.error('Failed to fetch topics:', error);
      // Fallback to old endpoint if unified not available
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

  // Parse value - can be string (track_id), null, or object { type, id }
  const parseValue = () => {
    if (!value) return { type: null, id: null };
    if (typeof value === 'object') return value;
    // Legacy: assume string is track_id
    return { type: 'track', id: value };
  };

  const currentValue = parseValue();

  const handleSelect = (type, id) => {
    // Return object format for new code
    onChange({ type, id });
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
        onChange({ type: 'track', id: newTrack.id });
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

  // Find selected topic
  const getSelectedTopic = () => {
    if (!currentValue.id) return null;
    if (currentValue.type === 'quest' || currentValue.type === 'project') {
      // Check standalone quests
      const standaloneQuest = questTopics.find(q => q.id === currentValue.id);
      if (standaloneQuest) return standaloneQuest;
      // Check course projects
      for (const course of courseTopics) {
        const project = course.projects?.find(p => p.id === currentValue.id);
        if (project) {
          return { ...project, courseName: course.name };
        }
      }
      return null;
    }
    return tracks.find(t => t.id === currentValue.id);
  };

  const selectedTopic = getSelectedTopic();

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Main Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 border border-gray-300 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent transition-colors text-left"
      >
        {selectedTopic ? (
          <div className="flex items-center gap-2">
            {selectedTopic.type === 'quest' || selectedTopic.type === 'project' ? (
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink" />
            ) : (
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: selectedTopic.color || '#9333ea' }}
              />
            )}
            <span className="text-sm font-medium text-gray-900 truncate">
              {selectedTopic.courseName ? `${selectedTopic.courseName}: ` : ''}{selectedTopic.name}
            </span>
            {selectedTopic.type === 'quest' && (
              <span className="text-xs px-1.5 py-0.5 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 rounded flex-shrink-0">
                Quest
              </span>
            )}
            {selectedTopic.type === 'project' && (
              <span className="text-xs px-1.5 py-0.5 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 rounded flex-shrink-0">
                Project
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-500">{placeholder}</span>
        )}
        <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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

              {/* Unassigned option */}
              <button
                type="button"
                onClick={() => handleSelect(null, null)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors ${!currentValue.id ? 'bg-gray-50' : ''}`}
              >
                <div className="w-3 h-3 rounded-full bg-gray-300" />
                <span className="text-sm text-gray-600">No topic</span>
              </button>

              {/* Courses Section */}
              {courseTopics.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-gradient-to-r from-purple-50 to-pink-50 border-y border-purple-100">
                    <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Courses</span>
                  </div>
                  {courseTopics.map(course => {
                    const isExpanded = expandedCourses[course.id];
                    const hasSelectedProject = course.projects?.some(p => p.id === currentValue.id);

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
                        {isExpanded && course.projects?.map(project => (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => handleSelect('project', project.id)}
                            className={`w-full flex items-center gap-2 pl-8 pr-3 py-2 text-left hover:bg-purple-50 transition-colors ${currentValue.id === project.id ? 'bg-purple-100' : ''}`}
                          >
                            <FlagIcon className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-700 truncate">{project.name}</p>
                            </div>
                            <span className="text-xs text-gray-400">{project.moment_count || 0}</span>
                          </button>
                        ))}
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
                  {questTopics.map(quest => (
                    <button
                      key={quest.id}
                      type="button"
                      onClick={() => handleSelect('quest', quest.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-purple-50 transition-colors ${currentValue.type === 'quest' && currentValue.id === quest.id ? 'bg-purple-50' : ''}`}
                    >
                      <div className="w-3 h-3 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{quest.name}</p>
                      </div>
                      <FlagIcon className="w-3.5 h-3.5 text-purple-500" />
                      <span className="text-xs text-gray-400">{quest.moment_count || 0}</span>
                    </button>
                  ))}
                </>
              )}

              {/* Interest Tracks Section */}
              {tracks.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-gray-50 border-y border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Topics of Interest</span>
                  </div>
                  {tracks.map(track => (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() => handleSelect('track', track.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors ${currentValue.type === 'track' && currentValue.id === track.id ? 'bg-gray-50' : ''}`}
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: track.color || '#9333ea' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{track.name}</p>
                      </div>
                      <span className="text-xs text-gray-400">{track.moment_count || 0}</span>
                    </button>
                  ))}
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
