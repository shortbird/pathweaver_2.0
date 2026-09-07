// The phone layout's task switcher: a grouped <select> plus an add button,
// standing in for the desktop sidebar.
import { ChevronDownIcon, PlusIcon } from '@heroicons/react/24/outline';

const MobileTaskPicker = ({ activeTasks, completedTasks, onAddTask, onTaskSelect, task, tasks }) => (
  <div className="sm:hidden px-3 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
    <div className="relative flex-1">
      <select
        value={task?.id || ''}
        onChange={(e) => {
          const selected = tasks.find(t => t.id === e.target.value);
          if (selected) onTaskSelect?.(selected);
        }}
        className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-optio-purple/30 focus:border-optio-purple"
      >
        {activeTasks.length > 0 && (
          <optgroup label={`Active (${activeTasks.length})`}>
            {activeTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.xp_value} XP)
              </option>
            ))}
          </optgroup>
        )}
        {completedTasks.length > 0 && (
          <optgroup label={`Completed (${completedTasks.length})`}>
            {completedTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.xp_value} XP)
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
    </div>
    {onAddTask && (
      <button
        onClick={onAddTask}
        className="flex-shrink-0 p-2 text-optio-purple hover:bg-optio-purple/5 rounded-lg transition-colors"
        title="Add Task"
      >
        <PlusIcon className="w-5 h-5" />
      </button>
    )}
  </div>
);

export default MobileTaskPicker;
