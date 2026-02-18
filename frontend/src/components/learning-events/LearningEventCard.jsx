import React, { useState, useRef, useEffect } from 'react';
import {
  CalendarIcon,
  LinkIcon,
  DocumentIcon,
  FolderPlusIcon,
  PlusIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FlagIcon,
  AcademicCapIcon
} from '@heroicons/react/24/outline';
import LearningEventDetailModal from './LearningEventDetailModal';
import { getPillarData } from '../../utils/pillarMappings';
import api from '../../services/api';
import toast from 'react-hot-toast';

const LearningEventCard = ({ event, onUpdate, showTrackAssign, onTrackAssigned, studentId = null }) => {
  const [localEvent, setLocalEvent] = useState(event);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showTopicDropdown, setShowTopicDropdown] = useState(false);
  const [topics, setTopics] = useState({ tracks: [], quests: [], courses: [] });
  const [expandedCourses, setExpandedCourses] = useState({});
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTrackName, setNewTrackName] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const isParentView = !!studentId;

  // Sync local event with prop when parent provides new data
  useEffect(() => {
    setLocalEvent(event);
  }, [event]);

  // Handle event updates from edit modal
  const handleEventUpdate = (updatedEvent) => {
    if (updatedEvent) {
      setLocalEvent(updatedEvent);
    }
    if (onUpdate) onUpdate(updatedEvent);
    else if (onTrackAssigned) onTrackAssigned(updatedEvent);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowTopicDropdown(false);
        setIsCreating(false);
        setNewTrackName('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when creating
  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const displayDate = localEvent.event_date || localEvent.created_at;

  const hasEvidence = localEvent.evidence_blocks && localEvent.evidence_blocks.length > 0;

  // Fetch topics when dropdown opens (always refresh)
  const fetchTopics = async () => {
    try {
      setIsLoadingTopics(true);
      const endpoint = isParentView
        ? `/api/parent/children/${studentId}/topics`
        : '/api/topics/unified';
      const response = await api.get(endpoint);
      if (response.data.success) {
        const allTopics = response.data.topics || [];
        setTopics({
          tracks: allTopics.filter(t => t.type === 'track'),
          quests: allTopics.filter(t => t.type === 'quest'),
          courses: response.data.course_topics || []
        });
      }
    } catch (error) {
      console.error('Failed to fetch topics:', error);
    } finally {
      setIsLoadingTopics(false);
    }
  };

  const handleOpenDropdown = (e) => {
    e.stopPropagation();
    setShowTopicDropdown(true);
    fetchTopics();
  };

  const toggleCourseExpanded = (e, courseId) => {
    e.stopPropagation();
    setExpandedCourses(prev => ({
      ...prev,
      [courseId]: !prev[courseId]
    }));
  };

  const handleAssignToTopic = async (type, topicId) => {
    try {
      setIsAssigning(true);

      // Use the assign-topic endpoint with action:'add' for additive assignment
      const endpoint = isParentView
        ? `/api/parent/children/${studentId}/learning-events/${localEvent.id}/assign-topic`
        : `/api/learning-events/${localEvent.id}/assign-topic`;

      const payload = {
        type: type === 'project' ? 'quest' : type,
        topic_id: topicId,
        action: 'add'
      };

      const response = await api.post(endpoint, payload);

      if (response.data.success) {
        toast.success('Moment assigned to topic');
        setShowTopicDropdown(false);
        if (onTrackAssigned) {
          onTrackAssigned(response.data.moment || response.data.event);
        }
      }
    } catch (error) {
      console.error('Failed to assign topic:', error);
      toast.error('Failed to assign to topic');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleCreateTrack = async () => {
    if (!newTrackName.trim()) return;

    try {
      setIsAssigning(true);
      const endpoint = isParentView
        ? `/api/parent/children/${studentId}/topics`
        : '/api/interest-tracks';

      const response = await api.post(endpoint, {
        name: newTrackName.trim(),
        moment_ids: [localEvent.id]
      });

      if (response.data.success) {
        toast.success(`Created "${newTrackName}" and added moment`);
        setShowTopicDropdown(false);
        setIsCreating(false);
        setNewTrackName('');
        // Clear cached topics so next fetch gets fresh data
        setTopics({ tracks: [], quests: [], courses: [] });
        if (onTrackAssigned) {
          onTrackAssigned(response.data.track || localEvent);
        }
      }
    } catch (error) {
      console.error('Failed to create track:', error);
      toast.error('Failed to create topic');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleCreateTrack();
    } else if (e.key === 'Escape') {
      setIsCreating(false);
      setNewTrackName('');
    }
  };

  // Render evidence preview
  const renderEvidencePreview = () => {
    if (!hasEvidence) return null;

    const images = localEvent.evidence_blocks.filter(b => b.block_type === 'image' && b.content?.url);
    const links = localEvent.evidence_blocks.filter(b => b.block_type === 'link' && b.content?.url);
    const documents = localEvent.evidence_blocks.filter(b => b.block_type === 'document');

    return (
      <div className="space-y-2">
        {/* Images - large and prominent */}
        {images.length > 0 && (
          <div className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {images.slice(0, 4).map((block, idx) => (
              <div key={idx} className={`relative ${images.length === 1 ? 'aspect-video' : 'aspect-square'}`}>
                <img
                  src={block.content.url}
                  alt={block.content.alt_text || 'Evidence'}
                  className="absolute inset-0 w-full h-full object-cover rounded-lg"
                />
                {idx === 3 && images.length > 4 && (
                  <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                    <span className="text-white text-lg font-semibold">+{images.length - 4}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Links and Documents - compact row */}
        {(links.length > 0 || documents.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {links.slice(0, 2).map((block, idx) => (
              <div
                key={`link-${idx}`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 rounded-lg border border-blue-100 max-w-[200px]"
              >
                <LinkIcon className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span className="text-xs text-blue-700 truncate">
                  {block.content.title || new URL(block.content.url).hostname}
                </span>
              </div>
            ))}
            {links.length > 2 && (
              <span className="text-xs text-gray-400 self-center">+{links.length - 2}</span>
            )}
            {documents.slice(0, 2).map((block, idx) => (
              <div
                key={`doc-${idx}`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 rounded-lg border border-gray-200 max-w-[200px]"
              >
                <DocumentIcon className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                <span className="text-xs text-gray-600 truncate">
                  {block.content.filename || block.file_name || 'Document'}
                </span>
              </div>
            ))}
            {documents.length > 2 && (
              <span className="text-xs text-gray-400 self-center">+{documents.length - 2}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 hover:shadow-md transition-all duration-200">
        {/* Clickable content area */}
        <div onClick={() => setShowDetailModal(true)} className="cursor-pointer">
          {/* Evidence Preview - at top, full width */}
          {hasEvidence && (
            <div className="p-3 pb-0">
              {renderEvidencePreview()}
            </div>
          )}

          {/* Content */}
          <div className="p-4">
            {/* Date and Pillars row */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>{formatDate(displayDate)}</span>
              </div>
              {localEvent.pillars && localEvent.pillars.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {localEvent.pillars.slice(0, 2).map((pillar) => {
                    const pillarData = getPillarData(pillar);
                    if (!pillarData) return null;
                    return (
                      <div
                        key={pillar}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${pillarData.bg} ${pillarData.text}`}
                      >
                        {pillarData.name}
                      </div>
                    );
                  })}
                  {localEvent.pillars.length > 2 && (
                    <span className="text-xs text-gray-400">+{localEvent.pillars.length - 2}</span>
                  )}
                </div>
              )}
            </div>

            {/* Topic chips */}
            {localEvent.topics && localEvent.topics.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {localEvent.topics.map((t) => (
                  <span
                    key={`${t.type}-${t.id}`}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600"
                  >
                    {t.type === 'quest' ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex-shrink-0" />
                    ) : (
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: t.color || '#9333ea' }}
                      />
                    )}
                    <span className="truncate max-w-[100px]">{t.name || (t.type === 'quest' ? 'Quest' : 'Topic')}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            <p className="text-gray-800 text-sm leading-relaxed line-clamp-2">
              {localEvent.description}
            </p>
          </div>
        </div>

        {/* Add to Topic Button */}
        {showTrackAssign && (
          <div className="px-4 pb-4 relative" ref={dropdownRef}>
            <button
              onClick={handleOpenDropdown}
              disabled={isAssigning}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-optio-purple bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <FolderPlusIcon className="w-4 h-4" />
              <span>Add to Topic</span>
            </button>

            {/* Topic Dropdown */}
            {showTopicDropdown && (
              <div className="absolute left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto" style={{ zIndex: 100 }}>
                {isLoadingTopics ? (
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
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Enter topic name..."
                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                            disabled={isAssigning}
                          />
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleCreateTrack(); }}
                            disabled={!newTrackName.trim() || isAssigning}
                            className="px-3 py-2 text-sm font-medium text-white bg-optio-purple rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isAssigning ? '...' : 'Add'}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
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
                        onClick={(e) => { e.stopPropagation(); setIsCreating(true); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left border-b border-gray-100 hover:bg-gray-50 text-optio-purple transition-colors"
                      >
                        <PlusIcon className="w-4 h-4" />
                        <span className="text-sm font-medium">Create new topic</span>
                      </button>
                    )}

                    {/* Courses Section */}
                    {topics.courses.length > 0 && (
                      <>
                        <div className="px-3 py-2 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100">
                          <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Courses</span>
                        </div>
                        {topics.courses.map(course => {
                          const isExpanded = expandedCourses[course.id];
                          return (
                            <div key={course.id}>
                              <button
                                type="button"
                                onClick={(e) => toggleCourseExpanded(e, course.id)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-purple-50 transition-colors"
                              >
                                {isExpanded ? (
                                  <ChevronDownIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                ) : (
                                  <ChevronRightIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                )}
                                <AcademicCapIcon className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                <span className="text-sm font-medium text-gray-900 truncate flex-1">{course.name}</span>
                                <span className="text-xs text-gray-400">{course.projects?.length || 0}</span>
                              </button>
                              {isExpanded && course.projects?.map(project => (
                                <button
                                  key={project.id}
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleAssignToTopic('project', project.id); }}
                                  disabled={isAssigning}
                                  className="w-full flex items-center gap-2 pl-8 pr-3 py-2 text-left hover:bg-purple-50 transition-colors disabled:opacity-50"
                                >
                                  <FlagIcon className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                                  <span className="text-sm text-gray-700 truncate flex-1">{project.name}</span>
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </>
                    )}

                    {/* Standalone Quests Section */}
                    {topics.quests.length > 0 && (
                      <>
                        <div className="px-3 py-2 bg-gradient-to-r from-purple-50 to-pink-50 border-y border-purple-100">
                          <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Standalone Quests</span>
                        </div>
                        {topics.quests.map(quest => (
                          <button
                            key={quest.id}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleAssignToTopic('quest', quest.id); }}
                            disabled={isAssigning}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-purple-50 transition-colors disabled:opacity-50"
                          >
                            <div className="w-3 h-3 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex-shrink-0" />
                            <span className="text-sm font-medium text-gray-900 truncate flex-1">{quest.name}</span>
                            <FlagIcon className="w-3.5 h-3.5 text-purple-500" />
                          </button>
                        ))}
                      </>
                    )}

                    {/* Interest Tracks Section */}
                    {topics.tracks.length > 0 && (
                      <>
                        <div className="px-3 py-2 bg-gray-50 border-y border-gray-100">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Topics of Interest</span>
                        </div>
                        {topics.tracks.map(track => (
                          <button
                            key={track.id}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleAssignToTopic('track', track.id); }}
                            disabled={isAssigning}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors disabled:opacity-50"
                          >
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: track.color || '#9333ea' }}
                            />
                            <span className="text-sm font-medium text-gray-900 truncate flex-1">{track.name}</span>
                            <span className="text-xs text-gray-400">{track.moment_count || 0}</span>
                          </button>
                        ))}
                      </>
                    )}

                    {topics.tracks.length === 0 && topics.quests.length === 0 && topics.courses.length === 0 && !isCreating && (
                      <div className="p-3 text-center text-sm text-gray-500">
                        No topics yet. Create one above!
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <LearningEventDetailModal
        event={localEvent}
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        onUpdate={handleEventUpdate}
        studentId={studentId}
      />
    </>
  );
};

export default LearningEventCard;
