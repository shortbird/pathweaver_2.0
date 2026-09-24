/**
 * Filters and sort for the Registration answers report.
 *
 * iCreate (Katrine Myers), ticket 50616794: "this would be the best spot to be
 * able to filter the families info by selection. So more questions might be,
 * sort families by age of children. Sort families by location, or form of
 * payment, or students who only come one day, etc."
 *
 * The report is one school's families (a few hundred rows at most) and the
 * server reads every one of them (paged past PostgREST's 1,000-row cap), so
 * filtering happens here, over the rows already loaded, without a refetch.
 *
 * Each row from /api/sis/reports/registration-answers carries:
 *   answer_values    the answer as a list (a multi-select is several values)
 *   city             the family's household city ('' when none on file)
 *   payment_methods  the family's OWN "Form of Payment" answer -- never the
 *                    staff-set funding source, which is a different field
 *   kids             [{name, age, days_per_week, days, unscheduled}]
 *
 * A family row covers every child in it; a per-student row covers one. Child
 * age and days per week are asked of each child, and both must hold for the
 * SAME child: "a 7-year-old who comes one day" is not satisfied by a family
 * with a 7-year-old who comes three days and a 12-year-old who comes one.
 */

export const NONE = '__none__'

export const EMPTY_ANSWER_FILTERS = {
  answer: '', city: '', payment: '', days: '', ageMin: '', ageMax: '',
}

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

const num = (v) => {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export const hasActiveFilters = (f) => Object.keys(EMPTY_ANSWER_FILTERS).some((k) => (f?.[k] ?? '') !== '')

const kidMatches = (kid, f) => {
  const lo = num(f.ageMin)
  const hi = num(f.ageMax)
  if (lo != null || hi != null) {
    if (kid.age == null) return false
    if (lo != null && kid.age < lo) return false
    if (hi != null && kid.age > hi) return false
  }
  if (f.days !== '' && f.days != null) {
    if ((kid.days_per_week ?? 0) !== Number(f.days)) return false
  }
  return true
}

/** The rows that pass every active filter, in their original order. */
export const filterAnswerRows = (rows, f = EMPTY_ANSWER_FILTERS) => (rows || []).filter((r) => {
  if (f.answer) {
    if (!(r.answer_values || []).some((v) => norm(v) === norm(f.answer))) return false
  }
  if (f.city) {
    const city = norm(r.city)
    if (f.city === NONE ? city !== '' : city !== norm(f.city)) return false
  }
  if (f.payment) {
    const methods = (r.payment_methods || []).map(norm)
    if (f.payment === NONE ? methods.length > 0 : !methods.includes(norm(f.payment))) return false
  }
  const kidFilter = num(f.ageMin) != null || num(f.ageMax) != null || (f.days !== '' && f.days != null)
  if (kidFilter && !(r.kids || []).some((k) => kidMatches(k, f))) return false
  return true
})

const distinct = (values) => {
  // First spelling seen wins, compared case- and space-insensitively.
  const seen = new Map()
  for (const v of values) {
    const s = String(v ?? '').trim()
    if (s && !seen.has(norm(s))) seen.set(norm(s), s)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/** What each filter can be set to, read off the loaded rows. */
export const answerFilterOptions = (rows) => {
  const list = rows || []
  const kids = list.flatMap((r) => r.kids || [])
  return {
    answers: distinct(list.flatMap((r) => r.answer_values || [])),
    cities: distinct(list.map((r) => r.city)),
    noCity: list.some((r) => !norm(r.city)),
    payments: distinct(list.flatMap((r) => r.payment_methods || [])),
    noPayment: list.some((r) => !(r.payment_methods || []).length),
    days: [...new Set(kids.map((k) => k.days_per_week ?? 0))].sort((a, b) => a - b),
    hasAges: kids.some((k) => k.age != null),
  }
}

// ── Table cells ───────────────────────────────────────────────────────────────

export const ANSWER_COLUMNS = ['Student', 'Family', 'Parent', 'Parent email', 'Answer', 'City',
  'Ages', 'Days per week', 'Form of payment', 'Status']

/** Youngest first, so the table's "Ages" sort (first number) is "youngest child". */
export const agesCell = (kids) => (kids || [])
  .map((k) => k.age).filter((a) => a != null).sort((a, b) => a - b).join(', ')

/** One child: the count. Several: "Ada: 1, Ben: 2", so no number is orphaned. */
export const daysCell = (kids) => {
  const list = kids || []
  const one = (k) => `${k.days_per_week ?? 0}${k.unscheduled ? ' + unscheduled class' : ''}`
  if (list.length <= 1) return list.length ? one(list[0]) : ''
  return list.map((k) => `${(k.name || '').split(' ')[0]}: ${one(k)}`).join(', ')
}

export const answerRowCells = (r) => [
  r.student, r.family, r.parent, r.parent_email, r.answer, r.city || '',
  agesCell(r.kids), daysCell(r.kids), (r.payment_methods || []).join('; '), r.status,
]

// Sort presets for the "Sort by" picker, as the table's own sort stack.
export const ANSWER_SORTS = [
  { key: 'family', label: 'Family name', col: ANSWER_COLUMNS.indexOf('Family') },
  { key: 'age', label: 'Child age (youngest first)', col: ANSWER_COLUMNS.indexOf('Ages') },
  { key: 'city', label: 'City', col: ANSWER_COLUMNS.indexOf('City') },
  { key: 'student', label: 'Student name', col: ANSWER_COLUMNS.indexOf('Student') },
]
