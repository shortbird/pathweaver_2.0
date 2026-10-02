import React, { useState } from 'react'
import { array, arrayOf, func, number, shape, string } from 'prop-types'
import { Link } from 'react-router-dom'
import { ChevronDownIcon, ChevronRightIcon, MapIcon } from '@heroicons/react/24/outline'
import CreditMoveMenu from './CreditMoveMenu'

/**
 * A quest that earned approved credit in this subject (Courses and Credits).
 *
 * Quests cross subjects, and this row is where a family sees it: the same
 * quest appears under every subject it earned credit in, each naming the
 * others it also counted toward. The tasks behind this subject's share open
 * inline. Only approved tasks are counted -- the backend lists a quest once
 * Optio has approved one of its tasks (courses_and_credits_service
 * ._quests_by_subject).
 *
 * Amounts are XP, not credits: one task is often a hundredth of a credit,
 * which rounds to nothing, and XP is what the student sees on each task.
 *
 * The menu asks Optio to move this subject's share to another subject
 * (2026-10-02). It shows only where the page passes `onMoveCredit`.
 */
const QuestCreditRow = ({ quest, onOpenQuest, onMoveCredit, pendingMove, studentId, onChanged }) => {
  const [open, setOpen] = useState(false)
  const taskCount = quest.tasks.length
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon

  return (
    <li className="border border-gray-100 bg-gray-50/60 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/quests/${quest.quest_id}`}
            onClick={onOpenQuest}
            className="text-sm font-semibold text-gray-900 hover:text-optio-purple truncate flex items-center gap-1.5"
          >
            <MapIcon className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{quest.title}</span>
          </Link>
          <p className="text-xs text-gray-500 mt-0.5">Quest</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-semibold text-gray-700">{quest.xp} XP here</span>
          {onMoveCredit && (
            <CreditMoveMenu
              title={quest.title}
              pendingRequest={pendingMove}
              studentId={studentId}
              onMove={onMoveCredit}
              onChanged={onChanged}
            />
          )}
        </div>
      </div>

      {quest.also_counted_toward.length > 0 && (
        <p className="text-xs text-gray-600 mt-2">
          Also counted toward{' '}
          {quest.also_counted_toward.map((s, i) => (
            <span key={s.key}>
              {i > 0 && ', '}
              {s.name} <span className="text-gray-500">({s.xp} XP)</span>
            </span>
          ))}
        </p>
      )}

      {taskCount > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-optio-purple hover:underline"
          >
            <Chevron className="w-3.5 h-3.5" aria-hidden="true" />
            {taskCount} approved task{taskCount === 1 ? '' : 's'}
          </button>
          {open && (
            <ul className="mt-2 space-y-1 border-l-2 border-gray-200 pl-3">
              {quest.tasks.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-gray-800">{t.title}</span>
                  <span className="text-gray-500 flex-shrink-0">{t.xp} XP</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  )
}

QuestCreditRow.propTypes = {
  quest: shape({
    quest_id: string.isRequired,
    title: string.isRequired,
    xp: number.isRequired,
    also_counted_toward: arrayOf(shape({ key: string, name: string, xp: number })).isRequired,
    tasks: array.isRequired,
  }).isRequired,
  onOpenQuest: func,
  onMoveCredit: func,
  pendingMove: shape({ id: string.isRequired, to_subject_name: string }),
  studentId: string,
  onChanged: func,
}

export default QuestCreditRow
