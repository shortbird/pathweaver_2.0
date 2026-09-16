/**
 * The Training page's copy: what each audience calls its people, and the
 * labels a quest's progress and XP get. Pure functions, no React -- split
 * out of StaffTrainingPage.jsx when training links pushed it to the
 * component-size cap (componentSize.test.js).
 */

export const progressLabel = (p) => {
  if (!p?.started) return 'Not started'
  if (p.completed) return 'Complete'
  if (!p.total) return 'In progress'
  return `${p.done} of ${p.total} tasks`
}

/** "150 of 300 XP" — only where a finish line has actually been set. */
export const xpLabel = (item) => {
  const needed = item?.xp_threshold || 0
  if (!needed) return null
  return `${item.my_progress?.earned_xp || 0} of ${needed} XP`
}

export const xpStyle = (item) => {
  const needed = item?.xp_threshold || 0
  const earned = item?.my_progress?.earned_xp || 0
  return earned >= needed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-neutral-600'
}

export const progressStyle = (p) => {
  if (!p?.started) return 'bg-gray-100 text-neutral-500'
  if (p.completed) return 'bg-green-100 text-green-700'
  return 'bg-amber-100 text-amber-800'
}

/** What each tab calls the people on it, in the few places copy needs it. */
export const AUDIENCE_WORDS = {
  // `joiners` is who arrives later, which is not always the plural of `one`:
  // people join a school as staff, not as "people".
  staff: { one: 'person', many: 'people', joiners: 'staff',
    quests: 'training quests', add: 'Add training' },
  family: { one: 'family', many: 'families', joiners: 'families',
    quests: 'family quests', add: 'Add a family quest' },
  student: { one: 'student', many: 'students', joiners: 'students',
    quests: 'student quests', add: 'Add a student quest' },
}
export const words = (audience) => AUDIENCE_WORDS[audience] || AUDIENCE_WORDS.staff

export const people = (n, audience) => {
  const { one, many } = words(audience)
  return `${n} ${n === 1 ? one : many}`
}

/**
 * "1 family's account", "2 families' accounts", "3 people's accounts".
 *
 * The possessive cannot be tacked onto the plural: "families" already ends in
 * s and takes a bare apostrophe, while "people" does not and takes 's. Gluing
 * "'s" on regardless produced "2 families's accounts".
 */
export const accountsOf = (n, audience) => {
  const { one, many } = words(audience)
  if (n === 1) return `${n} ${one}'s account`
  return `${n} ${many}${many.endsWith('s') ? "'" : "'s"} accounts`
}

/** "Added to training. Now on 22 people's accounts." */
export const assignedMessage = (assigned, audience, base) => {
  if (!assigned) return base
  const { enrolled = 0, already = 0 } = assigned
  const total = enrolled + already
  if (!total) return `${base} Nobody to assign it to yet.`
  if (!enrolled) return `${base} ${people(already, audience)} already had it.`
  return `${base} Now on ${accountsOf(enrolled, audience)}${already ? `, ${already} already had it` : ''}.`
}
