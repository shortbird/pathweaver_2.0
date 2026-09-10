/**
 * How a class due date reads to the student it belongs to.
 *
 * Three surfaces show the same date and have to say the same thing about it:
 * the quest card on the home page, the class card and quest rows on the class
 * page, and the Upcoming agenda. A card calling something "Due Sep 9" while the
 * class page calls it overdue is the kind of disagreement a student brings to a
 * teacher.
 *
 * Everything is in the viewer's own timezone on purpose. `class_quests.due_date`
 * is a timestamptz that a teacher set from their own clock, so rendering it
 * anywhere else moves the deadline.
 */

const DAY_MS = 86400000

/** Local midnight for a Date, so "days away" counts calendar days, not hours. */
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * @param {string|null|undefined} dueDate ISO timestamp from class_quests.due_date
 * @param {Date} [now] injectable for tests
 * @returns {null|{overdue: boolean, dueToday: boolean, dueSoon: boolean, daysAway: number, label: string, shortLabel: string}}
 *   null when there is no due date, which is the common case for a quest the
 *   student picked themselves.
 */
export function dueStatus(dueDate, now = new Date()) {
  if (!dueDate) return null
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return null

  const daysAway = Math.round((startOfDay(due) - startOfDay(now)) / DAY_MS)
  const overdue = due.getTime() < now.getTime()
  const dueToday = daysAway === 0
  const dateLabel = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  let label
  if (overdue && daysAway === 0) label = 'Due today'
  else if (overdue && daysAway === -1) label = 'Was due yesterday'
  else if (overdue) label = `Overdue · ${dateLabel}`
  else if (dueToday) label = 'Due today'
  else if (daysAway === 1) label = 'Due tomorrow'
  else label = `Due ${dateLabel}`

  return {
    overdue,
    dueToday,
    dueSoon: !overdue && daysAway >= 0 && daysAway <= 2,
    daysAway,
    label,
    shortLabel: overdue ? `Overdue · ${dateLabel}` : `Due ${dateLabel}`,
  }
}

/** Tailwind classes for a due chip on a light background. */
export function dueChipClasses(status) {
  if (!status) return ''
  if (status.overdue) return 'bg-red-100 text-red-700'
  if (status.dueSoon) return 'bg-amber-100 text-amber-800'
  return 'bg-gray-100 text-gray-700'
}

/** Tailwind classes for a due chip sitting on a dark image overlay. */
export function dueChipOverlayClasses(status) {
  if (!status) return ''
  if (status.overdue) return 'bg-red-500 text-white'
  if (status.dueSoon) return 'bg-amber-400 text-amber-950'
  return 'bg-white/90 text-gray-800'
}
