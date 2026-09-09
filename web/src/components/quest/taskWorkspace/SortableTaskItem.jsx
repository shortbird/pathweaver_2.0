// One row in the collapsible task list: drag handle or reorder arrows, title,
// XP pill and status. Lifted out of TaskWorkspace.jsx by QF-02 -- it was always
// its own component, it just lived in the same file.
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CheckCircleIcon, ExclamationCircleIcon, ChevronUpIcon, ChevronDownIcon,
  Bars3Icon, TrashIcon
} from '@heroicons/react/24/outline';
import { getPillarData } from '../../../utils/pillarMappings';
import useHidePillars from '../../../hooks/useHidePillars';

// optio-purple. Stands in for the pillar colour where pillars are hidden.
const BRAND_PURPLE = '#6d469b';

// Sortable Task Item for the collapsible list
const SortableTaskItem = ({ task, isSelected, onClick, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) => {
  const hidePillars = useHidePillars();
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
  const isRequired = task.is_required;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`
        group flex items-start gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all
        min-h-[72px] bg-white border
        ${isRequired ? 'border-l-4 border-l-amber-500' : ''}
        ${isSelected
          ? 'border-optio-purple bg-optio-purple/5 shadow-sm'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
        }
        ${task.is_completed ? 'opacity-60 bg-gray-50' : ''}
      `}
    >
      {/* Reorder controls or required icon */}
      {!isRequired ? (
        <div className="flex flex-col items-center justify-center flex-shrink-0">
          {/* Desktop: Drag handle */}
          <button
            type="button"
            className="hidden sm:flex cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 min-w-[24px] min-h-[24px] touch-manipulation items-center justify-center"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <Bars3Icon className="w-4 h-4" />
          </button>
          {/* Mobile: Up/Down arrows */}
          <div className="flex sm:hidden flex-col -my-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp?.();
              }}
              disabled={isFirst}
              className={`p-1 rounded transition-colors ${isFirst ? 'text-gray-200' : 'text-gray-400 active:bg-gray-100'}`}
            >
              <ChevronUpIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown?.();
              }}
              disabled={isLast}
              className={`p-1 rounded transition-colors ${isLast ? 'text-gray-200' : 'text-gray-400 active:bg-gray-100'}`}
            >
              <ChevronDownIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="p-1 min-w-[24px] min-h-[24px] flex-shrink-0 flex items-center justify-center" title="Required task">
          <ExclamationCircleIcon className="w-4 h-4 text-amber-500" />
        </div>
      )}

      {/* Task content - title and metadata */}
      <div className="flex-1 min-w-0">
        {/* Task title - full width */}
        <span className={`block text-sm leading-snug line-clamp-2 ${isSelected ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
          {task.title}
        </span>
        {/* XP pill + status row */}
        <div className="flex items-center gap-2 mt-1">
          {task.is_completed ? (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <CheckCircleIcon className="w-3.5 h-3.5" />
              Completed
            </span>
          ) : (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: hidePillars ? BRAND_PURPLE : pillarData.color }}
            >
              {task.xp_amount || task.xp_value} XP
            </span>
          )}
          {/* Delete button inline - hover only, hidden for required tasks */}
          {onRemove && !task.is_completed && !isRequired && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(task.id);
              }}
              className="sm:opacity-0 sm:group-hover:opacity-100 p-0.5 text-red-400 hover:text-red-600 rounded transition-all ml-auto"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SortableTaskItem;
