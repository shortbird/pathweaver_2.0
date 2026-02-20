import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, PlusIcon, TrashIcon, ExclamationCircleIcon, ChevronDownIcon, ChevronUpIcon, Bars3Icon, SparklesIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import { getPillarData } from '../../utils/pillarMappings';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Task Row Component
const SortableTaskRow = ({
  task,
  index,
  isExpanded,
  onToggleExpand,
  onUpdateTask,
  onRemoveTask,
  pillars,
  errors
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id || `task-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const pillarData = getPillarData(task.pillar);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-gray-50 rounded-lg border-2 transition-all ${
        task.is_required ? 'border-l-4 border-l-amber-500 border-gray-200' : 'border-gray-200'
      } ${isDragging ? 'shadow-lg' : ''}`}
    >
      {/* Collapsed View - Always visible */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={() => onToggleExpand(index)}
      >
        {/* Drag Handle */}
        <button
          type="button"
          className="flex-shrink-0 p-1 hover:bg-gray-200 rounded cursor-grab active:cursor-grabbing touch-manipulation"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <Bars3Icon className="w-5 h-5 text-gray-400" />
        </button>

        {/* Order Number with Pillar Color */}
        <div
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm"
          style={{ backgroundColor: pillarData.color }}
        >
          {index + 1}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <span className={`block truncate ${task.title ? 'text-gray-900' : 'text-gray-400 italic'}`}>
            {task.title || 'Untitled task'}
          </span>
        </div>

        {/* Required Badge */}
        {task.is_required && (
          <span className="flex-shrink-0 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">
            Required
          </span>
        )}

        {/* Optional Badge */}
        {!task.is_required && (
          <span className="flex-shrink-0 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
            Optional
          </span>
        )}

        {/* Pillar Badge */}
        <span
          className="flex-shrink-0 px-2 py-0.5 text-white text-xs font-medium rounded hidden sm:inline-block"
          style={{ backgroundColor: pillarData.color }}
        >
          {pillarData.icon} {pillarData.name}
        </span>

        {/* XP Value */}
        <span className="flex-shrink-0 text-sm text-gray-600 font-medium w-16 text-right">
          {task.xp_value} XP
        </span>

        {/* Expand/Collapse Icon */}
        <button
          type="button"
          className="flex-shrink-0 p-1 hover:bg-gray-200 rounded"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(index);
          }}
        >
          {isExpanded ? (
            <ChevronUpIcon className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
          )}
        </button>

        {/* Delete Button (always visible) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveTask(index);
          }}
          className="flex-shrink-0 p-1 hover:bg-red-100 rounded text-red-600"
          title="Delete task"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Expanded View - Form Fields */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-200 space-y-3">
          {/* Title Input */}
          <div>
            <label htmlFor={`task-${index}-title`} className="block text-sm font-medium text-gray-700 mb-1">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id={`task-${index}-title`}
              value={task.title}
              onChange={(e) => onUpdateTask(index, 'title', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg ${
                errors[`task_${index}_title`] ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Enter task title"
            />
            {errors[`task_${index}_title`] && (
              <p className="text-red-600 text-xs mt-1 flex items-center gap-1">
                <ExclamationCircleIcon className="w-3 h-3" />
                {errors[`task_${index}_title`]}
              </p>
            )}
          </div>

          {/* Description Textarea */}
          <div>
            <label htmlFor={`task-${index}-description`} className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id={`task-${index}-description`}
              value={task.description}
              onChange={(e) => onUpdateTask(index, 'description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              rows={2}
              placeholder="Optional task description"
            />
          </div>

          {/* Row: Pillar, XP, Required Toggle */}
          <div className="flex flex-wrap gap-4 items-end">
            {/* Pillar Dropdown */}
            <div className="flex-1 min-w-[140px]">
              <label htmlFor={`task-${index}-pillar`} className="block text-sm font-medium text-gray-700 mb-1">
                Pillar
              </label>
              <select
                id={`task-${index}-pillar`}
                value={task.pillar}
                onChange={(e) => onUpdateTask(index, 'pillar', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {pillars.map((p) => {
                  const pd = getPillarData(p);
                  return (
                    <option key={p} value={p}>
                      {pd.icon} {pd.name}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* XP Value */}
            <div className="w-24">
              <label htmlFor={`task-${index}-xp`} className="block text-sm font-medium text-gray-700 mb-1">
                XP
              </label>
              <input
                type="number"
                id={`task-${index}-xp`}
                value={task.xp_value}
                onChange={(e) => onUpdateTask(index, 'xp_value', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                min="10"
                max="500"
              />
            </div>

            {/* Required Toggle */}
            <div className="flex items-center gap-2 pb-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={task.is_required || false}
                  onChange={(e) => onUpdateTask(index, 'is_required', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                <span className="ms-2 text-sm font-medium text-gray-700">Required</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * QuestForm - Unified quest creation/editing form
 *
 * This is the new unified form that replaces separate UnifiedQuestForm (optio)
 * and CourseQuestForm. Any quest can now have both required and optional tasks.
 */
const QuestForm = ({
  mode = 'create',
  quest = null,
  onClose,
  onSuccess,
  organizationId = null,
  canDelete = false,
  onDelete = null,
  createEndpoint = '/api/admin/quests/create',
  templateTasksEndpoint = null
}) => {
  const [loading, setLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [loadingTasks, setLoadingTasks] = useState(mode === 'edit');
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [quickAddValue, setQuickAddValue] = useState('');
  const [showTaskEditor, setShowTaskEditor] = useState(false);
  const quickAddRef = useRef(null);

  const [formData, setFormData] = useState({
    title: quest?.title || '',
    description: quest?.big_idea || quest?.description || '',
    material_link: quest?.material_link || '',
    is_active: quest?.is_active !== undefined ? quest.is_active : false,
    allow_custom_tasks: quest?.allow_custom_tasks !== undefined ? quest.allow_custom_tasks : true,
    tasks: []
  });

  const pillars = ['stem', 'wellness', 'communication', 'civics', 'art'];

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load existing tasks when in edit mode
  useEffect(() => {
    const loadTasks = async () => {
      if (mode === 'edit' && quest?.id) {
        try {
          // Try unified template-tasks endpoint first
          const response = await api.get(`/api/admin/quests/${quest.id}/template-tasks`);

          if (response.data.tasks && response.data.tasks.length > 0) {
            setFormData(prev => ({
              ...prev,
              tasks: response.data.tasks.map((task, index) => ({
                id: task.id || `task-${index}`,
                title: task.title || '',
                description: task.description || '',
                pillar: task.pillar || 'stem',
                xp_value: task.xp_value || 100,
                is_required: task.is_required || false,
                order_index: index
              }))
            }));
            setShowTaskEditor(true);
          }
        } catch (error) {
          console.error('Error loading template tasks:', error);
          // Fallback to legacy course-tasks endpoint
          try {
            const legacyResponse = await api.get(`/api/admin/quests/${quest.id}/course-tasks`);
            if (legacyResponse.data.tasks && legacyResponse.data.tasks.length > 0) {
              setFormData(prev => ({
                ...prev,
                tasks: legacyResponse.data.tasks.map((task, index) => ({
                  id: task.id || `task-${index}`,
                  title: task.title || '',
                  description: task.description || '',
                  pillar: task.pillar || 'stem',
                  xp_value: task.xp_value || 100,
                  is_required: task.is_required !== undefined ? task.is_required : true,
                  order_index: index
                }))
              }));
              setShowTaskEditor(true);
            }
          } catch (legacyError) {
            console.error('Error loading legacy tasks:', legacyError);
          }
        } finally {
          setLoadingTasks(false);
        }
      } else {
        setLoadingTasks(false);
      }
    };

    loadTasks();
  }, [mode, quest]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    // Validate each task if tasks are present
    if (formData.tasks.length > 0) {
      formData.tasks.forEach((task, index) => {
        if (!task.title.trim()) {
          newErrors[`task_${index}_title`] = 'Task title is required';
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix all errors before submitting');
      // Expand tasks with errors
      const tasksWithErrors = formData.tasks
        .map((_, index) => errors[`task_${index}_title`] ? index : null)
        .filter(index => index !== null);
      if (tasksWithErrors.length > 0) {
        setExpandedTasks(new Set(tasksWithErrors));
      }
      return;
    }

    setLoading(true);

    try {
      // Prepare quest data
      const questData = {
        title: formData.title.trim(),
        big_idea: formData.description.trim(),
        description: formData.description.trim(),
        material_link: formData.material_link.trim() || null,
        is_active: formData.is_active,
        allow_custom_tasks: formData.allow_custom_tasks,
        ...(organizationId && { organization_id: organizationId })
      };

      let questId = quest?.id;

      if (mode === 'edit') {
        // Update existing quest
        await api.put(`/api/admin/quests/${questId}`, questData);
      } else {
        // Create new quest
        const createResponse = await api.post(createEndpoint, questData);
        questId = createResponse.data.quest_id;
      }

      // Save template tasks if any
      if (formData.tasks.length > 0 && questId) {
        const tasksPayload = {
          tasks: formData.tasks.map((task, index) => ({
            title: task.title.trim(),
            description: task.description.trim(),
            pillar: task.pillar,
            xp_value: parseInt(task.xp_value) || 100,
            order_index: index,
            is_required: task.is_required || false,
            diploma_subjects: ['Electives'],
            subject_xp_distribution: {}
          }))
        };

        const templateUrl = templateTasksEndpoint
          ? templateTasksEndpoint(questId)
          : `/api/admin/quests/${questId}/template-tasks`;
        await api.put(templateUrl, tasksPayload);
      }

      const taskSummary = formData.tasks.length > 0
        ? ` with ${formData.tasks.filter(t => t.is_required).length} required and ${formData.tasks.filter(t => !t.is_required).length} optional tasks`
        : '';

      toast.success(`Quest ${mode === 'edit' ? 'updated' : 'created'} successfully${taskSummary}!`);
      onSuccess && onSuccess({ id: questId, ...questData });
      onClose();
    } catch (error) {
      console.error('Error saving quest:', error);
      const errorMessage = error.response?.data?.error || 'Failed to save quest';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleAICleanup = async () => {
    if (!formData.title.trim()) {
      toast.error('Please enter a title before using AI cleanup');
      return;
    }

    if (mode === 'create') {
      toast.error('Please save the quest first before using AI cleanup');
      return;
    }

    setCleanupLoading(true);

    try {
      const response = await api.post(`/api/admin/quests/${quest.id}/ai-cleanup`, {});

      if (response.data.success) {
        setFormData({
          ...formData,
          title: response.data.cleaned_title,
          description: response.data.cleaned_big_idea
        });

        const changes = response.data.changes_made;
        if (changes && changes.length > 0) {
          toast.success(`AI cleanup complete! ${changes.length} improvements made.`);
        } else {
          toast.success('Quest looks great! No changes needed.');
        }
      } else {
        toast.error(response.data.error || 'Failed to cleanup quest');
      }
    } catch (error) {
      console.error('Error cleaning up quest:', error);
      toast.error(error.response?.data?.error || 'Failed to cleanup quest format');
    } finally {
      setCleanupLoading(false);
    }
  };

  const addTask = (title = '', isRequired = false) => {
    const newTaskId = `task-${Date.now()}`;
    const newIndex = formData.tasks.length;

    setFormData({
      ...formData,
      tasks: [
        ...formData.tasks,
        {
          id: newTaskId,
          title: title,
          description: '',
          pillar: 'stem',
          xp_value: 100,
          is_required: isRequired,
          order_index: newIndex
        }
      ]
    });

    if (!title) {
      setExpandedTasks(prev => new Set([...prev, newIndex]));
    }
  };

  const removeTask = (index) => {
    const newTasks = formData.tasks.filter((_, i) => i !== index);
    setFormData({ ...formData, tasks: newTasks });

    setExpandedTasks(prev => {
      const newSet = new Set();
      prev.forEach(i => {
        if (i < index) newSet.add(i);
        else if (i > index) newSet.add(i - 1);
      });
      return newSet;
    });
  };

  const updateTask = (index, field, value) => {
    const newTasks = [...formData.tasks];
    newTasks[index][field] = value;
    setFormData({ ...formData, tasks: newTasks });

    const errorKey = `task_${index}_${field}`;
    if (errors[errorKey]) {
      setErrors({ ...errors, [errorKey]: '' });
    }
  };

  const toggleExpand = (index) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    setExpandedTasks(new Set(formData.tasks.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedTasks(new Set());
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = formData.tasks.findIndex(t => (t.id || `task-${formData.tasks.indexOf(t)}`) === active.id);
      const newIndex = formData.tasks.findIndex(t => (t.id || `task-${formData.tasks.indexOf(t)}`) === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newTasks = arrayMove(formData.tasks, oldIndex, newIndex);
        newTasks.forEach((task, i) => {
          task.order_index = i;
        });
        setFormData({ ...formData, tasks: newTasks });

        setExpandedTasks(prev => {
          const newSet = new Set();
          prev.forEach(i => {
            if (i === oldIndex) {
              newSet.add(newIndex);
            } else if (oldIndex < newIndex && i > oldIndex && i <= newIndex) {
              newSet.add(i - 1);
            } else if (oldIndex > newIndex && i >= newIndex && i < oldIndex) {
              newSet.add(i + 1);
            } else {
              newSet.add(i);
            }
          });
          return newSet;
        });
      }
    }
  };

  const handleQuickAdd = (e) => {
    if (e.key === 'Enter' && quickAddValue.trim()) {
      e.preventDefault();
      addTask(quickAddValue.trim());
      setQuickAddValue('');
      quickAddRef.current?.focus();
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center z-10">
          <h2 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            {mode === 'edit' ? 'Edit Quest' : 'Create Quest'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Loading State for Edit Mode */}
          {loadingTasks ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
              <span className="ml-3 text-gray-600">Loading quest data...</span>
            </div>
          ) : (
            <>
              {/* Quest Details */}
              <div className="space-y-6 mb-8">
                <div>
                  <label htmlFor="quest-title" className="block text-sm font-semibold mb-2 text-gray-800">
                    Quest Title
                    <span className="text-red-500 font-bold ml-1">*</span>
                  </label>
                  <input
                    type="text"
                    id="quest-title"
                    value={formData.title}
                    onChange={(e) => {
                      setFormData({ ...formData, title: e.target.value });
                      if (errors.title) setErrors({ ...errors, title: '' });
                    }}
                    className={`w-full px-4 py-3 border-2 rounded-lg ${
                      errors.title ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="e.g., Build a Community Garden"
                  />
                  {errors.title && (
                    <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                      <ExclamationCircleIcon className="w-4 h-4" />
                      {errors.title}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="quest-description" className="block text-sm font-medium mb-2 text-gray-600">
                    Description / Big Idea
                  </label>
                  <textarea
                    id="quest-description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    rows={3}
                    placeholder="Describe the quest's main concept and learning goals..."
                  />
                </div>

                <div>
                  <label htmlFor="quest-material-link" className="block text-sm font-medium mb-2 text-gray-600">
                    Resource Link (optional)
                  </label>
                  <input
                    type="url"
                    id="quest-material-link"
                    value={formData.material_link}
                    onChange={(e) => setFormData({ ...formData, material_link: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., https://www.khanacademy.org/..."
                  />
                </div>

                <div className="flex flex-wrap gap-6">
                  <div className="flex-1 min-w-[200px]">
                    <label htmlFor="quest-status" className="block text-sm font-medium mb-2 text-gray-600">Status</label>
                    <select
                      id="quest-status"
                      value={formData.is_active.toString()}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive (Draft)</option>
                    </select>
                  </div>

                  <div className="flex items-end pb-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.allow_custom_tasks}
                        onChange={(e) => setFormData({ ...formData, allow_custom_tasks: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                      <span className="ms-2 text-sm font-medium text-gray-700">Allow custom tasks</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Task Editor Toggle */}
              {!showTaskEditor ? (
                <div className="mb-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-sm text-gray-600 mb-3">
                    Add template tasks that will be available to students when they enroll.
                    <strong className="text-amber-600"> Required</strong> tasks are auto-assigned.
                    <strong className="text-blue-600"> Optional</strong> tasks are suggestions.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowTaskEditor(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-primary text-white rounded-lg hover:opacity-90 font-semibold"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add Template Tasks
                  </button>
                </div>
              ) : (
                /* Tasks Section */
                <div className="mb-8">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-gray-900">Template Tasks</h3>
                      <span className="text-sm text-gray-500">
                        ({formData.tasks.filter(t => t.is_required).length} required, {formData.tasks.filter(t => !t.is_required).length} optional)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {formData.tasks.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={collapseAll}
                            className="text-sm text-gray-600 hover:text-gray-800 px-2 py-1"
                          >
                            Collapse All
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            type="button"
                            onClick={expandAll}
                            className="text-sm text-gray-600 hover:text-gray-800 px-2 py-1"
                          >
                            Expand All
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => addTask('', true)}
                        className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium text-sm"
                      >
                        <PlusIcon className="w-4 h-4" />
                        Required
                      </button>
                      <button
                        type="button"
                        onClick={() => addTask('', false)}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm"
                      >
                        <PlusIcon className="w-4 h-4" />
                        Optional
                      </button>
                    </div>
                  </div>

                  {/* Drag and Drop Task List */}
                  {formData.tasks.length > 0 && (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={formData.tasks.map((t, i) => t.id || `task-${i}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {formData.tasks.map((task, index) => (
                            <SortableTaskRow
                              key={task.id || `task-${index}`}
                              task={task}
                              index={index}
                              isExpanded={expandedTasks.has(index)}
                              onToggleExpand={toggleExpand}
                              onUpdateTask={updateTask}
                              onRemoveTask={removeTask}
                              pillars={pillars}
                              errors={errors}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}

                  {/* Quick Add Input */}
                  <div className="mt-4 flex items-center gap-2 p-3 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors">
                    <PlusIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <input
                      ref={quickAddRef}
                      type="text"
                      value={quickAddValue}
                      onChange={(e) => setQuickAddValue(e.target.value)}
                      onKeyDown={handleQuickAdd}
                      className="flex-1 bg-transparent border-none outline-none text-gray-700 placeholder-gray-400"
                      placeholder="Type task title and press Enter to quickly add..."
                    />
                    {quickAddValue && (
                      <span className="text-xs text-gray-400">Press Enter</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Tasks with an amber left border are required (auto-assigned). Blue border = optional (suggestions). Drag to reorder.
                  </p>
                </div>
              )}

              {/* Form Actions */}
              <div className="flex flex-wrap justify-between items-center gap-4 pt-6 border-t">
                <div className="flex gap-2">
                  {mode === 'edit' && (
                    <button
                      type="button"
                      onClick={handleAICleanup}
                      className="px-4 py-2 min-h-[44px] bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap touch-manipulation"
                      disabled={cleanupLoading || loading}
                    >
                      <SparklesIcon className="w-5 h-5" />
                      <span>{cleanupLoading ? 'Cleaning...' : 'AI Cleanup'}</span>
                    </button>
                  )}
                  {canDelete && onDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to delete this quest? This action cannot be undone.')) {
                          onDelete(quest.id);
                        }
                      }}
                      className="px-4 py-2 min-h-[44px] bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 whitespace-nowrap touch-manipulation"
                      disabled={loading}
                    >
                      Delete Quest
                    </button>
                  )}
                </div>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-2 min-h-[44px] border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap touch-manipulation"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2 min-h-[44px] bg-gradient-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-semibold whitespace-nowrap touch-manipulation"
                  >
                    {loading ? (mode === 'edit' ? 'Updating...' : 'Creating...') : (mode === 'edit' ? 'Update Quest' : 'Create Quest')}
                  </button>
                </div>
              </div>
            </>
          )}
        </form>
      </div>
    </div>,
    document.body
  );
};

export default QuestForm;
