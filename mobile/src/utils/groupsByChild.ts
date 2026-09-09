/**
 * A guardian's class chats, split by which child each one is about.
 *
 * The Messages list renders every group chat in one flat "Groups" section,
 * ordered by recency and labelled with nothing but the class name. That is fine
 * for a teacher and unusable for a parent of several children: an iCreate
 * parent of three sat in 37 "<Class> Parent Chat" rows, and several of those
 * rows carried the SAME name, because two of her children take the same course
 * in different sections ("Elementary Microschool (Wednesday) Parent Chat"
 * appeared three times, once per child; "Peak Play PE Parent Chat" three times
 * for one child, in three different sections). Her report, 2026-09-09: "I do
 * not know which message applies to which one of my children/which classes, so
 * I would have to look it up before I can even respond."
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

import { dayName, formatTime } from '@/src/hooks/useClassSchedule';
import type { Group, GroupClassMeeting, GroupStudent } from '@/src/hooks/useMessages';

export interface GroupSection {
  /** Child id, or 'other' for groups that are not about a child. */
  key: string;
  /** Section header text, or null for the unsectioned single-child case. */
  label: string | null;
  groups: Group[];
  /** Unread messages across the section, so a COLLAPSED section can still say
   *  it has mail. Without it, folding a child away would hide new messages
   *  behind a closed header — a worse bug than the one the sections fixed. */
  unread: number;
}

export interface GroupSections {
  sections: GroupSection[];
  /** True when the list is actually split by child (two or more children). */
  sectioned: boolean;
}

export function studentName(s: GroupStudent | undefined | null): string {
  if (!s) return '';
  return (s.first_name || s.display_name || '').trim();
}

/** "Tue 9:30 AM" — short enough for a list-row chip. Empty when the class has
 *  no usable recurring meeting (a dated one-off, or nothing recorded). */
export function classMeetingLabel(m: GroupClassMeeting | null | undefined): string {
  if (!m) return '';
  const day = dayName(m.day_of_week ?? null);
  const time = formatTime(m.start_time);
  const shortDay = day ? day.slice(0, 3) : '';
  return [shortDay, time].filter(Boolean).join(' ');
}

const sectionUnread = (groups: Group[]) =>
  groups.reduce((n, g) => n + (g.unread_count || 0), 0);

/**
 * Split `groups` into one section per child, newest-first order preserved
 * within each section (the server already orders by last_message_at).
 *
 * A class both children take appears under BOTH of their sections — the same
 * conversation, reachable wherever the parent looks for it. The row carries a
 * chip naming every child it covers so a reply is never sent under the wrong
 * assumption about who it is about.
 */
export function groupsByChild(groups: Group[] = []): GroupSections {
  const names = new Map<string, string>();
  for (const g of groups) {
    for (const s of g.for_students || []) {
      if (s?.id && !names.has(s.id)) names.set(s.id, studentName(s) || 'Student');
    }
  }

  if (names.size < 2) {
    return {
      sections: [{ key: 'all', label: null, groups, unread: sectionUnread(groups) }],
      sectioned: false,
    };
  }

  const childIds = [...names.keys()].sort((a, b) =>
    names.get(a)!.localeCompare(names.get(b)!) || a.localeCompare(b));

  const sections: GroupSection[] = childIds.map((id) => {
    const mine = groups.filter((g) => (g.for_students || []).some((s) => s?.id === id));
    return {
      key: id,
      label: `${names.get(id)}'s classes`,
      groups: mine,
      unread: sectionUnread(mine),
    };
  });

  // Anything not tied to a child — a school-wide announcement group, a chat an
  // admin added the parent to — keeps a home at the bottom rather than
  // vanishing from a list that is now organized around children.
  const other = groups.filter((g) => !(g.for_students || []).length);
  if (other.length) {
    sections.push({
      key: 'other', label: 'Other groups', groups: other, unread: sectionUnread(other),
    });
  }

  return { sections: sections.filter((s) => s.groups.length > 0), sectioned: true };
}
