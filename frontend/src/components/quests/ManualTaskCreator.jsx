import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import api from '../../services/api';
import useCanEditXp from '../../hooks/useCanEditXp';
import useHidePillars from '../../hooks/useHidePillars';

// Draft autosave.
//
// Tasks lived only in React state until the student pressed Finish, and nothing
// reached the server before that one batch POST. A crash, a reload, a session
// that expired mid-write or a stray back-navigation took every task they had
// typed. From a student's bug bounty report, 2026-08-27:
//
//   "every time I work on quest tasks and it crashes, all of my tasks are
//    deleted. I was hoping you could add an autosave feature kinda inbetween
//    making tasks."
//
// So the list AND the half-typed form are mirrored to localStorage on every
// change, and restored on mount. Deliberately local rather than a server draft:
// this has to survive the cases where the server is exactly what went away.
const DRAFT_PREFIX = 'optio:manual-tasks:';
// Long enough to come back after a bad day, short enough that a draft cannot
// surprise someone months later with tasks they have forgotten writing.
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Scoped by quest AND author: a parent authoring for two children on the same
// quest must not inherit the other child's unsubmitted list.
const draftKey = (scope, questId) => `${DRAFT_PREFIX}${scope || 'self'}:${questId}`;

const readDraft = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || !Array.isArray(draft.addedTasks) ||
        !Number.isFinite(draft.savedAt) || Date.now() - draft.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    // Private mode, a disabled store, or a draft written by an older shape.
    // A draft we cannot read is the same as no draft.
    return null;
  }
};

const writeDraft = (key, payload) => {
  try {
    localStorage.setItem(key, JSON.stringify({ ...payload, savedAt: Date.now() }));
  } catch {
    // Quota or private mode. Losing the safety net must never block the work
    // it exists to protect.
  }
};

const clearDraft = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing useful to do; the TTL will collect it.
  }
};

const EMPTY_TASK = {
  title: '',
  description: '',
  pillar: '',
  xp_value: 100,
  diploma_subject: ''
};

/**
 * ManualTaskCreator Component
 *
 * Allows students to create custom quest tasks manually.
 * Features:
 * - Clean, simple form focused on creativity
 * - Manual task entry with title, description, and pillar selection
 * - No AI assistance - pure student-driven task creation
 *
 * Schools that have switched the pillars off (feature_flags.hide_pillars) get a
 * form with one classification instead of two: the credit is picked directly
 * and the pillar is derived from it server-side.
 */
