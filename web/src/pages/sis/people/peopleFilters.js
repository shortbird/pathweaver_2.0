/**
 * The one People table's filters, in pure functions so they can be tested
 * without a DOM and read without a component around them.
 *
 * Until 2026-09-16 the page was three tabs over three lists (Everyone, Staff,
 * Families), each with its own search box and its own idea of "hidden". A
 * teacher's invite state was on one tab, her family's payment answer on
 * another, and the table the office actually scanned had neither. Now every
 * row is a person, every person shows every role they hold, and the filters
 * are built from what is in the list: a school with no observers gets no
 * Observers chip, a school where nobody is on a registration hold gets no
 * Hold option.
 */
import { matchesPersonSearch } from '../../../utils/personSearch'
import { matchesPaymentFilter } from '../PaymentMethodPills'
import { statusLabel } from '../../../components/sis/ui/statusMaps'

export const STAFF_ROLES = ['org_admin', 'campus_coordinator', 'advisor']

// Chip order: the roles the office talks about most, first. Students,
// Parents and Teachers are always offered, so the bar reads the same in every
// school and on every filter; the rarer roles appear only when somebody
// holds one.
export const ROLE_CHIPS = [
  { key: 'student', label: 'Students', always: true },
  { key: 'parent', label: 'Parents', always: true },
  { key: 'advisor', label: 'Teachers', always: true },
  { key: 'campus_coordinator', label: 'Coordinators' },
  { key: 'org_admin', label: 'Admins' },
  { key: 'observer', label: 'Observers' },
]

// For sorting the Roles column: the most privileged role a person holds.
export const ROLE_ORDER = { org_admin: 0, campus_coordinator: 1, advisor: 2, parent: 3, student: 4, observer: 5 }

export const INACTIVE_STATUSES = ['withdrawn', 'graduated']

// "Recently" is the last week, which is the window a welcome is still a
// welcome in. Deliberately not "today": somebody who joined on Saturday should
// still be on the list when the office opens on Monday.
export const RECENT_DAYS = 7
export const isRecent = (d) => {
  if (!d) return false
  const t = new Date(d).getTime()
  return Number.isFinite(t) && Date.now() - t < RECENT_DAYS * 86400000
}

export const rolesOf = (r) => (r.roles?.length ? r.roles : [r.role]).filter(Boolean)
export const isStaff = (r) => rolesOf(r).some((x) => STAFF_ROLES.includes(x))

/**
 * Former: somebody the school is not running the day for any more. A
 * withdrawn or graduated student; a guardian whose every child has left
 * (the family record stays for billing and history, but "why are we keeping
 * families and their numbers if they aren't part of the school anymore?" --
 * iCreate, 2026-09-14); a staff member whose profile was archived.
 */
export const isFormer = (r) => {
  if (r.is_student && INACTIVE_STATUSES.includes(r.enrollment_status)) return true
  if (!r.is_student && r.household_id && r.household_former) return true
  if (r.archived) return true
  return false
}

/** The one status word a row carries, or null when there is nothing to say. */
export const statusOf = (r) => {
  if (r.archived) return 'archived'
  if (r.is_placeholder) return 'no_login'
  if (r.login_pending) return 'invite_pending'
  if (r.is_student) {
    const s = r.enrollment_status
    if (!s || s === 'unassigned') return 'not_enrolled'
    if (s === 'enrolled' || s === 'active') return null
    return s
  }
  return null
}

const STATUS_ORDER = ['applicant', 'not_enrolled', 'invite_pending', 'no_login', 'hold', 'withdrawn', 'graduated', 'archived']

const matchesStatus = (r, status) => {
  if (!status) return true
  if (status === 'hold') return Boolean(r.registration_hold)
  return statusOf(r) === status
}

const matchesRole = (r, role) => {
  if (!role) return true
  if (role === 'staff') return isStaff(r)
  return rolesOf(r).includes(role)
}

const matchesFamily = (r, family) => {
  if (!family) return true
  if (family === 'in') return Boolean(r.household_id)
  if (family === 'none') return !r.household_id && !isStaff(r)
  if (family === 'former') return Boolean(r.household_id && r.household_former)
  return true
}

const matchesSearch = (r, q) => {
  if (!q) return true
  if (matchesPersonSearch(r, q)) return true
  return [r.email, r.username, r.phone_number, r.household_name]
    .some((v) => (v || '').toLowerCase().includes(q))
}

export const EMPTY_FILTERS = {
  q: '', role: '', status: '', family: '', pay: '', recent: false, showFormer: false,
}

/**
 * The rows the table shows for a set of filters. "Hide former" is bypassed
 * when the status filter asks for a former kind on purpose: somebody who
 * picked Withdrawn wants to see the withdrawn.
 */
