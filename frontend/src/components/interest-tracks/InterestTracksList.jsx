import React, { useState, useEffect } from 'react';
import { PlusIcon, FolderIcon, SparklesIcon, FlagIcon, AcademicCapIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';
import CreateTrackModal from './CreateTrackModal';

const InterestTracksList = ({
  selectedTrackId,
  selectedQuestId,
  onSelectTrack,
  onSelectQuest,
  onSelectUnassigned,
  showUnassigned = false,
  refreshKey = 0,
  className = '',
  onMomentsAssigned = null  // Callback when moments are auto-assigned to a new topic
}) => {
  const [tracks, setTracks] = useState([]);
  const [questTopics, setQuestTopics] = useState([]);
  const [courseTopics, setCourseTopics] = useState([]);
  const [expandedCourses, setExpandedCourses] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [suggestedTracks, setSuggestedTracks] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);

  // Section collapse state
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    courses: false,
    quests: false,
    tracks: false
  });

  useEffect(() => {
    fetchTopics();
  }, [refreshKey]);

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
        // Auto-expand courses that have the selected quest
        if (selectedQuestId) {
          const newExpanded = {};
          (response.data.course_topics || []).forEach(course => {
            if (course.projects?.some(p => p.id === selectedQuestId)) {
              newExpanded[course.id] = true;
            }
          });
          setExpandedCourses(prev => ({ ...prev, ...newExpanded }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch topics:', error);
      // Fallback to old endpoint
      try {
        const fallbackResponse = await api.get('/api/interest-tracks');
        if (fallbackResponse.data.success) {
          setTracks(fallbackResponse.data.tracks);
          setQuestTopics([]);
          setCourseTopics([]);
        }
      } catch (fallbackError) {
        toast.error('Failed to load topics');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCourseExpanded = (courseId) => {
    setExpandedCourses(prev => ({
      ...prev,
      [courseId]: !prev[courseId]
    }));
  };

  const toggleSection = (section) => {
    setSectionsCollapsed(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const fetchSuggestions = async () => {
    try {
      setIsLoadingSuggestions(true);
      const response = await api.get('/api/interest-tracks/suggestions');
      console.log('Suggestions response:', response.data);
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
      // Include moment_ids if creating from a suggestion
      const payload = { ...trackData };
      if (selectedSuggestion?.moment_ids) {
        payload.moment_ids = selectedSuggestion.moment_ids;
      }
      console.log('Creating track with payload:', payload);
      console.log('Selected suggestion:', selectedSuggestion);

      const response = await api.post('/api/interest-tracks', payload);
      console.log('Create track response:', response.data);
      if (response.data.success) {
        const assignedCount = response.data.assigned_count || 0;
        toast.success(response.data.message || 'Topic created!');
        setShowCreateModal(false);

        // Clear all suggestions when creating from an AI suggestion
        if (selectedSuggestion) {
          setSuggestedTracks([]);
          setSelectedSuggestion(null);

          // Notify parent to refresh unassigned moments if moments were auto-assigned
          if (assignedCount > 0) {
            onMomentsAssigned?.();
          }
        }

        fetchTopics();
        onSelectTrack?.(response.data.track.id);
      }
    } catch (error) {
      console.error('Failed to create track:', error);
      toast.error('Failed to create topic');
    }
  };

  // Section header component
  const SectionHeader = ({ label, section, count }) => (
    <button
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between px-2 py-2 mb-2 hover:bg-gray-50 rounded-lg transition-colors"
    >
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">{count}</span>
        {sectionsCollapsed[section] ? (
          <ChevronRightIcon className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDownIcon className="w-4 h-4 text-gray-400" />
        )}
      </div>
    </button>
  );

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

        {/* Interest Topics Section - Load first, fastest */}
        {tracks.length > 0 && (
          <>
            <SectionHeader label="Interest Topics" section="tracks" count={tracks.length} />
            {!sectionsCollapsed.tracks && tracks.map(track => {
              const isSelected = selectedTrackId === track.id;

              return (
                <button
                  key={track.id}
                  onClick={() => onSelectTrack?.(track.id)}
                  className={`
                    w-full p-4 rounded-xl text-left mb-2 transition-all min-h-[60px] touch-manipulation border-2
                    ${isSelected
                      ? 'shadow-sm'
                      : 'hover:shadow-sm active:opacity-90'}
                  `}
                  style={{
                    borderColor: isSelected ? track.color : `${track.color}30`,
                    backgroundColor: isSelected ? `${track.color}15` : `${track.color}08`
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-2 h-8 rounded-full flex-shrink-0"
                      style={{ backgroundColor: track.color }}
                    />
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
          </>
        )}

        {/* Standalone Quests Section */}
        {questTopics.length > 0 && (
          <>
            <SectionHeader label="Standalone Quests" section="quests" count={questTopics.length} />
            {!sectionsCollapsed.quests && questTopics.map(quest => {
              const isSelected = selectedQuestId === quest.id;

              return (
                <button
                  key={quest.id}
                  onClick={() => {
                    console.log('[InterestTracksList] Quest clicked:', quest.id, quest.name);
                    onSelectQuest?.(quest.id);
                  }}
                  className={`
                    w-full p-4 rounded-xl text-left mb-2 transition-all min-h-[60px] touch-manipulation border-2
                    ${isSelected
                      ? 'bg-purple-100 border-purple-300 shadow-sm'
                      : 'bg-purple-50/50 border-purple-200/50 hover:bg-purple-50 hover:border-purple-200 active:opacity-90'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-2 h-8 rounded-full flex-shrink-0 bg-purple-400"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{quest.name}</p>
                      <p className="text-xs text-purple-600">
                        {quest.item_count || quest.moment_count || 0} item{(quest.item_count || quest.moment_count) !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </>
        )}

        {/* Courses Section - Load last, most complex */}
        {courseTopics.length > 0 && (
          <>
            <SectionHeader label="Courses" section="courses" count={courseTopics.length} />
            {!sectionsCollapsed.courses && courseTopics.map(course => {
              const isExpanded = expandedCourses[course.id];
              const hasSelectedProject = course.projects?.some(p => p.id === selectedQuestId);

              return (
                <div key={course.id} className="mb-2">
                  {/* Course Header */}
                  <button
                    onClick={() => toggleCourseExpanded(course.id)}
                    className={`
                      w-full p-4 rounded-xl text-left transition-all min-h-[60px] touch-manipulation border-2
                      ${hasSelectedProject
                        ? 'bg-purple-100 border-purple-300'
                        : 'bg-purple-50/50 border-purple-200/50 hover:bg-purple-50 hover:border-purple-200 active:opacity-90'}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-2 h-8 rounded-full flex-shrink-0 bg-purple-400"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{course.name}</p>
                        <p className="text-xs text-purple-600">
                          {course.projects?.length || 0} project{course.projects?.length !== 1 ? 's' : ''} &middot; {course.item_count || course.moment_count || 0} item{(course.item_count || course.moment_count) !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Nested Projects */}
                  {isExpanded && course.projects?.length > 0 && (
                    <div className="ml-6 mt-1 space-y-1 border-l-2 border-purple-200 pl-3">
                      {course.projects.map(project => {
                        const isProjectSelected = selectedQuestId === project.id;

                        return (
                          <button
                            key={project.id}
                            onClick={() => {
                              console.log('[InterestTracksList] Project clicked:', project.id, project.name);
                              onSelectQuest?.(project.id);
                            }}
                            className={`
                              w-full p-3 rounded-lg text-left transition-all touch-manipulation border
                              ${isProjectSelected
                                ? 'bg-purple-100 border-purple-300'
                                : 'hover:bg-purple-50 border-transparent hover:border-purple-200 active:opacity-90'}
                            `}
                          >
                            <div className="flex items-center gap-2">
                              <FlagIcon className="w-4 h-4 text-purple-500 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{project.name}</p>
                                <p className="text-xs text-gray-500">
                                  {project.item_count || project.moment_count || 0} item{(project.item_count || project.moment_count) !== 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {tracks.length === 0 && questTopics.length === 0 && courseTopics.length === 0 && (
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

      {/* AI Suggestions Section - always show so users can get topic suggestions from unassigned moments */}
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
                    console.log('Clicked suggestion:', suggestion);
                    const suggestionData = {
                      name: suggestion.name,
                      description: suggestion.description || '',
                      color: suggestion.color,
                      moment_ids: suggestion.moment_ids || []
                    };
                    console.log('Setting selected suggestion:', suggestionData);
                    setSelectedSuggestion(suggestionData);
                    setShowCreateModal(true);
                  }}
                  className="w-full p-3 text-left bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100 hover:border-purple-200 transition-all touch-manipulation active:opacity-80"
                >
                  <p className="text-sm font-semibold text-purple-900">{suggestion.name}</p>
                  <p className="text-xs text-purple-600">{suggestion.moment_count} potential moment{suggestion.moment_count !== 1 ? 's' : ''}</p>
                </button>
              ))}
            </div>
          )}
        </div>

      {/* Create Track Modal */}
      <CreateTrackModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setSelectedSuggestion(null);
        }}
        onCreate={handleCreateTrack}
        initialData={selectedSuggestion}
      />
    </div>
  );
};

export default InterestTracksList;
