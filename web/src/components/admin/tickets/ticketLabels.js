/**
 * Display vocabulary for the ticket tracker. The values are the backend's
 * (routes/bug_reports.py ALLOWED_*); only the labels and colours live here.
 */
export const STATUS_LABELS = {
  new: 'New',
  triaged: 'Triaged',
  fixing: 'In progress',
  resolved: 'Resolved',
  wont_fix: 'Declined',
}

export const STATUS_CLASSES = {
  new: 'bg-optio-purple/10 text-optio-purple',
  triaged: 'bg-amber-50 text-amber-700',
  fixing: 'bg-optio-pink/10 text-optio-pink-dark',
  resolved: 'bg-green-50 text-green-700',
  wont_fix: 'bg-gray-100 text-gray-600',
}

export const TYPE_LABELS = {
  bug: 'Bug',
  feature: 'Feature',
  question: 'Question',
  tweak: 'Tweak',
}

export const PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

export const PRIORITY_CLASSES = {
  low: 'text-gray-500',
  normal: 'text-gray-700',
  high: 'text-amber-700 font-semibold',
  urgent: 'text-red-700 font-semibold',
}

export const SOURCE_LABELS = {
  mobile: 'Mobile app',
  web: 'Web reporter',
  perch: 'Imported from Perch',
  hq: 'Filed by hand',
  sentry: 'Sentry alert',
}

export const formatWhen = (iso) => {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// The list shows the day and the time on two lines so the column stays narrow.
export const formatDay = (iso) => {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const formatClock = (iso) => {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// Who filed it: the account's name when the row has one, else the email a
// Perch import or a hand-filed ticket carries, else "unknown". A Sentry
// ticket has no reporter; its user_email is whoever hit the error, and the
// detail view shows that under the name, not as the name.
export const reporterName = (ticket) => {
  if (ticket.source === 'sentry') return 'Sentry'
  const u = ticket.users
  const full = u ? [u.first_name, u.last_name].filter(Boolean).join(' ').trim() : ''
  return full || u?.display_name || ticket.user_email || 'unknown'
}