const ManualTaskCreator = ({
  questId, sessionId, onTasksCreated, onCancel, onSubmitOverride = null, draftScope = null
}) => {
  const canEditXp = useCanEditXp();
  const hidePillars = useHidePillars();

  const storageKey = draftKey(draftScope, questId);
  // Read once, before first paint, so restored tasks are simply there rather
  // than appearing a frame later.
  const [restored] = useState(() => readDraft(storageKey));
  const [currentTask, setCurrentTask] = useState(() => ({ ...EMPTY_TASK, ...(restored?.currentTask || {}) }));

  const [addedTasks, setAddedTasks] = useState(() => restored?.addedTasks || []);
  const [showRestoredNotice, setShowRestoredNotice] = useState(() => (restored?.addedTasks?.length || 0) > 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Save on every change to either the list or the form in progress. Clearing
  // the last task also clears the draft, so an emptied form does not leave a
  // stale one behind to restore.
  useEffect(() => {
    const hasWork = addedTasks.length > 0 ||
      currentTask.title.trim() !== '' || currentTask.description.trim() !== '';
    if (hasWork) {
      writeDraft(storageKey, { addedTasks, currentTask });
    } else {
      clearDraft(storageKey);
    }
  }, [addedTasks, currentTask, storageKey]);

  const discardDraft = () => {
    setAddedTasks([]);
    setCurrentTask({ ...EMPTY_TASK });
    setShowRestoredNotice(false);
    clearDraft(storageKey);
  };

  const pillars = [
    { key: 'stem', label: 'STEM' },
    { key: 'wellness', label: 'Wellness' },
    { key: 'communication', label: 'Communication' },
    { key: 'civics', label: 'Civics' },
    { key: 'art', label: 'Art' }
  ];

  // Diploma credit (school subject) the task counts toward. Display names must
  // match the backend SUBJECT_NORMALIZATION map in routes/tasks/xp_helpers.py.
  const subjects = [
    'Language Arts',
    'Math',
    'Science',
    'Social Studies',
    'Financial Literacy',
    'Health',
    'PE',
    'Fine Arts',
    'CTE',
    'Digital Literacy',
    'Electives'
  ];

  // Sensible default credit for each pillar, so "Auto" never dumps work into
  // Electives. Mirrors PILLAR_TO_SUBJECTS in backend/utils/school_subjects.py.
  const pillarDefaultSubject = {
    stem: 'Math',
    wellness: 'Health',
    communication: 'Language Arts',
    civics: 'Social Studies',
    art: 'Fine Arts'
  };

  const resolveSubject = (task) =>
    task.diploma_subject || pillarDefaultSubject[task.pillar] || 'Electives';

  const xpOptions = [
    { value: 25, label: '25 XP - Quick task' },
    { value: 50, label: '50 XP - Small task' },
    { value: 75, label: '75 XP - Light task' },
    { value: 100, label: '100 XP - Medium task' },
    { value: 150, label: '150 XP - Large task' },
    { value: 200, label: '200 XP - Major task' }
  ];

  const handleInputChange = (field, value) => {
    setCurrentTask(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleAddTask = () => {
    setError('');

    // Validation
    if (!currentTask.title || currentTask.title.length < 3) {
      setError('Task title must be at least 3 characters');
      return;
    }

    if (!currentTask.description || currentTask.description.trim().length === 0) {
      setError('Task description is required');
      return;
    }

    if (!hidePillars && !currentTask.pillar) {
      setError('Please select a pillar for this task');
      return;
    }

    if (hidePillars && !currentTask.diploma_subject) {
      setError('Please choose the credit this task counts toward');
      return;
    }

    // Add to tasks list. 100% of the XP counts toward the chosen credit.
    // With pillars hidden the pillar is omitted entirely rather than guessed
    // here — the server derives it from this credit (school_subjects.py).
    const chosenSubject = resolveSubject(currentTask);
    const taskData = {
      title: currentTask.title,
      description: currentTask.description,
      xp_value: currentTask.xp_value || 100,
      diploma_subjects: { [chosenSubject]: 100 }
    };
    if (!hidePillars) taskData.pillar = currentTask.pillar;

    setAddedTasks(prev => [...prev, taskData]);

    // Reset form
    setCurrentTask({ ...EMPTY_TASK });
    setError('');
  };

  const handleRemoveTask = (index) => {
    setAddedTasks(prev => prev.filter((_, i) => i !== index));
  };

  const handleFinish = async () => {
    if (addedTasks.length === 0) {
      setError('Please add at least one task');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // Parent-authoring mode: hand the batch to the caller, which writes it to
      // the child's enrollment instead of the signed-in user's. Same form, same
      // validation — only the write target differs.
      if (onSubmitOverride) {
        await onSubmitOverride(addedTasks);
        // Only now are the tasks somewhere other than this browser.
        clearDraft(storageKey);
        onTasksCreated({ success: true, tasks: addedTasks });
        return;
      }

      const response = await api.post(`/api/quests/${questId}/add-manual-tasks`, {
        tasks: addedTasks
      });

      if (response.data.success) {
        clearDraft(storageKey);
        onTasksCreated(response.data);
      } else {
        setError(response.data.error || 'Failed to add tasks');
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error('Error adding tasks:', err);
      setError(err.response?.data?.error || 'Failed to add tasks. Please try again.');
      setIsSubmitting(false);
    }
  };

  const renderAddedTasksList = () => {
    if (addedTasks.length === 0) return null;

    return (
      <div className="mt-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-3">
          Your Tasks ({addedTasks.length})
        </h4>

        <div className="space-y-2">
          {addedTasks.map((task, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h5 className="font-semibold text-gray-900">{task.title}</h5>
                  <span className="text-sm text-optio-purple font-bold">{task.xp_value || 100} XP</span>
                  {!hidePillars && (
                    <span className="text-xs text-gray-500 capitalize">({task.pillar || 'stem'})</span>
                  )}
                  <span className="text-xs font-medium text-optio-pink">
                    {Object.keys(task.diploma_subjects || {})[0] || 'Electives'}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">{task.description}</p>
              </div>
              <button
                onClick={() => handleRemoveTask(index)}
                className="ml-4 text-red-600 hover:text-red-700 font-semibold"
                aria-label="Remove task"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Your Quest Tasks</h2>
        <p className="text-gray-600">
          Design custom tasks that match your interests and learning goals.
        </p>
      </div>

      {showRestoredNotice && (
        <div className="mb-6 p-4 bg-purple-50 border border-optio-purple/30 rounded-lg flex items-start justify-between gap-4">
          <p className="text-sm text-gray-700">
            Picked up where you left off — {addedTasks.length} task{addedTasks.length !== 1 ? 's' : ''} you
            wrote but never submitted {addedTasks.length !== 1 ? 'are' : 'is'} still here.
          </p>
          <button
            type="button"
            onClick={discardDraft}
            className="shrink-0 text-sm font-semibold text-optio-purple hover:underline"
          >
            Start over
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Task Creation Form */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="space-y-4">
          {/* Title Input */}
          <div>
            <label htmlFor="task-title" className="block text-sm font-semibold text-gray-700 mb-2">
              Task Title *
            </label>
            <input
              id="task-title"
              type="text"
              value={currentTask.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="e.g., Interview my grandparent about their childhood"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
            />
          </div>

          {/* Description Textarea */}
          <div>
            <label htmlFor="task-description" className="block text-sm font-semibold text-gray-700 mb-2">
              Description (What will you do?) *
            </label>
            <textarea
              id="task-description"
              value={currentTask.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Describe what you'll do, how you'll explore, and what you hope to discover..."
              rows={5}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              {currentTask.description.length} characters
            </p>
          </div>

          {/* Pillar Selection */}
          {!hidePillars && (
            <div>
              <label htmlFor="task-pillar" className="block text-sm font-semibold text-gray-700 mb-2">
                Pillar *
              </label>
              <select
                id="task-pillar"
                value={currentTask.pillar}
                onChange={(e) => handleInputChange('pillar', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
              >
                <option value="">Select a pillar...</option>
                {pillars.map(p => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Diploma Credit (Subject) Selection. With pillars hidden this is the
              only classification on the form, so it is required rather than
              defaulted off a pillar that was never chosen. */}
          <div>
            <label htmlFor="task-subject" className="block text-sm font-semibold text-gray-700 mb-2">
              {hidePillars ? 'Counts toward credit *' : 'Counts toward credit'}
            </label>
            <select
              id="task-subject"
              value={currentTask.diploma_subject}
              onChange={(e) => handleInputChange('diploma_subject', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
            >
              <option value="">
                {hidePillars
                  ? 'Select a subject...'
                  : currentTask.pillar
                    ? `Auto (${pillarDefaultSubject[currentTask.pillar] || 'Electives'})`
                    : 'Auto (based on pillar)'}
              </option>
              {subjects.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              All of this task's XP counts toward the selected subject credit.
            </p>
          </div>

          {/* XP Value Selection — hidden when the org restricts XP to teachers;
              the server assigns the standard task XP instead. */}
          {canEditXp && (
            <div>
              <label htmlFor="task-xp" className="block text-sm font-semibold text-gray-700 mb-2">
                Task Size *
              </label>
              <select
                id="task-xp"
                value={currentTask.xp_value}
                onChange={(e) => handleInputChange('xp_value', parseInt(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-optio-purple"
              >
                {xpOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Add Task Button */}
          <button
            onClick={handleAddTask}
            disabled={!currentTask.title || !currentTask.description ||
              (hidePillars ? !currentTask.diploma_subject : !currentTask.pillar)}
            className="w-full px-6 py-3 bg-optio-purple hover:bg-optio-purple-dark disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            Add This Task
          </button>
        </div>
      </div>

      {/* Added Tasks List */}
      {renderAddedTasksList()}

      {/* Footer Actions */}
      <div className="mt-6 flex gap-4">
        <button
          onClick={onCancel}
          className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleFinish}
          disabled={addedTasks.length === 0 || isSubmitting}
          className="flex-1 px-6 py-3 bg-gradient-primary disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
        >
          {isSubmitting ? 'Finishing...' : `Finish (${addedTasks.length} task${addedTasks.length !== 1 ? 's' : ''})`}
        </button>
      </div>
    </div>
  );
};

ManualTaskCreator.propTypes = {
  questId: PropTypes.string.isRequired,
  sessionId: PropTypes.string.isRequired,
  onTasksCreated: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  // Parent-authoring mode: receives the finished batch instead of POSTing it.
  onSubmitOverride: PropTypes.func,
  // Who the tasks are being written for. Keys the local draft, so a parent
  // authoring for two children on one quest keeps two separate drafts.
  // Omitted means the signed-in student writing for themselves.
  draftScope: PropTypes.string
};

export default ManualTaskCreator;
