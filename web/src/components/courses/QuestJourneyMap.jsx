/**
 * QuestJourneyMap
 *
 * Connected node path showing course progress across projects.
 * Circles fill in as XP is earned via SVG stroke-dashoffset.
 *
 * Node states:
 * - Completed: Filled gradient + checkmark
 * - In-progress: Circular progress ring filling with XP, pulsing if current
 * - Upcoming (0 XP): Gray outlined, dimmed
 */

import { CheckIcon } from '@heroicons/react/24/solid'
import { motion } from 'framer-motion'

/**
 * Circular progress ring rendered as SVG overlay.
 * size = circle diameter, progress = 0-1, isCurrent = pulsing ring
 */
const ProgressRing = ({ size, strokeWidth, progress, isCurrent }) => {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - progress)

  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0"
      style={{ transform: 'rotate(-90deg)' }}
    >
      <defs>
        <linearGradient id={`ring-grad-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-optio-purple)" />
          <stop offset="100%" stopColor="var(--color-optio-pink)" />
        </linearGradient>
      </defs>
      {/* White fill to hide connecting line behind node */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="white"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      {progress > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#ring-grad-${size})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      )}
    </svg>
  )
}

const QuestJourneyMap = ({ quests = [], onQuestClick }) => {
  if (quests.length === 0) return null

  const currentIndex = quests.findIndex(q => !q.progress?.is_completed)

  const getNodeState = (index) => {
    if (quests[index].progress?.is_completed) return 'completed'
    if (index === currentIndex) return 'current'
    return 'upcoming'
  }

  const getProgress = (quest) => {
    const earned = quest.progress?.earned_xp || 0
    const total = quest.progress?.total_xp || 0
    if (total === 0) return 0
    return Math.min(1, earned / total)
  }

  // Desktop node (40px)
  const DesktopNode = ({ quest, index, state }) => {
    const progress = getProgress(quest)

    if (state === 'completed') {
      return (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center shadow-md">
          <CheckIcon className="w-5 h-5 text-white" />
        </div>
      )
    }

    return (
      <div className="relative w-10 h-10">
        {state === 'current' && (
          <motion.div
            className="absolute -inset-1.5 rounded-full bg-optio-purple/15"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <ProgressRing size={40} strokeWidth={3} progress={progress} isCurrent={state === 'current'} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-sm font-bold ${
            state === 'current' ? 'text-optio-purple' : progress > 0 ? 'text-gray-600' : 'text-gray-400'
          }`}>
            {index + 1}
          </span>
        </div>
      </div>
    )
  }

  // Mobile node (32px)
  const MobileNode = ({ quest, index, state }) => {
    const progress = getProgress(quest)

    if (state === 'completed') {
      return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center shadow-sm">
          <CheckIcon className="w-4 h-4 text-white" />
        </div>
      )
    }

    return (
      <div className="relative w-8 h-8">
        {state === 'current' && (
          <motion.div
            className="absolute -inset-1 rounded-full bg-optio-purple/15"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <ProgressRing size={32} strokeWidth={2.5} progress={progress} isCurrent={state === 'current'} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xs font-bold ${
            state === 'current' ? 'text-optio-purple' : progress > 0 ? 'text-gray-600' : 'text-gray-400'
          }`}>
            {index + 1}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Horizontal layout (md+) */}
      <div className="hidden md:flex items-start relative px-5">
        {/* Connecting line behind nodes */}
        <div className="absolute top-5 left-10 right-10 h-0.5 flex">
          {quests.slice(0, -1).map((_, i) => {
            const state = getNodeState(i)
            return (
              <div
                key={i}
                className="flex-1 h-full"
                style={{
                  background:
                    state === 'completed'
                      ? 'linear-gradient(90deg, var(--color-optio-purple), var(--color-optio-pink))'
                      : '#d1d5db',
                }}
              />
            )
          })}
        </div>

        {/* Nodes */}
        {quests.map((quest, index) => {
          const state = getNodeState(index)
          const progress = getProgress(quest)

          return (
            <div
              key={quest.id}
              className="flex flex-col items-center relative z-10 cursor-pointer group"
              style={{ width: `${100 / quests.length}%` }}
              onClick={() => onQuestClick?.(quest)}
            >
              <DesktopNode quest={quest} index={index} state={state} />

              {/* Quest title */}
              <span
                className={`mt-2 text-xs text-center leading-tight max-w-[120px] group-hover:text-optio-purple transition-colors ${
                  state === 'completed'
                    ? 'text-gray-700 font-medium'
                    : state === 'current'
                      ? 'text-optio-purple font-semibold'
                      : progress > 0
                        ? 'text-gray-600'
                        : 'text-gray-400'
                }`}
                title={quest.title}
              >
                {quest.title}
              </span>

              {/* XP info for incomplete quests with progress */}
              {state !== 'completed' && quest.progress?.total_xp > 0 && (
                <span className="mt-0.5 text-[10px] text-gray-500">
                  {quest.progress.earned_xp || 0}/{quest.progress.total_xp} XP
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Vertical layout (mobile) */}
      <div className="md:hidden space-y-0">
        {quests.map((quest, index) => {
          const state = getNodeState(index)
          const progress = getProgress(quest)
          const isLast = index === quests.length - 1

          return (
            <div key={quest.id} className="flex items-stretch">
              {/* Node column with connecting lines */}
              <div className="flex flex-col items-center flex-shrink-0 w-10">
                <div className="relative flex-shrink-0">
                  <MobileNode quest={quest} index={index} state={state} />
                </div>

                {/* Connecting line below node */}
                {!isLast && (
                  <div
                    className="w-0.5 flex-1 min-h-[16px]"
                    style={{
                      background:
                        state === 'completed'
                          ? 'linear-gradient(180deg, var(--color-optio-purple), var(--color-optio-pink))'
                          : '#d1d5db',
                    }}
                  />
                )}
              </div>

              {/* Quest info */}
              <div
                className="ml-3 pb-4 min-w-0 cursor-pointer group"
                onClick={() => onQuestClick?.(quest)}
              >
                <span
                  className={`text-sm leading-tight group-hover:text-optio-purple transition-colors ${
                    state === 'completed'
                      ? 'text-gray-700 font-medium'
                      : state === 'current'
                        ? 'text-optio-purple font-semibold'
                        : progress > 0
                          ? 'text-gray-600'
                          : 'text-gray-400'
                  }`}
                >
                  {quest.title}
                </span>
                {state !== 'completed' && quest.progress?.total_xp > 0 && (
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {quest.progress.earned_xp || 0}/{quest.progress.total_xp} XP
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default QuestJourneyMap
