import { useState, useMemo } from 'react';
import { Modal, ModalFooter } from '../ui/Modal';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  TrophyIcon,
  LinkIcon,
  CheckIcon,
  SparklesIcon,
  PlusIcon,
  PencilIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { getPillarData, PILLAR_KEYS } from '../../utils/pillarMappings';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

// Task Preview Card for AI-generated tasks
const TaskPreviewCard = ({ task, onEdit, onAccept, onReject, isAccepted }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTask, setEditedTask] = useState(task);
  const pillarData = getPillarData(task.pillar);

  const handleSave = () => {
    onEdit(task.id, editedTask);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="border border-gray-300 rounded-lg p-4 bg-white space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
          <input
            type="text"
            value={editedTask.title}
            onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <textarea
            value={editedTask.description}
            onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
            rows="2"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Pillar</label>
            <select
              value={editedTask.pillar}
              onChange={(e) => setEditedTask({ ...editedTask, pillar: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            >
              {PILLAR_KEYS.map(key => (
                <option key={key} value={key}>{getPillarData(key).name}</option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium text-gray-600 mb-1">XP</label>
            <input
              type="number"
              min="50"
              max="300"
              step="25"
              value={editedTask.xp_value}
              onChange={(e) => setEditedTask({ ...editedTask, xp_value: parseInt(e.target.value) || 100 })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm font-medium text-white bg-optio-purple rounded-lg hover:opacity-90"
          >
            Save
          </button>
          <button
            onClick={() => {
              setEditedTask(task);
              setIsEditing(false);
            }}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`border rounded-lg p-4 transition-colors ${isAccepted ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-gray-900 text-sm">{task.title}</h4>
            {isAccepted && (
              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                Added
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mb-2 line-clamp-2">{task.description}</p>
          <div className="flex items-center gap-2">
            <span
              className="px-2 py-0.5 text-xs font-semibold rounded"
              style={{ backgroundColor: `${pillarData.color}20`, color: pillarData.color }}
            >
              {pillarData.name}
            </span>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <TrophyIcon className="w-3 h-3" />
              {task.xp_value} XP
            </span>
          </div>
        </div>

        {!isAccepted && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setIsEditing(true)}
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
              title="Edit task"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => onAccept(task.id)}
              className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
              title="Accept task"
            >
              <CheckIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => onReject(task.id)}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
              title="Reject task"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const TaskLinker = ({
  isOpen,
  onClose,
  availableTasks = [],
  linkedTaskIds = [],
  onLinkTasks,
  onUnlinkTask,
  lessonId,
  questId,
  lessonTitle,
  lessonContent,
  onTasksCreated
}) => {
  const [activeTab, setActiveTab] = useState('link'); // 'link' or 'create'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPillar, setSelectedPillar] = useState(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);

  // AI Generation state
  const [numTasks, setNumTasks] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTasks, setGeneratedTasks] = useState([]);
  const [acceptedTaskIds, setAcceptedTaskIds] = useState([]);
  const [isCreating, setIsCreating] = useState(false);

  // Filter tasks based on search and pillar
  const filteredTasks = useMemo(() => {
    return availableTasks.filter(task => {
      const matchesSearch = !searchQuery ||
        task.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesPillar = !selectedPillar || task.pillar === selectedPillar;

      return matchesSearch && matchesPillar;
    });
  }, [availableTasks, searchQuery, selectedPillar]);

  // Separate linked and unlinked tasks
  const currentlyLinkedTasks = availableTasks.filter(task =>
    linkedTaskIds.includes(task.id)
  );
  const unlinkedTasks = filteredTasks.filter(task =>
    !linkedTaskIds.includes(task.id)
  );

  const handleToggleTask = (taskId) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const handleLinkSelected = () => {
    if (selectedTaskIds.length > 0 && onLinkTasks) {
      onLinkTasks(selectedTaskIds);
      setSelectedTaskIds([]);
      setSearchQuery('');
      setSelectedPillar(null);
    }
  };

  const handleUnlink = (taskId) => {
    if (onUnlinkTask) {
      onUnlinkTask(taskId);
    }
  };

  const handleClose = () => {
    setSelectedTaskIds([]);
    setSearchQuery('');
    setSelectedPillar(null);
    setActiveTab('link');
    setGeneratedTasks([]);
    setAcceptedTaskIds([]);
    onClose();
  };

  // AI Task Generation
  const handleGenerateTasks = async () => {
    if (!lessonId || !questId) {
      toast.error('Missing lesson or quest information');
      return;
    }

    setIsGenerating(true);
    setGeneratedTasks([]);
    setAcceptedTaskIds([]);

    try {
      // Extract text content from lesson blocks
      let contentText = '';
      if (lessonContent?.blocks) {
        contentText = lessonContent.blocks
          .filter(b => b.type === 'text')
          .map(b => b.content)
          .join('\n\n');
      }

      if (!contentText.trim()) {
        contentText = lessonTitle || 'General lesson content';
      }

      const response = await api.post(
        `/api/quests/${questId}/curriculum/lessons/${lessonId}/generate-tasks`,
        {
          lesson_content: contentText,
          num_tasks: numTasks,
          lesson_title: lessonTitle
        }
      );

      if (response.data.success) {
        const tasks = response.data.tasks.map((task, index) => ({
          id: `gen_${Date.now()}_${index}`,
          ...task
        }));
        setGeneratedTasks(tasks);
        toast.success(`Generated ${tasks.length} task suggestions`);
      } else {
        throw new Error(response.data.error || 'Failed to generate tasks');
      }
    } catch (error) {
      console.error('Task generation error:', error);
      toast.error(error.response?.data?.error || 'Failed to generate tasks');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditTask = (taskId, updates) => {
    setGeneratedTasks(prev =>
      prev.map(task => task.id === taskId ? { ...task, ...updates } : task)
    );
  };

  const handleAcceptTask = (taskId) => {
    if (!acceptedTaskIds.includes(taskId)) {
      setAcceptedTaskIds(prev => [...prev, taskId]);
    }
  };

  const handleRejectTask = (taskId) => {
    setGeneratedTasks(prev => prev.filter(t => t.id !== taskId));
    setAcceptedTaskIds(prev => prev.filter(id => id !== taskId));
  };

  const handleCreateAcceptedTasks = async () => {
    const tasksToCreate = generatedTasks.filter(t => acceptedTaskIds.includes(t.id));

    if (tasksToCreate.length === 0) {
      toast.error('Please accept at least one task');
      return;
    }

    setIsCreating(true);

    try {
      const response = await api.post(
        `/api/quests/${questId}/curriculum/lessons/${lessonId}/create-tasks`,
        {
          tasks: tasksToCreate.map(({ id, ...task }) => task),
          link_to_lesson: true
        }
      );

      if (response.data.success) {
        toast.success(`Created ${response.data.tasks.length} tasks`);
        setGeneratedTasks([]);
        setAcceptedTaskIds([]);

        if (onTasksCreated) {
          onTasksCreated(response.data.tasks);
        }

        handleClose();
      } else {
        throw new Error(response.data.error || 'Failed to create tasks');
      }
    } catch (error) {
      console.error('Task creation error:', error);
      toast.error(error.response?.data?.error || 'Failed to create tasks');
    } finally {
      setIsCreating(false);
    }
  };

  const acceptedCount = acceptedTaskIds.length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Tasks to Lesson"
      size="lg"
      footer={
        <ModalFooter className="flex-col-reverse sm:flex-row justify-between w-full gap-2 sm:gap-3">
          <button
            onClick={handleClose}
            className="w-full sm:w-auto px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>

          {activeTab === 'link' ? (
            <button
              onClick={handleLinkSelected}
              disabled={selectedTaskIds.length === 0}
              className={`
                w-full sm:w-auto px-4 sm:px-6 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2
                ${selectedTaskIds.length > 0
                  ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              <LinkIcon className="w-4 h-4" />
              <span className="hidden xs:inline">Link Selected</span>
              <span className="xs:hidden">Link</span>
              <span>({selectedTaskIds.length})</span>
            </button>
          ) : (
            <button
              onClick={handleCreateAcceptedTasks}
              disabled={acceptedCount === 0 || isCreating}
              className={`
                w-full sm:w-auto px-4 sm:px-6 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2
                ${acceptedCount > 0 && !isCreating
                  ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <PlusIcon className="w-4 h-4" />
                  <span className="hidden xs:inline">Create Tasks</span>
                  <span className="xs:hidden">Create</span>
                  <span>({acceptedCount})</span>
                </>
              )}
            </button>
          )}
        </ModalFooter>
      }
    >
      <div className="space-y-3 sm:space-y-4">
        {/* Tab Switcher - Responsive */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('link')}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'link'
                ? 'border-optio-purple text-optio-purple'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <LinkIcon className="w-4 h-4 inline-block mr-1.5 sm:mr-2" />
            <span className="hidden xs:inline">Link Existing</span>
            <span className="xs:hidden">Link</span>
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'create'
                ? 'border-optio-purple text-optio-purple'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <SparklesIcon className="w-4 h-4 inline-block mr-1.5 sm:mr-2" />
            <span className="hidden xs:inline">Create New</span>
            <span className="xs:hidden">Create</span>
          </button>
        </div>

        {/* Link Existing Tab */}
        {activeTab === 'link' && (
          <>
            {/* Currently Linked Tasks */}
            {currentlyLinkedTasks.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <LinkIcon className="w-4 h-4" />
                  Currently Linked Tasks ({currentlyLinkedTasks.length})
                </h3>
                <div className="space-y-2">
                  {currentlyLinkedTasks.map(task => {
                    const pillarData = getPillarData(task.pillar);
                    return (
                      <div
                        key={task.id}
                        className="bg-white rounded-lg p-3 flex items-center justify-between border border-blue-200"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: pillarData.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 text-sm truncate">
                              {task.title}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className="text-xs font-semibold uppercase"
                                style={{ color: pillarData.color }}
                              >
                                {pillarData.name}
                              </span>
                              <span className="text-xs text-gray-500">
                                {task.xp_value} XP
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleUnlink(task.id)}
                          className="ml-3 p-1 hover:bg-red-100 rounded text-red-600 transition-colors flex-shrink-0"
                          title="Unlink task"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Search and Filter */}
            <div className="space-y-3">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tasks..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedPillar(null)}
                  className={`
                    px-3 py-1 rounded-full text-xs font-semibold transition-all
                    ${!selectedPillar
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }
                  `}
                >
                  All Pillars
                </button>
                {PILLAR_KEYS.map(pillarKey => {
                  const pillarData = getPillarData(pillarKey);
                  const isSelected = selectedPillar === pillarKey;
                  return (
                    <button
                      key={pillarKey}
                      onClick={() => setSelectedPillar(isSelected ? null : pillarKey)}
                      className={`
                        px-3 py-1 rounded-full text-xs font-semibold transition-all
                        ${isSelected ? 'text-white' : 'text-gray-700 hover:opacity-80'}
                      `}
                      style={{
                        backgroundColor: isSelected ? pillarData.color : `${pillarData.color}30`
                      }}
                    >
                      {pillarData.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Available Tasks List */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">
                  Available Tasks ({unlinkedTasks.length})
                </h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {unlinkedTasks.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <TrophyIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">
                      {searchQuery || selectedPillar
                        ? 'No tasks match your filters'
                        : 'No available tasks to link'
                      }
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {unlinkedTasks.map(task => {
                      const pillarData = getPillarData(task.pillar);
                      const isSelected = selectedTaskIds.includes(task.id);

                      return (
                        <label
                          key={task.id}
                          className={`
                            flex items-center gap-3 p-4 cursor-pointer transition-colors
                            ${isSelected ? 'bg-purple-50' : 'hover:bg-gray-50'}
                          `}
                        >
                          <div className="flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleTask(task.id)}
                              className="w-5 h-5 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">
                              {task.title}
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <span
                                className="text-xs font-semibold uppercase"
                                style={{ color: pillarData.color }}
                              >
                                {pillarData.name}
                              </span>
                              <div className="flex items-center gap-1 text-xs text-gray-600">
                                <TrophyIcon className="w-3 h-3" />
                                {task.xp_value} XP
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <div className="flex-shrink-0">
                              <div className="w-6 h-6 rounded-full bg-optio-purple text-white flex items-center justify-center">
                                <CheckIcon className="w-4 h-4" />
                              </div>
                            </div>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Create New Tab */}
        {activeTab === 'create' && (
          <div className="space-y-4">
            {generatedTasks.length === 0 ? (
              <>
                {/* Generation Controls */}
                <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 border border-optio-purple/20 rounded-lg p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <SparklesIcon className="w-6 h-6 text-optio-purple flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-gray-900">AI Task Generator</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Generate tasks based on this lesson's content. The AI will create actionable tasks
                        that align with the curriculum and help students demonstrate understanding.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Number of tasks to generate
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="1"
                          max="5"
                          value={numTasks}
                          onChange={(e) => setNumTasks(parseInt(e.target.value))}
                          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-optio-purple"
                        />
                        <span className="w-8 text-center font-semibold text-optio-purple">{numTasks}</span>
                      </div>
                    </div>

                    <button
                      onClick={handleGenerateTasks}
                      disabled={isGenerating}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Generating Tasks...
                        </>
                      ) : (
                        <>
                          <SparklesIcon className="w-5 h-5" />
                          Generate {numTasks} Tasks from Lesson
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>How it works:</strong> The AI analyzes your lesson content, including the
                    quest context, to create relevant tasks. You can review, edit, accept, or reject
                    each suggestion before creating them.
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Generated Tasks Review */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium text-green-600">{acceptedCount}</span> of {generatedTasks.length} tasks accepted
                  </p>
                  <button
                    onClick={() => {
                      setGeneratedTasks([]);
                      setAcceptedTaskIds([]);
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  >
                    <ArrowPathIcon className="w-4 h-4" />
                    Start Over
                  </button>
                </div>

                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {generatedTasks.map(task => (
                    <TaskPreviewCard
                      key={task.id}
                      task={task}
                      isAccepted={acceptedTaskIds.includes(task.id)}
                      onEdit={handleEditTask}
                      onAccept={handleAcceptTask}
                      onReject={handleRejectTask}
                    />
                  ))}
                </div>

                {acceptedCount > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-800">
                      <strong>{acceptedCount} task{acceptedCount !== 1 ? 's' : ''} ready to create.</strong>{' '}
                      Click "Create Tasks" to add them to this lesson.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TaskLinker;
