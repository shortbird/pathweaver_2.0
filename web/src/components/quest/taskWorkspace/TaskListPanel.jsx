// The desktop sidebar: every task in the quest, reorderable by drag or by the
// up/down arrows, with the collapse control.
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronLeftIcon, PlusIcon } from '@heroicons/react/24/outline';
import SortableTaskItem from './SortableTaskItem';

const TaskListPanel = ({ activeTasks, completedTasks, handleDragEnd, handleMoveDown, handleMoveUp, isTaskListOpen, onAddTask, onRemoveTask, onTaskSelect, sensors, setIsTaskListOpen, task, tasks }) => (
  <div className={`
    hidden sm:block
    ${isTaskListOpen ? 'w-64' : 'w-0'}
    flex-shrink-0 border-r border-gray-200 transition-all duration-300 overflow-hidden
  `}>
    <div className="h-full flex flex-col w-64">
      {/* Task List Header */}
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Tasks ({tasks.length})
        </span>
        <button
          onClick={() => setIsTaskListOpen(false)}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          title="Hide task list"
        >
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={activeTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {activeTasks.map((t, index) => (
                <SortableTaskItem
                  key={t.id}
                  task={t}
                  isSelected={t.id === task?.id}
                  onClick={() => onTaskSelect?.(t)}
                  onRemove={onRemoveTask}
                  onMoveUp={() => handleMoveUp(t.id)}
                  onMoveDown={() => handleMoveDown(t.id)}
                  isFirst={index === 0 || activeTasks[index - 1]?.is_required === true}
                  isLast={index === activeTasks.length - 1}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Completed Tasks */}
        {completedTasks.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200">
            <div className="px-1 mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Completed ({completedTasks.length})
              </span>
            </div>
            <div className="space-y-2">
              {completedTasks.map((t) => (
                <SortableTaskItem
                  key={t.id}
                  task={t}
                  isSelected={t.id === task?.id}
                  onClick={() => onTaskSelect?.(t)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Task Button */}
      {onAddTask && (
        <div className="p-2 border-t border-gray-100">
          <button
            onClick={onAddTask}
            className="w-full py-2 text-sm text-optio-purple hover:bg-optio-purple/5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <PlusIcon className="w-4 h-4" />
            Add Task
          </button>
        </div>
      )}
    </div>
  </div>
);

export default TaskListPanel;
