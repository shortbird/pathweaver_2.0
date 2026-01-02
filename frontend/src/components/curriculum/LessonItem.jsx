/**
 * LessonItem Component
 *
 * Sortable lesson item for the curriculum sidebar.
 * Shows lesson progress, XP threshold, and task count.
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Bars3Icon,
  CheckCircleIcon,
  ClockIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline'
import { getPillarData } from '../../utils/pillarMappings'

export const LessonItem = ({
  lesson,
  index,
  isSelected,
  isAdmin,
  xpThreshold,
  earnedXP,
  taskCount,
  onClick
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: lesson.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isCompleted = lesson.is_completed || false
  const pillarData = getPillarData(lesson.pillar || 'art')

  // XP threshold completion: lesson is "XP complete" when earned >= threshold
  const hasXpThreshold = xpThreshold > 0
  const isXpComplete = hasXpThreshold ? earnedXP >= xpThreshold : true

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={`
        relative rounded-lg p-3 mb-2 transition-all duration-200
        cursor-pointer hover:border-gray-300 hover:shadow-lg hover:scale-[1.02]
        ${isSelected
          ? 'border-2 shadow-md scale-[1.02]'
          : 'border border-gray-200'
        }
      `}
      style={{
        ...style,
        borderColor: isSelected ? pillarData.color : undefined,
        backgroundColor: isSelected ? `${pillarData.color}15` : (isCompleted ? '#f0fdf4' : 'white')
      }}
    >
      {/* Drag Handle (Admin Only) */}
      {isAdmin && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <Bars3Icon className="w-4 h-4 text-gray-400" />
        </div>
      )}

      <div className={`flex items-center gap-2.5 ${isAdmin ? 'pl-6' : ''}`}>
        {/* Lesson Number Badge */}
        <div className="relative flex-shrink-0">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center font-semibold text-sm"
            style={{
              backgroundImage: `linear-gradient(135deg, ${pillarData.color}ee, ${pillarData.color}88)`,
              color: 'white'
            }}
          >
            {index + 1}
          </div>
          {/* Completion Overlay */}
          {isCompleted && (
            <div className="absolute inset-0 bg-green-600/30 rounded-md flex items-center justify-center">
              <CheckCircleIcon className="w-5 h-5 text-green-600" strokeWidth={2.5} />
            </div>
          )}
        </div>

        {/* Lesson Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate mb-1 text-gray-900">
            {lesson.title || `Lesson ${index + 1}`}
          </div>
          {/* Task count and XP Progress */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {taskCount > 0 && (
              <span className="flex items-center gap-1">
                <ClipboardDocumentListIcon className="w-3 h-3" />
                {taskCount} task{taskCount !== 1 ? 's' : ''}
              </span>
            )}
            {taskCount > 0 && hasXpThreshold && (
              <span className="text-gray-300">|</span>
            )}
            {hasXpThreshold && (
              <span className={isXpComplete ? 'text-green-600 font-medium' : ''}>
                {isXpComplete ? (
                  <span className="flex items-center gap-1">
                    <CheckCircleIcon className="w-3 h-3" />
                    {earnedXP}/{xpThreshold} XP
                  </span>
                ) : (
                  <span>{earnedXP}/{xpThreshold} XP to complete</span>
                )}
              </span>
            )}
            {!taskCount && !hasXpThreshold && lesson.duration_minutes && (
              <span className="flex items-center gap-1">
                <ClockIcon className="w-3 h-3" />
                {lesson.duration_minutes} min
              </span>
            )}
          </div>
        </div>

        <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </div>
    </div>
  )
}

export default LessonItem
