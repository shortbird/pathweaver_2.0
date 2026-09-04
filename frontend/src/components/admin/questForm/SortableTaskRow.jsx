/**
 * Extracted from admin/QuestForm.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import { XMarkIcon, PlusIcon, TrashIcon, ExclamationCircleIcon, ChevronDownIcon, ChevronUpIcon, Bars3Icon, SparklesIcon } from '@heroicons/react/24/outline';
import { CSS } from '@dnd-kit/utilities';
import { getPillarData } from '../../../utils/pillarMappings';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import DIPLOMA_SUBJECTS from './DIPLOMA_SUBJECTS'

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

          {/* Row: Pillar + Pillar XP + Required Toggle */}
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
                      {pd.name}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Pillar XP */}
            <div className="w-24">
              <label htmlFor={`task-${index}-xp`} className="block text-sm font-medium text-gray-700 mb-1">
                XP
              </label>
              <input
                type="number"
                id={`task-${index}-xp`}
                value={task.xp_value}
                onChange={(e) =>
                  onUpdateTask(
                    index,
                    'xp_value',
                    e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                min="0"
                step="10"
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

          {/* Diploma Subjects + per-subject XP (optional, separate from pillar XP) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Diploma Subjects &amp; XP (optional)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Add diploma subjects this task should also award credit to, and the XP awarded to each subject. Pillar XP above is awarded regardless.
            </p>
            {(() => {
              const distribution = task.subject_xp_distribution || {};
              const addedSubjectIds = task.diploma_subjects || [];
              const remainingSubjects = DIPLOMA_SUBJECTS.filter(
                (s) => !addedSubjectIds.includes(s.id)
              );
              const pillarXp = parseInt(task.xp_value, 10) || 0;
              const subjectSum = addedSubjectIds.reduce(
                (sum, id) => sum + (parseInt(distribution[id], 10) || 0),
                0
              );
              const balanceMismatch =
                addedSubjectIds.length > 0 && subjectSum !== pillarXp;

              return (
                <>
                  {addedSubjectIds.length > 0 && (
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                      {addedSubjectIds.map((subjectId) => {
                        const subject = DIPLOMA_SUBJECTS.find((s) => s.id === subjectId);
                        if (!subject) return null;
                        const subjectXp = distribution[subjectId] ?? 0;
                        return (
                          <div
                            key={subjectId}
                            className="flex items-center gap-3 px-3 py-2 text-sm"
                          >
                            <span className="text-gray-700 flex-1">{subject.label}</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                step="10"
                                value={subjectXp}
                                onChange={(e) => {
                                  const value =
                                    e.target.value === ''
                                      ? 0
                                      : parseInt(e.target.value, 10) || 0;
                                  onUpdateTask(index, 'subject_xp_distribution', {
                                    ...distribution,
                                    [subjectId]: value,
                                  });
                                }}
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right"
                                placeholder="0"
                              />
                              <span className="text-xs text-gray-500 w-6">XP</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateTask(
                                  index,
                                  'diploma_subjects',
                                  addedSubjectIds.filter((s) => s !== subjectId)
                                );
                                const next = { ...distribution };
                                delete next[subjectId];
                                onUpdateTask(index, 'subject_xp_distribution', next);
                              }}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Remove subject"
                            >
                              <XMarkIcon className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {remainingSubjects.length > 0 && (
                    <div className="mt-2">
                      <select
                        value=""
                        onChange={(e) => {
                          const subjectId = e.target.value;
                          if (!subjectId) return;
                          onUpdateTask(index, 'diploma_subjects', [
                            ...addedSubjectIds,
                            subjectId,
                          ]);
                          onUpdateTask(index, 'subject_xp_distribution', {
                            ...distribution,
                            [subjectId]: 0,
                          });
                        }}
                        className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-optio-purple bg-white"
                      >
                        <option value="">+ Add diploma subject</option>
                        {remainingSubjects.map((subject) => (
                          <option key={subject.id} value={subject.id}>
                            {subject.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {addedSubjectIds.length > 0 && (
                    <div
                      className={`mt-2 flex items-center justify-between text-sm ${
                        balanceMismatch ? 'text-red-600' : 'text-gray-600'
                      }`}
                    >
                      <span>Diploma XP allocated</span>
                      <span className="font-semibold">
                        {subjectSum} / {pillarXp}
                      </span>
                    </div>
                  )}
                  {errors[`task_${index}_subjects`] && (
                    <p className="text-red-600 text-xs mt-1 flex items-center gap-1">
                      <ExclamationCircleIcon className="w-3 h-3" />
                      {errors[`task_${index}_subjects`]}
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default SortableTaskRow
