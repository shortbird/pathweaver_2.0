import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Bars3Icon, CheckCircleIcon, ChevronDownIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { getPillarData } from '../../utils/pillarMappings';

/**
 * Clean task card matching CourseBuilder style
 */
const TaskCard = ({ task, isSelected, onClick, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id });

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
      onClick={onClick}
      className={`
        group flex items-start gap-2 p-3 rounded-lg border transition-all cursor-pointer bg-white
        ${isSelected
          ? 'border-optio-purple bg-optio-purple/5 shadow-sm'
          : 'border-gray-200 hover:border-optio-purple/50'
        }
      `}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 -ml-1 mt-0.5 flex-shrink-0"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <Bars3Icon className="w-4 h-4" />
      </button>

      {/* Pillar color dot */}
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
        style={{ backgroundColor: pillarData.color }}
        title={pillarData.name}
      />

      {/* Task title - allow wrapping */}
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm text-gray-900 leading-snug" style={{ fontFamily: 'Poppins' }}>
          {task.title}
        </span>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-500" style={{ fontFamily: 'Poppins' }}>
            {task.xp_amount} XP
          </span>
        </div>
      </div>

      {/* Delete - hover only */}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(task.id);
          }}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-red-500 hover:bg-red-50 rounded transition-all flex-shrink-0"
          aria-label="Remove task"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

/**
 * Completed task card - simplified, non-draggable
 */
const CompletedTaskCard = ({ task, isSelected, onClick }) => {
  const pillarData = getPillarData(task.pillar);

  return (
    <div
      onClick={onClick}
      className={`
        flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer
        ${isSelected
          ? 'border-green-400 bg-green-50'
          : 'border-gray-100 bg-gray-50 hover:border-gray-200'
        }
      `}
    >
      {/* Checkmark */}
      <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />

      {/* Pillar dot */}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: pillarData.color }}
      />

      {/* Task title */}
      <span className="flex-1 text-sm text-gray-600 truncate" style={{ fontFamily: 'Poppins' }}>
        {task.title}
      </span>

      {/* XP earned */}
      <span className="text-xs text-green-600 flex-shrink-0" style={{ fontFamily: 'Poppins' }}>
        +{task.xp_amount} XP
      </span>
    </div>
  );
};

const TaskTimeline = ({
  tasks = [],
  selectedTaskId,
  onTaskSelect,
  onTaskReorder,
  onAddTask,
  onRemoveTask,
  onPreloadWizard,
  onCollapse,
  isCollapsible = false,
  // Keep these props for backward compatibility but ignore them
  displayMode,
  onDisplayModeChange
}) => {
  const [activeId, setActiveId] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);

  // Split tasks into active and completed
  const activeTasks = tasks.filter(t => !t.is_completed);
  const completedTasks = tasks.filter(t => t.is_completed);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    })
  );

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) {
      return;
    }

    // Only reorder within active tasks
    const oldIndex = tasks.findIndex(task => task.id === active.id);
    const newIndex = tasks.findIndex(task => task.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      onTaskReorder(oldIndex, newIndex);
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Poppins' }}>
          Tasks
        </h3>
        {isCollapsible && onCollapse && (
          <button
            onClick={onCollapse}
            className="md:hidden p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            aria-label="Collapse sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-3">
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm" style={{ fontFamily: 'Poppins' }}>No tasks yet</p>
            <p className="text-xs mt-1" style={{ fontFamily: 'Poppins' }}>Click "Add Task" to get started</p>
          </div>
        ) : (
          <>
            {/* Active Tasks - Draggable */}
            {activeTasks.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <SortableContext items={activeTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {activeTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isSelected={task.id === selectedTaskId}
                        onClick={() => onTaskSelect(task)}
                        onRemove={onRemoveTask}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {/* No active tasks message */}
            {activeTasks.length === 0 && completedTasks.length > 0 && (
              <div className="text-center py-4 text-gray-400">
                <p className="text-sm" style={{ fontFamily: 'Poppins' }}>All tasks completed!</p>
              </div>
            )}

            {/* Completed Tasks Section */}
            {completedTasks.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                  style={{ fontFamily: 'Poppins' }}
                >
                  <span className="font-medium">
                    Completed ({completedTasks.length})
                  </span>
                  <ChevronDownIcon
                    className={`w-4 h-4 transition-transform ${showCompleted ? 'rotate-180' : ''}`}
                  />
                </button>

                {showCompleted && (
                  <div className="mt-2 space-y-1.5">
                    {completedTasks.map((task) => (
                      <CompletedTaskCard
                        key={task.id}
                        task={task}
                        isSelected={task.id === selectedTaskId}
                        onClick={() => onTaskSelect(task)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Task Button */}
      <div className="p-3 border-t border-gray-200">
        <button
          onClick={onAddTask}
          onMouseEnter={onPreloadWizard}
          onFocus={onPreloadWizard}
          className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg hover:border-optio-purple hover:bg-optio-purple/5 transition-all flex items-center justify-center gap-2 text-gray-600 hover:text-optio-purple text-sm"
          style={{ fontFamily: 'Poppins' }}
        >
          <PlusIcon className="w-4 h-4" />
          <span className="font-medium">Add Task</span>
        </button>
      </div>
    </div>
  );
};

export default TaskTimeline;
