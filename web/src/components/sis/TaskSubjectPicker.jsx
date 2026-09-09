import React from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import {
  DIPLOMA_SUBJECTS,
  SUBJECT_LABEL,
  defaultSubjectForPillar,
  evenSplit
} from '../../constants/diplomaSubjects'

/**
 * Which diploma subjects one preset task earns credit toward, and how its XP
 * divides between them.
 *
 * Gryffin, 2026-09-09: "when I am putting in an assignment I can only choose
 * one [category]. If they are writing and talking about multiple subjects how
 * do we give them credit for multiple subjects?" There was no subject control
 * on this screen at all -- only a pillar -- so every task a school typed in
 * kept the column default of Electives. A whole US History unit, a Latin unit
 * and an Earth Science unit were filed as electives, and 1041 XP of one
 * student's pending credit with them.
 *
 * A task, not a quest, is what carries credit, which is what lets one quest
 * count for several subjects at once. This control is per task for that reason.
 *
 * Adding or removing a subject re-splits the XP evenly, and the hint says so.
 * The alternative -- giving a newly added subject nothing until the teacher
 * types a number -- looks identical on screen to a subject that is earning
 * credit, and the backend drops a zero share.
 */
export default function TaskSubjectPicker({
  subjects,
  distribution,
  xpValue,
  pillar,
  onChange,
  label = 'Counts toward credit',
  idPrefix = 'task'
}) {
  const xp = Math.max(0, Number(xpValue) || 0)
  // An existing task written before this control shipped has no subjects of its
  // own. Showing the pillar's default rather than an empty control means the
  // teacher sees the credit the task is actually about to earn.
  const chosen = (subjects || []).filter((s) => SUBJECT_LABEL[s])
  const effective = chosen.length ? chosen : [defaultSubjectForPillar(pillar)]
  const split = chosen.length && distribution && Object.keys(distribution).length
    ? distribution
    : evenSplit(effective, xp)

  const emit = (nextSubjects, nextSplit) =>
    onChange({ diploma_subjects: nextSubjects, subject_xp_distribution: nextSplit })

  const addSubject = (id) => {
    if (!id || effective.includes(id)) return
    const next = [...effective, id]
    emit(next, evenSplit(next, xp))
  }

  const removeSubject = (id) => {
    const next = effective.filter((s) => s !== id)
    // Never down to nothing: a task with no subject falls back to the column
    // default, which is the bug this control exists to fix.
    if (next.length === 0) return
    emit(next, evenSplit(next, xp))
  }

  const setSubjectXp = (id, value) => {
    const amount = value === '' ? 0 : Math.max(0, parseInt(value, 10) || 0)
    emit(effective, { ...split, [id]: amount })
  }

  const remaining = DIPLOMA_SUBJECTS.filter((s) => !effective.includes(s.id))
  const multiple = effective.length > 1
  const sum = effective.reduce((total, id) => total + (parseInt(split[id], 10) || 0), 0)

  return (
    <div className="w-full">
      <span className="block text-xs font-medium text-neutral-600 mb-1">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {effective.map((id) => (
          <span key={id}
            className="inline-flex items-center gap-1 rounded-full bg-optio-purple/10 pl-2.5 pr-1 py-0.5 text-xs text-optio-purple">
            {SUBJECT_LABEL[id]}
            {multiple && (
              <input type="number" min="0" step="5" value={split[id] ?? 0}
                onChange={(e) => setSubjectXp(id, e.target.value)}
                aria-label={`${SUBJECT_LABEL[id]} XP`}
                className="w-14 rounded border border-optio-purple/30 bg-white px-1 py-0.5 text-right text-[11px] text-neutral-700" />
            )}
            {effective.length > 1 && (
              <button type="button" onClick={() => removeSubject(id)}
                aria-label={`Remove ${SUBJECT_LABEL[id]}`}
                className="p-0.5 text-optio-purple/60 hover:text-red-500">
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
        ))}
        {remaining.length > 0 && (
          <select value="" onChange={(e) => addSubject(e.target.value)}
            aria-label={`${label} — add a subject`} id={`${idPrefix}-add-subject`}
            className="rounded-lg border border-dashed border-gray-300 px-2 py-1 text-xs text-neutral-600 bg-white hover:border-optio-purple">
            <option value="">+ Add subject</option>
            {remaining.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
      </div>
      {multiple && (
        <p className={`mt-1 text-[11px] ${sum === xp ? 'text-neutral-400' : 'text-amber-600'}`}>
          {sum === xp
            ? 'Adding or removing a subject splits the XP evenly. Adjust the numbers to change it.'
            : `These add up to ${sum} XP, and the task is worth ${xp}. Saving scales them to fit.`}
        </p>
      )}
    </div>
  )
}
