import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, PlusIcon, CheckCircleIcon, BookOpenIcon, EyeIcon, XMarkIcon, FunnelIcon } from '@heroicons/react/24/outline';
import api from '../services/api';
import { getPillarData } from '../utils/pillarMappings';
import toast from 'react-hot-toast';
import logger from '../utils/logger';
import SubjectBadges, { getSubjectConfig } from '../components/common/SubjectBadges';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import { useConfirm } from '../contexts/ConfirmContext'

// Diploma subjects for filtering
const DIPLOMA_SUBJECTS = [
  { id: 'language_arts', label: 'Language Arts' },
  { id: 'math', label: 'Math' },
  { id: 'science', label: 'Science' },
  { id: 'social_studies', label: 'Social Studies' },
  { id: 'financial_literacy', label: 'Financial Literacy' },
  { id: 'health', label: 'Health' },
  { id: 'pe', label: 'PE' },
  { id: 'fine_arts', label: 'Fine Arts' },
  { id: 'cte', label: 'CTE' },
  { id: 'digital_literacy', label: 'Digital Literacy' },
  { id: 'electives', label: 'Electives' }
];

export default function TaskLibraryBrowser() {
  const confirm = useConfirm()
  const { questId } = useParams();
  const navigate = useNavigate();
  const [quest, setQuest] = useState(null);
  const [libraryTasks, setLibraryTasks] = useState([]);
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [addedTasks, setAddedTasks] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [detailsModalTask, setDetailsModalTask] = useState(null);
  const [subjectFilter, setSubjectFilter] = useState(null); // null = show all, or subject id
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  useEffect(() => {
    fetchQuestAndLibrary();
  }, [questId]);

  const fetchQuestAndLibrary = async () => {
    setLoading(true);
    try {
      // Fetch quest details
      const questResponse = await api.get(`/api/quests/${questId}`);
      setQuest(questResponse.data);

      // Fetch library tasks
      const libraryResponse = await api.get(`/api/quests/${questId}/task-library`);
      setLibraryTasks(libraryResponse.data.tasks || []);
    } catch (error) {
      logger.error('Error fetching library:', error);
      toast.error('Failed to load task library');
    } finally {
      setLoading(false);
    }
  };

  const toggleTaskSelection = async (taskId) => {
    // Check if already added - allow deselecting
    if (addedTasks.has(taskId)) {
      // Confirm before removing
      if (!(await confirm('Remove this task from your quest?'))) {
        return;
      }

      try {
        // Find the sample task to get its title
        const libraryTask = libraryTasks.find(t => t.id === taskId);
        if (!libraryTask) {
          toast.error('Task not found in library');
          logger.error('Library task not found:', taskId);
          return;
        }

        logger.debug('Attempting to remove task:', {
          sampleTaskId: taskId,
          title: libraryTask.title
        });

        // Get fresh quest data to find the user task
        const questResponse = await api.get(`/api/quests/${questId}`);
        logger.debug('Quest tasks:', questResponse.data.quest_tasks?.map(t => ({
          id: t.id,
          title: t.title
        })));

        const userTask = questResponse.data.quest_tasks?.find(
          t => t.title === libraryTask.title
        );

        if (!userTask) {
          logger.error('User task not found. Looking for title:', libraryTask.title);
          logger.error('Available tasks:', questResponse.data.quest_tasks?.map(t => t.title));
          toast.error('Task not found in your quest. It may have already been removed.');

          // Remove from local state anyway since it's not in the quest
          setAddedTasks(prev => {
            const newSet = new Set(prev);
            newSet.delete(taskId);
            return newSet;
          });
          return;
        }

        logger.debug('Deleting user task:', userTask.id);

        // Delete the task
        await api.delete(`/api/tasks/${userTask.id}`);

        // Remove from added tasks
        setAddedTasks(prev => {
          const newSet = new Set(prev);
          newSet.delete(taskId);
          return newSet;
        });

        // Remove from selected tasks
        setSelectedTasks(prev => {
          const newSet = new Set(prev);
          newSet.delete(taskId);
          return newSet;
        });

        toast.success('Task removed from your quest');
      } catch (error) {
        logger.error('Error removing task:', error);
        toast.error(error.response?.data?.error || 'Failed to remove task');
      }

      return;
    }

    // Check if already selected
    const wasSelected = selectedTasks.has(taskId);

    if (wasSelected) {
      // Deselect (only works for not-yet-added tasks)
      setSelectedTasks(prev => {
        const newSet = new Set(prev);
        newSet.delete(taskId);
        return newSet;
      });
    } else {
      // Select and immediately add the task
      setSelectedTasks(prev => new Set([...prev, taskId]));

      // Add task immediately
      try {
        await api.post(`/api/quests/${questId}/task-library/select`, {
          sample_task_id: taskId
        });

        setAddedTasks(prev => new Set([...prev, taskId]));
        toast.success('Task added to your quest!');
      } catch (error) {
        logger.error('Error adding task:', error);
        toast.error(error.response?.data?.error || 'Failed to add task');

        // Remove from selection on error
        setSelectedTasks(prev => {
          const newSet = new Set(prev);
          newSet.delete(taskId);
          return newSet;
        });
      }
    }
  };

  const handleDone = () => {
    // Navigate back with state to trigger refresh
    navigate(`/quests/${questId}`, {
      state: { tasksAdded: true, addedCount: addedTasks.size }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-optio-purple/5 to-optio-pink/5 flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading task library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-optio-purple/5 to-optio-pink/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(`/quests/${questId}`)}
            className="flex items-center gap-2 text-gray-600 hover:text-optio-purple mb-4 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Back to Quest
          </button>

          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Task Library
          </h1>
          <p className="text-lg text-gray-600 mb-4">
            Browse and add tasks to your quest: <span className="font-semibold">{quest?.title}</span>
          </p>

          {/* Progress Indicator */}
          <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <CheckCircleIcon className="w-5 h-5 text-green-500" />
            <span className="text-gray-700">
              <span className="font-semibold">{addedTasks.size}</span> task{addedTasks.size !== 1 ? 's' : ''} added to quest
            </span>
          </div>

          {/* Subject Filter */}
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <FunnelIcon className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-600">
                Filter by Diploma Subject:
              </span>
              {subjectFilter && (
                <button
                  onClick={() => setSubjectFilter(null)}
                  className="text-sm text-optio-purple hover:underline"
                 
                >
                  Clear filter
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {DIPLOMA_SUBJECTS.map((subject) => {
                const config = getSubjectConfig(subject.id);
                const isActive = subjectFilter === subject.id;
                return (
                  <button
                    key={subject.id}
                    onClick={() => setSubjectFilter(isActive ? null : subject.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      isActive
                        ? 'ring-2 ring-offset-1 ring-optio-purple shadow-sm'
                        : 'hover:shadow-sm'
                    }`}
                    style={{
                      backgroundColor: isActive ? `${config.color}30` : `${config.color}15`,
                      color: config.color
                    }}
                  >
                    {subject.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Library Grid */}
        {(() => {
          // Filter tasks by selected subject
          const filteredTasks = subjectFilter
            ? libraryTasks.filter((task) => {
                // Check diploma_subjects object (new format)
                if (task.diploma_subjects && typeof task.diploma_subjects === 'object') {
                  const subjectConfig = getSubjectConfig(subjectFilter);
                  // Check if any key matches the filter (case-insensitive)
                  return Object.keys(task.diploma_subjects).some(k => {
                    const keyLower = k.toLowerCase().replace(/\s+/g, '_');
                    const filterLower = subjectFilter.toLowerCase();
                    const labelLower = subjectConfig.label.toLowerCase();
                    return keyLower === filterLower ||
                           k.toLowerCase() === labelLower ||
                           keyLower === labelLower.replace(/\s+/g, '_');
                  });
                }
                // Check school_subjects array (legacy format)
                if (task.school_subjects && Array.isArray(task.school_subjects)) {
                  return task.school_subjects.includes(subjectFilter);
                }
                return false;
              })
            : libraryTasks;

          // Empty library
          if (libraryTasks.length === 0) {
            return (
              <EmptyState
                icon={BookOpenIcon}
                title="No library tasks available yet"
                hint="The library is built from AI-generated tasks. Generate custom tasks to contribute to the library!"
                action={(
                  <button onClick={handleDone} className="btn-primary">
                    Done
                  </button>
                )}
              />
            );
          }

          // No tasks match filter
          if (filteredTasks.length === 0 && subjectFilter) {
            return (
              <EmptyState
                icon={FunnelIcon}
                title="No tasks match this filter"
                hint="Try selecting a different subject or clear the filter to see all tasks."
                action={(
                  <button onClick={() => setSubjectFilter(null)} className="btn-primary">
                    Clear Filter
                  </button>
                )}
              />
            );
          }

          // Show filtered tasks
          return (
            <>
              {subjectFilter && (
                <p className="text-sm text-gray-500 mb-4">
                  Showing {filteredTasks.length} of {libraryTasks.length} tasks
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
                {filteredTasks.map((task) => {
                const pillarData = getPillarData(task.pillar);
                const isAdded = addedTasks.has(task.id);
                const isSelected = selectedTasks.has(task.id);

                return (
                  <div
                    key={task.id}
                    onClick={() => toggleTaskSelection(task.id)}
                    className={`relative rounded-xl overflow-hidden transition-all hover:shadow-lg cursor-pointer border-2 ${
                      isSelected ? 'ring-2 ring-optio-purple border-optio-purple' : isAdded ? 'border-green-500' : 'border-gray-200'
                    }`}
                    style={{
                      background: isAdded
                        ? '#f0fdf4'
                        : isSelected
                          ? `linear-gradient(135deg, ${pillarData.color}20 0%, ${pillarData.color}10 100%)`
                          : `linear-gradient(135deg, ${pillarData.color}15 0%, ${pillarData.color}05 100%)`
                    }}
                  >
                    {/* Card Content */}
                    <div className="p-4">
                      {/* Checkbox and Added Badge */}
                      <div className="flex items-center justify-between mb-3">
                        {isAdded ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTaskSelection(task.id);
                            }}
                            className="flex items-center gap-1 text-green-600 hover:text-red-600 font-semibold text-sm transition-colors"
                           
                            title="Click to remove this task"
                          >
                            <CheckCircleIcon className="w-4 h-4" />
                            Added (click to remove)
                          </button>
                        ) : (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleTaskSelection(task.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5 text-optio-purple rounded focus:ring-optio-purple cursor-pointer"
                          />
                        )}
                      </div>

                      {/* Task Title */}
                      <h3 className="text-lg font-bold text-gray-900 mb-2 leading-tight">
                        {task.title}
                      </h3>

                      {/* Task Description */}
                      {task.description && (
                        <p className="text-sm text-gray-700 mb-3 line-clamp-3">
                          {task.description}
                        </p>
                      )}

                      {/* Pillar Badge + XP Badge Row */}
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="inline-flex items-center justify-center px-3 py-1 rounded-full text-sm font-semibold text-white"
                          style={{ backgroundColor: pillarData.color }}
                        >
                          {pillarData.name}
                        </div>
                        <div
                          className="px-3 py-1 rounded-full text-sm font-bold"
                          style={{
                            backgroundColor: `${pillarData.color}20`,
                            color: pillarData.color
                          }}
                        >
                          {task.xp_value} XP
                        </div>
                      </div>

                      {/* Subject XP Distribution */}
                      {task.diploma_subjects && Object.keys(task.diploma_subjects).length > 0 && (
                        <div className="mb-2">
                          <SubjectBadges
                            subjectXpDistribution={task.diploma_subjects}
                            compact={true}
                            maxDisplay={2}
                          />
                        </div>
                      )}

                      {/* Usage Count and View Details Button */}
                      <div className="flex items-center justify-between mt-3">
                        {task.usage_count > 0 ? (
                          <p className="text-xs text-gray-500">
                            {task.usage_count} {task.usage_count === 1 ? 'student has' : 'students have'} used this
                          </p>
                        ) : (
                          <div></div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailsModalTask(task);
                          }}
                          className="flex items-center gap-1 text-sm text-gray-600 hover:text-optio-purple transition-colors"
                         
                        >
                          <EyeIcon className="w-4 h-4" />
                          Details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

              {/* Done Button */}
              <div className="text-center">
                <button
                  onClick={handleDone}
                  className="btn-primary"
                >
                  Return to Quest
                </button>
              </div>
            </>
          );
        })()}
      </div>

      {/* Task Details Modal */}
      {detailsModalTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">
                Task Details
              </h2>
              <button
                onClick={() => setDetailsModalTask(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {(() => {
                const pillarData = getPillarData(detailsModalTask.pillar);
                return (
                  <>
                    {/* Task Title */}
                    <h3 className="text-2xl font-bold text-gray-900 mb-4">
                      {detailsModalTask.title}
                    </h3>

                    {/* Pillar and XP Badges */}
                    <div className="flex items-center gap-2 mb-4">
                      <div
                        className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-semibold text-white"
                        style={{ backgroundColor: pillarData.color }}
                      >
                        {pillarData.name}
                      </div>
                      <div
                        className="px-4 py-2 rounded-full text-sm font-bold"
                        style={{
                          backgroundColor: `${pillarData.color}20`,
                          color: pillarData.color
                        }}
                      >
                        {detailsModalTask.xp_value} XP
                      </div>
                    </div>

                    {/* Subject XP Distribution */}
                    {detailsModalTask.diploma_subjects && Object.keys(detailsModalTask.diploma_subjects).length > 0 && (
                      <div className="mb-6 p-4 bg-optio-purple/5 rounded-lg">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                          Diploma Credits Earned:
                        </h4>
                        <SubjectBadges
                          subjectXpDistribution={detailsModalTask.diploma_subjects}
                          compact={false}
                          maxDisplay={10}
                        />
                      </div>
                    )}

                    {/* Task Description */}
                    <div className="mb-6">
                      <h4 className="text-lg font-semibold text-gray-900 mb-2">
                        Description
                      </h4>
                      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {detailsModalTask.description}
                      </p>
                    </div>

                    {/* Usage Stats */}
                    {detailsModalTask.usage_count > 0 && (
                      <div className="bg-gray-50 rounded-lg p-4 mb-6">
                        <p className="text-sm text-gray-600">
                          <span className="font-semibold">{detailsModalTask.usage_count}</span>{' '}
                          {detailsModalTask.usage_count === 1 ? 'student has' : 'students have'} completed this task
                        </p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      {!addedTasks.has(detailsModalTask.id) && (
                        <button
                          onClick={async () => {
                            try {
                              await api.post(`/api/quests/${questId}/task-library/select`, {
                                sample_task_id: detailsModalTask.id
                              });
                              setAddedTasks(prev => new Set([...prev, detailsModalTask.id]));
                              toast.success('Task added to your quest!');
                              setDetailsModalTask(null);
                            } catch (error) {
                              logger.error('Error adding task:', error);
                              toast.error(error.response?.data?.error || 'Failed to add task');
                            }
                          }}
                          className="flex-1 py-3 rounded-lg font-semibold text-white hover:opacity-90 transition-opacity"
                          style={{
                            backgroundColor: pillarData.color
                          }}
                        >
                          Add to My Quest
                        </button>
                      )}
                      <button
                        onClick={() => setDetailsModalTask(null)}
                        className="btn-quiet flex-1 py-3"
                       
                      >
                        Close
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
