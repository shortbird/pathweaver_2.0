/**
 * A guardian's class chats, split by which child each one is about.
 *
 * Port of mobile/src/utils/groupsByChild.ts — the web Messages list has the
 * same problem and the same backend fields to fix it with. Keep the two in
 * step; the tests either side are deliberately the same cases.
 *
 * Messages renders every group chat in one list ordered by recency and
 * labelled with nothing but the class name. That is fine for a teacher and
 * unusable for a parent of several children: an iCreate parent of three sat in
 * 37 "<Class> Parent Chat" rows, and several of those rows carried the SAME
 * name, because two of her children take the same course in different sections
 * ("Elementary Microschool (Wednesday) Parent Chat" appeared three times, once
 * per child; "Peak Play PE Parent Chat" three times for one child, in three
 * different sections). Her report, 2026-09-09: "I do not know which message
 * applies to which one of my children/which classes, so I would have to look
 * it up before I can even respond."
 *
 * Two things fix that, and both need the per-group data the backend now sends
 * (`for_students`, `class_meeting` — see GroupMessageService._guardian_class_context):
 *
 *   1. Section the list by child, so a row's child is the header above it.
 *   2. Show when the class meets, which is the only thing that separates two
 *      chats sharing a name.
 *
 * Sectioning only kicks in at two or more children. One child needs no header
 * telling them whose classes these are.
 */

import { to12h } from './timeFormat'

// Short day names, as classLabel.js already uses on every other class label in
// the web app — a list row has no space for "Wednesday".
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const studentName = (s) => {
  if (!s) return ''
  return (s.first_name || s.display_name || '').trim()
}

// "Tue 9:30 AM" — short enough for a list-row chip. Empty when the class has
// no usable recurring meeting (a dated one-off, or nothing recorded).
export const classMeetingLabel = (m) => {
  if (!m) return ''
  const day = m.day_of_week === null || m.day_of_week === undefined ? '' : (DAYS[m.day_of_week] || '')
  return [day, to12h(m.start_time)].filter(Boolean).join(' ')
}

// True for a class chat that the backend attributed to at least one of the
// caller's children. The section split is built out of exactly these.
export const isChildClassGroup = (g) => !!(g && (g.for_students || []).length)

/**
 * Split `groups` into one section per child, newest-first order preserved
 * within each section (the server already orders by last_message_at).
 *
 * A class both children take appears under BOTH of their sections — the same
 * conversation, reachable wherever the parent looks for it. The row carries the
 * names of every child it covers so a reply is never sent under the wrong
 * assumption about who it is about.
 */
export const groupsByChild = (groups = []) => {
  const list = groups || []
  const names = new Map()
  for (const g of list) {
    for (const s of g.for_students || []) {
      if (s?.id && !names.has(s.id)) names.set(s.id, studentName(s) || 'Student')
    }
  }

  if (names.size < 2) {
    return { sections: [{ key: 'all', label: null, groups: list }], sectioned: false }
  }

  const childIds = [...names.keys()].sort(
    (a, b) => names.get(a).localeCompare(names.get(b)) || a.localeCompare(b)
  )

  const sections = childIds.map((id) => ({
    key: id,
    label: `${names.get(id)}'s classes`,
    groups: list.filter((g) => (g.for_students || []).some((s) => s?.id === id))
  }))

  // Anything not tied to a child — a school-wide announcement group, a chat an
  // admin added the parent to — keeps a home at the bottom rather than
  // vanishing from a list that is now organized around children.
  const other = list.filter((g) => !isChildClassGroup(g))
  if (other.length) {
    sections.push({ key: 'other', label: 'Other groups', groups: other })
  }

  return { sections: sections.filter((s) => s.groups.length > 0), sectioned: true }
}
