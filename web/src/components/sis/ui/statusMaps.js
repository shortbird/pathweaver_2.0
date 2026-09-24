/**
 * Every SIS status vocabulary, as data: domain -> status -> { label, tone }.
 *
 * Fourteen pages used to carry their own map from a status word to a pill
 * colour -- STATUS_STYLES five times, ATT_COLORS twice verbatim, ITEM_BADGE
 * copied into a second file and drifted by one token
 * (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, F6). Two queues could show the
 * same word in two colours, and a new status meant a new map. The vocabularies
 * live here and <StatusPill domain status /> renders them; a page that needs a
 * raw class (a button's selected state) asks statusTone().
 *
 * `tone` is the soft pill (the default rendering); `solid` is the filled
 * variant the attendance mark buttons use for the chosen mark. Labels are the
 * words the office reads; a status with no entry renders humanised
 * ("under_review" -> "Under review") in the neutral tone, so an unknown value
 * is visible rather than invisible.
 */

const NEUTRAL = 'bg-gray-100 text-neutral-600'

export const STATUS_MAPS = {
  /** Prior-learning records (PriorLearningPage). */
  prior_learning: {
    submitted: { label: 'Submitted', tone: 'bg-blue-100 text-blue-700' },
    under_review: { label: 'Under review', tone: 'bg-amber-100 text-amber-800' },
    accepted: { label: 'Accepted', tone: 'bg-green-100 text-green-700' },
    rejected: { label: 'Rejected', tone: 'bg-red-100 text-red-700' },
  },
  /** An attendance mark: the day summary pill (tone) and the roster's mark
   *  buttons (solid) -- AttendancePage, TeacherClassPage, StudentDayModal. */
  attendance: {
    present: { label: 'Present', tone: 'bg-green-100 text-green-700', solid: 'bg-green-600 text-white' },
    absent: { label: 'Absent', tone: 'bg-red-100 text-red-700', solid: 'bg-red-600 text-white' },
    late: { label: 'Late', tone: 'bg-amber-100 text-amber-700', solid: 'bg-amber-500 text-white' },
    excused: { label: 'Excused', tone: 'bg-blue-100 text-blue-700', solid: 'bg-blue-600 text-white' },
  },
  /** Family goals (GoalsReviewPage). */
  goal: {
    submitted: { label: 'Submitted', tone: 'bg-optio-purple/10 text-optio-purple' },
    draft: { label: 'Draft', tone: NEUTRAL },
    reviewed: { label: 'Reviewed', tone: 'bg-green-100 text-green-700' },
  },
  /** A task, on anybody's list (TaskCard) and on the office's Assigned cards. */
  task: {
    todo: { label: 'To do', tone: 'bg-optio-purple/10 text-optio-purple' },
    in_progress: { label: 'In progress', tone: 'bg-amber-100 text-amber-700' },
    waiting_on_admin: { label: 'With the office', tone: 'bg-blue-100 text-blue-700' },
    done: { label: 'Done', tone: 'bg-green-100 text-green-700' },
    // A recurring task nobody finished on its day.
    expired: { label: 'Expired', tone: NEUTRAL },
  },
  /** One step of a task (TaskCard, the Assigned view). */
  checklist_item: {
    pending: { label: 'Pending', tone: NEUTRAL },
    complete: { label: 'Complete', tone: 'bg-blue-100 text-blue-700' },
    approved: { label: 'Approved', tone: 'bg-green-100 text-green-700' },
    rejected: { label: 'Rejected', tone: 'bg-red-100 text-red-700' },
  },

  /** What an invoice is for (BillingPage). */
  invoice_kind: {
    tuition: { label: 'Tuition', tone: 'bg-indigo-100 text-indigo-700' },
    supply: { label: 'Supplies', tone: 'bg-teal-100 text-teal-700' },
    registration: { label: 'Registration', tone: 'bg-amber-100 text-amber-700' },
    fee: { label: 'Fee', tone: 'bg-neutral-100 text-neutral-600' },
    other: { label: 'Other', tone: 'bg-neutral-100 text-neutral-600' },
    unclassified: { label: 'Unclassified', tone: 'bg-neutral-100 text-neutral-500' },
  },
  /** A person's standing at the school (the People table and its filters). */
  person: {
    applicant: { label: 'Applicant', tone: 'bg-sky-50 text-sky-700' },
    not_enrolled: { label: 'Not enrolled', tone: 'bg-gray-100 text-neutral-500' },
    withdrawn: { label: 'Withdrawn', tone: 'bg-gray-100 text-neutral-500' },
    graduated: { label: 'Graduated', tone: 'bg-gray-100 text-neutral-500' },
    invite_pending: { label: 'Invite pending', tone: 'bg-blue-100 text-blue-800' },
    no_login: { label: 'No login yet', tone: 'bg-amber-100 text-amber-800' },
    archived: { label: 'Archived', tone: 'bg-gray-100 text-neutral-500' },
    hold: { label: 'Registration hold', tone: 'bg-amber-100 text-amber-800' },
  },
}

const humanise = (status) => {
  const s = String(status || '').replace(/_/g, ' ')
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

/** The map entry for a status, or a neutral humanised fallback. */
export const statusMeta = (domain, status) => {
  const map = STATUS_MAPS[domain]
  if (!map) throw new Error(`statusMaps: no domain "${domain}"`)
  return map[status] || { label: humanise(status), tone: NEUTRAL }
}

export const statusLabel = (domain, status) => statusMeta(domain, status).label
export const statusTone = (domain, status, variant = 'tone') =>
  statusMeta(domain, status)[variant] || statusMeta(domain, status).tone
