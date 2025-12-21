import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowTrendingUpIcon, Bars3Icon, CheckCircleIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { getPillarData } from '../../utils/pillarMappings';
import TaskDisplayModeToggle from './TaskDisplayModeToggle';
import toast from 'react-hot-toast';

const TaskCard = ({ task, index, isSelected, displayMode, onClick, onRemove }) => {
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
  const isCompleted = task.is_completed || false;

  // Status for flexible mode
  const hasEvidence = task.evidence_blocks?.length > 0 || task.evidence_text;
  const status = isCompleted ? 'completed' : hasEvidence ? 'in_progress' : 'not_started';

  const statusConfig = {
    not_started: { icon: ClockIcon, label: 'Not started', color: 'text-gray-400' },
    in_progress: { icon: ArrowTrendingUpIcon, label: 'In progress', color: pillarData.text },
    completed: { icon: CheckCircleIcon, label: 'Completed', color: 'text-green-600' }
  };

  const StatusIcon = statusConfig[status].icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`
        relative rounded-lg p-3 mb-2 cursor-pointer transition-all duration-200
        ${isSelected
          ? `border-3 shadow-md`
          : 'border-2 border-gray-200 hover:border-gray-300 hover:shadow-sm'
        }
        ${isCompleted ? 'bg-green-50' : 'bg-white'}
      `}
      {...(displayMode === 'timeline' ? {
        style: {
          ...style,
          borderColor: isSelected ? pillarData.color : undefined,
          backgroundColor: isSelected ? `${pillarData.color}20` : (isCompleted ? '#f0fdf4' : 'white')
        }
      } : {
        style: {
          ...style,
          borderColor: isSelected ? pillarData.color : undefined,
          backgroundColor: isSelected ? `${pillarData.color}15` : (isCompleted ? '#f0fdf4' : 'white')
        }
      })}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded"
        onClick={(e) => e.stopPropagation()}
      >
        <Bars3Icon className="w-4 h-4 text-gray-400" />
      </div>

      <div className="pl-6">
        {/* Task Number Badge (Timeline Mode) or Status Icon (Flexible Mode) */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 flex-1">
            {displayMode === 'timeline' ? (
              // Timeline mode: Show number or checkmark
              <div
                className={`
                  flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm
                  ${isCompleted ? 'bg-green-500 text-white' : 'text-white'}
                `}
                style={!isCompleted ? { backgroundColor: pillarData.color } : {}}
              >
                {isCompleted ? <CheckCircleIcon className="w-4 h-4" /> : index + 1}
              </div>
            ) : (
              // Flexible mode: Show status icon
              <StatusIcon
                className={`flex-shrink-0 w-5 h-5 ${statusConfig[status].color}`}
                style={status === 'in_progress' ? { color: pillarData.color } : {}}
              />
            )}

            {/* Task Name */}
            <h3
              className="font-semibold text-sm leading-tight line-clamp-2"
              style={{ fontFamily: 'Poppins' }}
            >
              {task.title}
            </h3>
          </div>

          {/* Remove Button - Only show for non-completed tasks */}
          {!isCompleted && onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(task.id);
              }}
              className="flex-shrink-0 ml-2 p-1 rounded-full hover:bg-red-100 transition-colors group"
              title="Remove task"
            >
              <XMarkIcon className="w-4 h-4 text-gray-400 group-hover:text-red-600" />
            </button>
          )}
        </div>

        {/* Pillar + XP Row */}
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{
              backgroundColor: `${pillarData.color}20`,
              color: pillarData.color,
              fontFamily: 'Poppins'
            }}
          >
            {pillarData.name}
          </div>
          <div
            className="px-2 py-0.5 rounded-full text-xs font-bold"
            style={{
              backgroundColor: `${pillarData.color}15`,
              color: pillarData.color,
              fontFamily: 'Poppins'
            }}
          >
            {task.xp_amount} XP
          </div>
        </div>

        {/* Status Label (Flexible Mode Only) */}
        {displayMode === 'flexible' && (
          <div className="mt-2 text-xs" style={{ fontFamily: 'Poppins' }}>
            <span className={statusConfig[status].color} style={status === 'in_progress' ? { color: pillarData.color } : {}}>
              {statusConfig[status].label}
            </span>
          </div>
        )}
      </div>

      {/* Timeline Connector (Timeline Mode Only) */}
      {displayMode === 'timeline' && (
        <div className="absolute left-[26px] top-full w-0.5 h-2 bg-gray-300" />
      )}
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
  displayMode = 'flexible',
  onDisplayModeChange
}) => {
  const [activeId, setActiveId] = useState(null);

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
    <div className="h-full flex flex-col bg-gray-50">
      {/* Mode Toggle */}
      <TaskDisplayModeToggle mode={displayMode} onModeChange={onDisplayModeChange} />

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-4">
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm" style={{ fontFamily: 'Poppins' }}>No tasks yet</p>
            <p className="text-xs mt-1" style={{ fontFamily: 'Poppins' }}>Click "Add Task" to get started</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
              <div className="relative">
                {tasks.map((task, index) => (
                  <div key={task.id} className="relative">
                    <TaskCard
                      task={task}
                      index={index}
                      isSelected={task.id === selectedTaskId}
                      displayMode={displayMode}
                      onClick={() => onTaskSelect(task)}
                      onRemove={onRemoveTask}
                    />
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Add Task Button */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={onAddTask}
          className="w-full py-3 border-2 border-dashed border-gray-400 rounded-lg hover:border-optio-purple hover:bg-purple-50 transition-all flex items-center justify-center gap-2 text-gray-700 hover:text-optio-purple"
          style={{ fontFamily: 'Poppins' }}
        >
          <PlusIcon className="w-5 h-5" />
          <span className="font-semibold">Add Task</span>
        </button>
      </div>
    </div>
  );
};

export default TaskTimeline;