export const applyFilters = (rows, f) => {
  const q = (f.q || '').trim().toLowerCase()
  const askedForFormer = ['withdrawn', 'graduated', 'archived'].includes(f.status) || f.family === 'former'
  return rows.filter((r) => {
    if (!f.showFormer && !askedForFormer && isFormer(r)) return false
    if (!matchesRole(r, f.role)) return false
    if (!matchesStatus(r, f.status)) return false
    if (!matchesFamily(r, f.family)) return false
    if (!matchesPaymentFilter(r, f.pay)) return false
    if (f.recent && !isRecent(r.joined_at)) return false
    return matchesSearch(r, q)
  })
}

/**
 * How many people the Everyone chip stands for.
 *
 * The same base every role chip counts from, so each chip promises the same
 * thing: click it, get that many rows. This used to be `rows.length` -- the
 * whole roster, before a single filter -- which made Everyone the one number
 * on the page that was not about what you were looking at. It read 361 for
 * iCreate while the table underneath showed 342, it did not move when you
 * typed in the search box, and an org admin sat down and added up the role
 * chips to check (2026-09-22).
 *
 * The role chips can still sum to MORE than this, and that is not an error:
 * somebody who teaches and also has a child here holds two roles and belongs
 * under both. Eleven people at iCreate do.
 */
export const everyoneCount = (rows, f) => applyFilters(rows, { ...f, role: '' }).length

/** Role chips with counts. The main three are always there; the rarer roles
 *  only when somebody holds one. Counts respect every other filter, so the
 *  numbers answer "of these". */
export const roleChipOptions = (rows, f) => {
  const base = applyFilters(rows, { ...f, role: '' })
  return ROLE_CHIPS
    .map((c) => ({ ...c, count: base.filter((r) => rolesOf(r).includes(c.key)).length }))
    .filter((c) => c.always || c.count > 0 || c.key === f.role)
}

/** Status options with counts, only the statuses somebody in the list has. */
export const statusOptions = (rows, f) => {
  const base = applyFilters(rows, { ...f, status: '', showFormer: true })
  const counts = {}
  base.forEach((r) => {
    const s = statusOf(r)
    if (s) counts[s] = (counts[s] || 0) + 1
    if (r.registration_hold) counts.hold = (counts.hold || 0) + 1
  })
  return STATUS_ORDER
    .filter((s) => counts[s] || s === f.status)
    .map((s) => ({ key: s, label: statusLabel('person', s), count: counts[s] || 0 }))
}

/** Family options with counts. "Not in a family" counts students and parents
 *  only: a teacher with no family is not a problem to fix. */
export const familyOptions = (rows, f) => {
  const base = applyFilters(rows, { ...f, family: '' })
  const inFamily = base.filter((r) => r.household_id).length
  const none = base.filter((r) => !r.household_id && !isStaff(r)).length
  const former = applyFilters(rows, { ...f, family: '', showFormer: true })
    .filter((r) => r.household_id && r.household_former).length
  return [
    { key: 'in', label: 'In a family', count: inFamily },
    { key: 'none', label: 'Not in a family', count: none },
    { key: 'former', label: 'Former family', count: former },
  ].filter((o) => o.count > 0 || o.key === f.family)
}

export const sortRows = (rows, sort) => {
  const dir = sort.dir === 'asc' ? 1 : -1
  const name = (r) => (r.name || '').toLowerCase()
  return [...rows].sort((a, b) => {
    let cmp
    switch (sort.key) {
      case 'family':
        cmp = (a.household_name || '').toLowerCase().localeCompare((b.household_name || '').toLowerCase()); break
      case 'last':
        cmp = (a.last_name || '').toLowerCase().localeCompare((b.last_name || '').toLowerCase()); break
      case 'age': {
        // People without an age sort last regardless of direction, by name.
        const av = a.age == null ? Infinity : a.age
        const bv = b.age == null ? Infinity : b.age
        if (av === Infinity && bv === Infinity) return name(a).localeCompare(name(b))
        cmp = av === Infinity ? 1 * dir : bv === Infinity ? -1 * dir : av - bv
        break
      }
      case 'last_active':
        cmp = new Date(a.last_active || 0) - new Date(b.last_active || 0); break
      case 'joined_at':
        cmp = new Date(a.joined_at || 0) - new Date(b.joined_at || 0); break
      case 'role': {
        const top = (r) => Math.min(...rolesOf(r).map((x) => ROLE_ORDER[x] ?? 9), 9)
        cmp = top(a) - top(b); break
      }
      default:
        cmp = name(a).localeCompare(name(b))
    }
    if (cmp === 0) cmp = name(a).localeCompare(name(b))
    return cmp * dir
  })
}

/**
 * A roster row in the shape the staff record reads (the staff endpoint's):
 * `id` for `student_id`, only the staff roles, `created_at` for `joined_at`.
 */
export const asStaffRow = (r) => ({
  ...r,
  id: r.student_id,
  roles: rolesOf(r).filter((x) => STAFF_ROLES.includes(x)),
  created_at: r.joined_at,
})
