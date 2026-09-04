import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, PlusIcon, ExclamationCircleIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useConfirm } from '../../contexts/ConfirmContext'

// Diploma subjects for credit tracking (11 subjects).
// Keys match backend/utils/school_subjects.py SCHOOL_SUBJECTS exactly.

import SortableTaskRow from './questForm/SortableTaskRow'
import DIPLOMA_SUBJECTS from './questForm/DIPLOMA_SUBJECTS'
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
  // A URL, or a (questId) => url builder. Defaults to the admin route.
  templateTasksEndpoint = null
}) => {
  const confirm = useConfirm()
  const [loading, setLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [loadingTasks, setLoadingTasks] = useState(mode === 'edit');
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [quickAddValue, setQuickAddValue] = useState('');
  // Task editor is open by default: the creator's task list is what students
  // actually receive on assign/enroll, so authoring it must not be an
  // easy-to-miss optional step (Treehouse round-2 feedback).
  const [showTaskEditor, setShowTaskEditor] = useState(true);
  const [confirmedNoTasks, setConfirmedNoTasks] = useState(false);
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
    // Legacy rows may store diploma_subjects as ['Electives'] (capitalized) or
    // as an object {electives: 100}, and may have an empty
    // subject_xp_distribution alongside a non-zero xp_value. Normalize all of
    // that into the canonical shape the editor uses: lowercase id list +
    // {id: xp} distribution that sums to xp_value.
    const normalizeTask = (task, index, defaultRequired) => {
      const validIds = new Set(DIPLOMA_SUBJECTS.map((s) => s.id));

      const rawSubjects = task.diploma_subjects;
      let subjects = [];
      if (Array.isArray(rawSubjects)) {
        subjects = rawSubjects
          .map((s) => String(s).toLowerCase())
          .filter((s) => validIds.has(s));
      } else if (rawSubjects && typeof rawSubjects === 'object') {
        subjects = Object.keys(rawSubjects)
          .map((s) => String(s).toLowerCase())
          .filter((s) => validIds.has(s));
      }

      const distribution = {};
      const rawDist = task.subject_xp_distribution;
      if (rawDist && typeof rawDist === 'object' && Object.keys(rawDist).length > 0) {
        Object.entries(rawDist).forEach(([k, v]) => {
          const key = String(k).toLowerCase();
          if (validIds.has(key)) distribution[key] = parseInt(v, 10) || 0;
        });
      } else if (subjects.length > 0 && (task.xp_value || 0) > 0) {
        // No per-subject XP set yet — evenly split the existing total across
        // the listed subjects so the row's Total XP stays accurate on first
        // load.
        const total = parseInt(task.xp_value, 10) || 0;
        const per = Math.floor(total / subjects.length);
        const remainder = total - per * subjects.length;
        subjects.forEach((s, i) => {
          distribution[s] = per + (i === 0 ? remainder : 0);
        });
      }

      const finalSubjects = Object.keys(distribution).length > 0
        ? Object.keys(distribution)
        : subjects;

      // Pillar XP is the source of truth; whatever's stored on the task wins.
      // Subject XP must add up to it (validated on submit), but we don't
      // mutate xp_value here.
      return {
        id: task.id || `task-${index}`,
        title: task.title || '',
        description: task.description || '',
        pillar: task.pillar || 'stem',
        xp_value: parseInt(task.xp_value, 10) || 100,
        is_required:
          task.is_required !== undefined ? task.is_required : defaultRequired,
        diploma_subjects: finalSubjects,
        subject_xp_distribution: distribution,
        order_index: index,
      };
    };

    const loadTasks = async () => {
      if (mode === 'edit' && quest?.id) {
        try {
          // Try unified template-tasks endpoint first
          const response = await api.get(`/api/admin/quests/${quest.id}/template-tasks`);

          if (response.data.tasks && response.data.tasks.length > 0) {
            setFormData(prev => ({
              ...prev,
              tasks: response.data.tasks.map((task, index) =>
                normalizeTask(task, index, false)
              )
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
                tasks: legacyResponse.data.tasks.map((task, index) =>
                  normalizeTask(task, index, true)
                )
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

        // Diploma XP must sum to pillar XP when any diploma subjects are set.
        // Empty diploma subjects = pillar XP only, which is allowed.
        const subjects = task.diploma_subjects || [];
        if (subjects.length > 0) {
          const distribution = task.subject_xp_distribution || {};
          const subjectSum = subjects.reduce(
            (sum, id) => sum + (parseInt(distribution[id], 10) || 0),
            0
          );
          const pillarXp = parseInt(task.xp_value, 10) || 0;
          if (subjectSum !== pillarXp) {
            newErrors[`task_${index}_subjects`] =
              `Diploma subject XP (${subjectSum}) must equal pillar XP (${pillarXp})`;
          }
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
      // Expand tasks with errors (title OR diploma-XP balance)
      const tasksWithErrors = formData.tasks
        .map((_, index) =>
          errors[`task_${index}_title`] || errors[`task_${index}_subjects`]
            ? index
            : null
        )
        .filter(index => index !== null);
      if (tasksWithErrors.length > 0) {
        setExpandedTasks(new Set(tasksWithErrors));
      }
      return;
    }

    // Saving with no task list means students are sent to the create-your-own
    // wizard (AI paths as fallback) instead of the creator's tasks. Make that
    // an explicit choice, not an accident.
    if (formData.tasks.length === 0 && !confirmedNoTasks) {
      setConfirmedNoTasks(true);
      toast('No tasks added yet — students will build their own task list. Save again to confirm.', { icon: '⚠️' });
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
          tasks: formData.tasks.map((task, index) => {
            const distribution = task.subject_xp_distribution || {};
            const subjects = task.diploma_subjects || [];

            return {
              title: task.title.trim(),
              description: task.description.trim(),
              pillar: task.pillar,
              xp_value: parseInt(task.xp_value, 10) || 0,
              order_index: index,
              is_required: task.is_required || false,
              diploma_subjects: subjects,
              subject_xp_distribution: distribution
            };
          })
        };

        // Callers pass this either as a builder or as an already-built URL.
        // It used to be called unconditionally, so a string prop threw
        // "is not a function" *after* the quest itself had saved -- the
        // teacher saw "Failed to save quest" while their tasks were the only
        // thing actually lost (Perch 1fd7a872).
        const templateUrl = typeof templateTasksEndpoint === 'function'
          ? templateTasksEndpoint(questId)
          : templateTasksEndpoint || `/api/admin/quests/${questId}/template-tasks`;
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
          diploma_subjects: [],
          subject_xp_distribution: {},
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
    // Editing pillar XP or the subject distribution can flip the diploma-XP
    // balance check, so clear any stale balance error too.
    if ((field === 'xp_value' || field === 'subject_xp_distribution') &&
        errors[`task_${index}_subjects`]) {
      setErrors((prev) => ({ ...prev, [`task_${index}_subjects`]: '' }));
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
              {/* Tasks live below the fold in this modal. Creators have saved
                  quests without ever scrolling to them and reported that the
                  form "never prompted" for tasks (Arete feedback, Sept 2026),
                  so say up front that the task list is part of this form. */}
              {formData.tasks.length === 0 && (
                <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <strong>Scroll down to add tasks.</strong> Tasks are what students
                  actually do and where XP is earned. Save without any and students
                  build their own task list instead.
                </div>
              )}

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
                      className="px-4 py-2 min-h-[44px] bg-gradient-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap touch-manipulation"
                      disabled={cleanupLoading || loading}
                    >
                      <SparklesIcon className="w-5 h-5" />
                      <span>{cleanupLoading ? 'Cleaning...' : 'AI Cleanup'}</span>
                    </button>
                  )}
                  {canDelete && onDelete && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (await confirm('Are you sure you want to delete this quest? This action cannot be undone.')) {
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
