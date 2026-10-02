import React from 'react'
import { array, arrayOf, func, node, number, object, shape, string } from 'prop-types'
import { Link } from 'react-router-dom'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import { PlusIcon } from '@heroicons/react/24/outline'
import { formatCredits } from '../../utils/creditRequirements'
import QuestCreditRow from './QuestCreditRow'
import CreditProgressBar from './CreditProgressBar'
import CreditMoveMenu from './CreditMoveMenu'
import { creditsToXp, xpLabel, xpWithCredits } from './xpLabels'

const STATUS_PILL = {
  complete: { label: 'Complete', style: 'bg-green-100 text-green-800' },
  in_review: { label: 'In review', style: 'bg-yellow-100 text-yellow-800' },
  needs_more: { label: 'Needs more', style: 'bg-amber-100 text-amber-800' },
  in_progress: { label: 'In progress', style: 'bg-gray-100 text-gray-700' },
}

const StatusPill = ({ status }) => {
  const meta = STATUS_PILL[status] || STATUS_PILL.in_progress
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded flex-shrink-0 ${meta.style}`}>{meta.label}</span>
  )
}
StatusPill.propTypes = { status: string }

// A course's size is in diploma units, so it keeps its credits -- after the
// XP it stands for.
const creditLabel = (credits) => xpWithCredits(creditsToXp(credits))

/** One check-in's control: a button while there is something for the parent
 *  to do, a quiet label while it is Optio's turn or finished. */
const CheckInControl = ({ checkIn, onOpen }) => {
  if (checkIn.state === 'approved') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
        <CheckCircleIcon className="w-4 h-4" aria-hidden="true" />
        {checkIn.title} approved
      </span>
    )
  }
  if (checkIn.state === 'in_review') {
    return <span className="text-xs font-medium text-yellow-800">{checkIn.title} in review</span>
  }
  const label = {
    open: `Send ${checkIn.title.toLowerCase()}`,
    not_sent: `Finish sending ${checkIn.title.toLowerCase()}`,
    needs_more: `Add more to ${checkIn.title.toLowerCase()}`,
  }[checkIn.state] || `Send ${checkIn.title.toLowerCase()}`
  return (
    <button
      type="button"
      onClick={onOpen}
      className={checkIn.state === 'needs_more' ? 'btn-quiet border-amber-300 text-amber-800' : 'btn-quiet'}
    >
      {label}
    </button>
  )
}
CheckInControl.propTypes = {
  checkIn: shape({ title: string, state: string }).isRequired,
  onOpen: func.isRequired,
}

// The quest page's Back button returns here rather than to the dashboard.
// Keyed to the quest so a leftover entry never redirects Back on another one.
const rememberReturn = (questId) => () => {
  try {
    sessionStorage.setItem('questReturnTo', JSON.stringify({ questId, path: '/courses-and-credits' }))
  } catch {
    // Storage blocked: Back falls through to its default.
  }
}

const CourseRow = ({ course, onOpenCheckIn, moveMenu }) => {
  if (course.kind === 'own') {
    return (
      <li className="border border-gray-100 bg-gray-50/60 rounded-lg p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={`/quests/${course.quest_id}`}
              onClick={rememberReturn(course.quest_id)}
              className="text-sm font-semibold text-gray-900 hover:text-optio-purple truncate block"
            >
              {course.title}
            </Link>
            <p className="text-xs text-gray-500 mt-0.5">
              Own curriculum, {course.length_label?.toLowerCase()}, {creditLabel(course.credits)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusPill status={course.status} />
            {moveMenu}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {course.check_ins.map((c) => (
            <CheckInControl key={c.task_id} checkIn={c} onOpen={() => onOpenCheckIn(course, c)} />
          ))}
        </div>
        {/* The course is a quest: tasks are optional, and each one can earn
            more credit in this subject from the quest page. "Extra
            credit" reads as a school bonus, which is not what this is. */}
        <p className="text-xs text-gray-500 mt-3">
          {course.added_tasks > 0
            ? `${course.added_tasks} task${course.added_tasks === 1 ? '' : 's'} added${
              course.added_tasks_approved ? `, ${course.added_tasks_approved} approved for credit` : ''}. `
            : ''}
          <Link to={`/quests/${course.quest_id}`} onClick={rememberReturn(course.quest_id)} className="inline-flex items-center gap-1 font-medium text-optio-purple hover:underline">
            {course.added_tasks > 0 ? 'Open' : (
              <>
                <PlusIcon className="w-3.5 h-3.5" aria-hidden="true" />
                Add tasks for more XP
              </>
            )}
          </Link>
        </p>
      </li>
    )
  }

  if (course.kind === 'class') {
    const percent = Math.min(100, Math.round(((course.progress_xp || 0) / (course.target_xp || 1000)) * 100))
    return (
      <li className="border border-gray-100 bg-gray-50/60 rounded-lg p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={`/quests/${course.quest_id}`}
              onClick={rememberReturn(course.quest_id)}
              className="text-sm font-semibold text-gray-900 hover:text-optio-purple truncate block"
            >
              {course.title}
            </Link>
            <p className="text-xs text-gray-500 mt-0.5">Optio class, {creditLabel(course.credits)}</p>
          </div>
          <StatusPill status={course.status} />
        </div>
        {course.status !== 'complete' && (
          <div className="mt-3">
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-primary rounded-full" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {course.progress_xp} of {course.target_xp} XP
            </p>
          </div>
        )}
      </li>
    )
  }

  return (
    <li className="border border-gray-100 bg-gray-50/60 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{course.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Transfer credit{course.school_name ? ` from ${course.school_name}` : ''}, {creditLabel(course.credits)}
          </p>
        </div>
        <StatusPill status="complete" />
      </div>
    </li>
  )
}
CourseRow.propTypes = {
  course: object.isRequired,
  onOpenCheckIn: func.isRequired,
  moveMenu: node,
}

/**
 * One diploma subject: how much of it is done, the courses in it, and the
 * button that adds another. `standing` is this subject's entry from
 * getCreditStanding, so the numbers agree with every other credit view.
 *
 * `onMoveCredit(target)` opens the move-to-another-subject request for a
 * quest row or an own-curriculum course; `moveRequests` are the ones already
 * waiting on Optio, which replace that row's menu with "Move requested".
 */
const SubjectCard = ({
  subject, standing, pendingXp, onAddCourse, onOpenCheckIn,
  onMoveCredit, moveRequests = [], studentId, onMoveChanged,
}) => {
  const from = { key: subject.key, name: subject.name }
  const pendingMoveFor = (questId) => moveRequests.find(
    (r) => r.quest_id === questId && r.from_subject === subject.key)
  const required = standing?.creditsRequired ?? 0
  const counted = standing?.creditsCounted ?? 0
  const done = !!standing?.isComplete
  const percent = standing?.progressPercentage ?? 0

  return (
    <section id={`subject-card-${subject.key}`} className="card p-5 scroll-mt-24" aria-labelledby={`subject-${subject.key}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`subject-${subject.key}`} className="text-base font-semibold text-gray-900 flex items-center gap-1.5">
            {subject.name}
            {done && <CheckCircleIcon className="w-5 h-5 text-green-600" aria-label="Requirement met" />}
          </h2>
          {subject.description && <p className="text-xs text-gray-500 mt-0.5">{subject.description}</p>}
        </div>
        {/* XP first; the credits are the diploma's requirement for it. */}
        <div className="text-right flex-shrink-0">
          <p className="text-sm text-gray-700">
            <span className="font-semibold text-gray-900">{creditsToXp(counted).toLocaleString()}</span>
            {' '}of {xpLabel(creditsToXp(required))}
          </p>
          <p className="text-xs text-gray-500">
            {formatCredits(counted)} of {formatCredits(required)} credit{required === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* XP waiting on review is the yellow part of the bar. */}
      <div className="mt-3">
        <CreditProgressBar
          earnedPercent={percent}
          pendingXp={pendingXp}
          requiredXp={creditsToXp(required)}
          fillClass={done ? 'bg-green-500' : 'bg-gradient-primary'}
        />
      </div>
      {standing?.overflowIn > 0 && (
        <p className="text-xs text-gray-500 mt-1">
          Includes {xpLabel(creditsToXp(standing.overflowIn))} carried over from other subjects
        </p>
      )}

      {subject.courses.length > 0 && (
        <ul className="mt-4 space-y-2">
          {subject.courses.map((course, i) => (
            <CourseRow
              key={course.quest_id || `${course.title}-${i}`}
              course={course}
              onOpenCheckIn={onOpenCheckIn}
              moveMenu={course.kind === 'own' && onMoveCredit ? (
                <CreditMoveMenu
                  title={course.title}
                  pendingRequest={pendingMoveFor(course.quest_id)}
                  studentId={studentId}
                  onMove={() => onMoveCredit({ kind: 'course', questId: course.quest_id, title: course.title, from })}
                  onChanged={onMoveChanged}
                />
              ) : null}
            />
          ))}
        </ul>
      )}

      {/* Quests with approved credit here. The same quest shows under each
          subject it counted toward -- the interdisciplinary picture. */}
      {subject.quests?.length > 0 && (
        <ul className={`${subject.courses.length > 0 ? 'mt-2' : 'mt-4'} space-y-2`} aria-label={`Quests that earned ${subject.name} credit`}>
          {subject.quests.map((quest) => (
            <QuestCreditRow
              key={quest.quest_id}
              quest={quest}
              onOpenQuest={rememberReturn(quest.quest_id)}
              onMoveCredit={onMoveCredit
                ? () => onMoveCredit({ kind: 'quest', questId: quest.quest_id, title: quest.title, xp: quest.xp, from })
                : undefined}
              pendingMove={pendingMoveFor(quest.quest_id)}
              studentId={studentId}
              onChanged={onMoveChanged}
            />
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          type="button"
          onClick={() => onAddCourse(subject)}
          className="inline-flex items-center gap-1 text-sm font-medium text-optio-purple hover:underline"
        >
          <PlusIcon className="w-4 h-4" aria-hidden="true" />
          Add a quest
        </button>
      </div>
    </section>
  )
}

SubjectCard.propTypes = {
  subject: shape({
    key: string.isRequired,
    name: string.isRequired,
    description: string,
    sources: object,
    courses: array.isRequired,
    quests: array,
  }).isRequired,
  standing: object,
  pendingXp: number,
  onAddCourse: func.isRequired,
  onOpenCheckIn: func.isRequired,
  onMoveCredit: func,
  moveRequests: arrayOf(shape({ id: string, quest_id: string, from_subject: string })),
  studentId: string,
  onMoveChanged: func,
}

export default SubjectCard
