import { useState } from 'react'
import {
  CheckCircleIcon,
  QuestionMarkCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid'

/**
 * StepItem - Individual step with checkbox, drill-down support, and sub-steps
 *
 * Designed for neurodivergent students with:
 * - Large touch targets (48px min)
 * - Clear visual feedback
 * - "I'm stuck" drill-down button
 * - Nested sub-steps display
 */
const StepItem = ({
  step,
  onToggle,
  onDrillDown,
  isToggling,
  isDrillingDown,
  depth = 0
}) => {
  const [isExpanded, setIsExpanded] = useState(true)

  const hasSubSteps = step.sub_steps && step.sub_steps.length > 0
  const isCompleted = step.is_completed
  const canDrillDown = step.generation_depth < 3 && !hasSubSteps

  // Calculate completed sub-steps
  const completedSubSteps = hasSubSteps
    ? step.sub_steps.filter(s => s.is_completed).length
    : 0

  const handleToggle = () => {
    if (!isToggling) {
      onToggle(step.id)
    }
  }

  const handleDrillDown = (e) => {
    e.stopPropagation()
    if (!isDrillingDown && canDrillDown) {
      onDrillDown(step.id)
    }
  }

  // Indentation based on depth
  const indentClass = depth > 0 ? `ml-${Math.min(depth * 4, 12)}` : ''

  return (
    <div className={`${indentClass}`}>
      {/* Main step row */}
      <div
        className={`
          group flex items-start gap-3 p-3 rounded-lg transition-all
          ${isCompleted ? 'bg-green-50/50' : 'hover:bg-gray-50'}
          ${depth > 0 ? 'border-l-2 border-optio-purple/20' : ''}
        `}
      >
        {/* Checkbox - large touch target */}
        <button
          onClick={handleToggle}
          disabled={isToggling}
          className={`
            flex-shrink-0 w-12 h-12 min-w-[48px] min-h-[48px] flex items-center justify-center
            rounded-lg transition-all touch-manipulation
            ${isCompleted
              ? 'text-green-600'
              : 'text-gray-300 hover:text-optio-purple hover:bg-optio-purple/10'
            }
            ${isToggling ? 'opacity-50' : ''}
          `}
          aria-label={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
        >
          {isToggling ? (
            <div className="w-5 h-5 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
          ) : isCompleted ? (
            <CheckCircleSolidIcon className="w-6 h-6" />
          ) : (
            <div className="w-6 h-6 border-2 border-current rounded-full" />
          )}
        </button>

        {/* Step content */}
        <div className="flex-1 min-w-0 pt-2">
          <p
            className={`
              text-sm leading-relaxed
              ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-800'}
            `}
            style={{ fontFamily: 'Poppins' }}
          >
            {step.title}
          </p>
          {step.description && (
            <p className="mt-1 text-xs text-gray-500" style={{ fontFamily: 'Poppins' }}>
              {step.description}
            </p>
          )}

          {/* Sub-step progress indicator */}
          {hasSubSteps && (
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-xs text-optio-purple hover:text-optio-pink transition-colors"
              >
                {isExpanded ? (
                  <ChevronDownIcon className="w-3 h-3" />
                ) : (
                  <ChevronRightIcon className="w-3 h-3" />
                )}
                {completedSubSteps}/{step.sub_steps.length} sub-steps
              </button>
            </div>
          )}
        </div>

        {/* "I'm stuck" drill-down button */}
        {canDrillDown && !isCompleted && (
          <button
            onClick={handleDrillDown}
            disabled={isDrillingDown}
            className={`
              flex-shrink-0 flex items-center justify-center gap-1
              w-10 h-10 min-w-[40px] min-h-[40px]
              text-xs text-gray-400 hover:text-optio-purple hover:bg-optio-purple/10
              rounded-lg transition-all touch-manipulation
              opacity-0 group-hover:opacity-100 focus:opacity-100
              sm:w-auto sm:px-2 sm:h-8
              ${isDrillingDown ? 'opacity-100' : ''}
            `}
            title="Break this down further"
            aria-label="I'm stuck on this step"
          >
            {isDrillingDown ? (
              <div className="w-4 h-4 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <QuestionMarkCircleIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Help</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Nested sub-steps */}
      {hasSubSteps && isExpanded && (
        <div className="mt-1 space-y-1">
          {step.sub_steps.map((subStep) => (
            <StepItem
              key={subStep.id}
              step={subStep}
              onToggle={onToggle}
              onDrillDown={onDrillDown}
              isToggling={isToggling}
              isDrillingDown={isDrillingDown}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default StepItem
