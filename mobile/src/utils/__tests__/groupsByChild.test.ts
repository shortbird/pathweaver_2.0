/**
 * The shapes here are taken from the report that prompted the split: a parent
 * of three (Zayah, Daxton, Rivers) with 37 class chats, three of which shared
 * the name "Elementary Microschool (Wednesday) Parent Chat" and three more the
 * name "Peak Play PE Parent Chat".
 */
import { groupsByChild, classMeetingLabel, studentName } from '../groupsByChild';
import type { Group } from '@/src/hooks/useMessages';

const kid = (id: string, first_name: string) => ({ id, first_name, last_name: 'T', display_name: first_name });

const grp = (
  id: string, name: string, students: any[] = [], meeting: any = null, unread_count = 0,
): Group => ({
  id,
  name,
  description: null,
  created_by: 'teacher',
  member_count: 5,
  last_message_at: null,
  last_message_preview: null,
  unread_count,
  for_students: students,
  class_meeting: meeting,
} as Group);

describe('groupsByChild', () => {
  it('stays flat for a parent with one child', () => {
    const zayah = kid('z', 'Zayah');
    const groups = [grp('g1', 'Lego Lab Parent Chat', [zayah]), grp('g2', 'Art Parent Chat', [zayah])];

    const { sections, sectioned } = groupsByChild(groups);

    expect(sectioned).toBe(false);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBeNull();
    expect(sections[0].groups).toHaveLength(2);
  });

  it('stays flat for a teacher, whose groups carry no children', () => {
    const groups = [grp('g1', 'Lego Lab Student Chat'), grp('g2', 'Art Student Chat')];

    const { sections, sectioned } = groupsByChild(groups);

    expect(sectioned).toBe(false);
    expect(sections[0].groups).toHaveLength(2);
  });

  it('splits by child, alphabetically, once there are two or more', () => {
    const groups = [
      grp('g1', 'Lego Lab Parent Chat', [kid('z', 'Zayah')]),
      grp('g2', 'Peak Play PE Parent Chat', [kid('d', 'Daxton')]),
      grp('g3', 'Handmade Studio Parent Chat', [kid('r', 'Rivers')]),
    ];

    const { sections, sectioned } = groupsByChild(groups);

    expect(sectioned).toBe(true);
    expect(sections.map((s) => s.label)).toEqual([
      "Daxton's classes", "Rivers's classes", "Zayah's classes",
    ]);
    expect(sections[0].groups.map((g) => g.id)).toEqual(['g2']);
    expect(sections[2].groups.map((g) => g.id)).toEqual(['g1']);
  });

  it('lists a class two children share under both of their sections', () => {
    const groups = [
      grp('shared', 'Sword of Truth Parent Chat', [kid('d', 'Daxton'), kid('r', 'Rivers')]),
      grp('solo', 'Lego Lab Parent Chat', [kid('d', 'Daxton')]),
    ];

    const { sections } = groupsByChild(groups);

    expect(sections.find((s) => s.key === 'd')!.groups.map((g) => g.id)).toEqual(['shared', 'solo']);
    expect(sections.find((s) => s.key === 'r')!.groups.map((g) => g.id)).toEqual(['shared']);
  });

  it('keeps a group with no child in a trailing section rather than dropping it', () => {
    const groups = [
      grp('g1', 'Lego Lab Parent Chat', [kid('z', 'Zayah')]),
      grp('g2', 'Peak Play PE Parent Chat', [kid('d', 'Daxton')]),
      grp('g3', 'School Announcements'),
    ];

    const { sections } = groupsByChild(groups);

    const last = sections[sections.length - 1];
    expect(last.key).toBe('other');
    expect(last.label).toBe('Other groups');
    expect(last.groups.map((g) => g.id)).toEqual(['g3']);
  });

  it('preserves the server ordering (recency) inside a section', () => {
    const d = kid('d', 'Daxton');
    const groups = [grp('newest', 'A', [d]), grp('older', 'B', [d]), grp('oldest', 'C', [d]), grp('x', 'D', [kid('z', 'Zayah')])];

    const { sections } = groupsByChild(groups);

    expect(sections.find((s) => s.key === 'd')!.groups.map((g) => g.id))
      .toEqual(['newest', 'older', 'oldest']);
  });

  it('handles an empty list', () => {
    expect(groupsByChild([]).sections[0].groups).toEqual([]);
    expect(groupsByChild(undefined as any).sectioned).toBe(false);
  });

  // The section header stays visible when the parent folds a child away, and it
  // carries this number. A folded section that silently swallowed a message
  // would be worse than the flat list the sections replaced.
  describe('the unread total a folded header keeps showing', () => {
    it('adds up the unread messages in the section', () => {
      const groups = [
        grp('g1', 'Lego Lab Parent Chat', [kid('z', 'Zayah')], null, 2),
        grp('g2', 'Art Parent Chat', [kid('z', 'Zayah')], null, 3),
        grp('g3', 'Peak Play PE Parent Chat', [kid('d', 'Daxton')], null, 1),
      ];

      const { sections } = groupsByChild(groups);

      expect(sections.find((s) => s.key === 'z')!.unread).toBe(5);
      expect(sections.find((s) => s.key === 'd')!.unread).toBe(1);
    });

    it('is zero when the section is fully read', () => {
      const groups = [
        grp('g1', 'Lego Lab Parent Chat', [kid('z', 'Zayah')]),
        grp('g2', 'Peak Play PE Parent Chat', [kid('d', 'Daxton')], null, 4),
      ];

      const { sections } = groupsByChild(groups);

      expect(sections.find((s) => s.key === 'z')!.unread).toBe(0);
    });

    it('counts a shared class under both children', () => {
      const groups = [
        grp('shared', 'Sword of Truth Parent Chat',
          [kid('d', 'Daxton'), kid('r', 'Rivers')], null, 6),
        grp('solo', 'Lego Lab Parent Chat', [kid('d', 'Daxton')], null, 1),
      ];

      const { sections } = groupsByChild(groups);

      expect(sections.find((s) => s.key === 'd')!.unread).toBe(7);
      expect(sections.find((s) => s.key === 'r')!.unread).toBe(6);
    });

    it('is present on the flat single-child list too', () => {
      const groups = [grp('g1', 'Lego Lab Parent Chat', [kid('z', 'Zayah')], null, 2)];

      expect(groupsByChild(groups).sections[0].unread).toBe(2);
    });
  });
});

describe('classMeetingLabel', () => {
  it('separates the three same-named Peak Play PE chats', () => {
    expect(classMeetingLabel({ day_of_week: 2, start_time: '09:30:00' })).toBe('Tue 9:30 AM');
    expect(classMeetingLabel({ day_of_week: 2, start_time: '14:00:00' })).toBe('Tue 2:00 PM');
    expect(classMeetingLabel({ day_of_week: 4, start_time: '14:00:00' })).toBe('Thu 2:00 PM');
  });

  it('is empty when there is nothing to show', () => {
    expect(classMeetingLabel(null)).toBe('');
    expect(classMeetingLabel(undefined)).toBe('');
    expect(classMeetingLabel({ day_of_week: null, start_time: null })).toBe('');
  });

  it('shows whichever half is recorded', () => {
    expect(classMeetingLabel({ day_of_week: 1, start_time: null })).toBe('Mon');
    expect(classMeetingLabel({ day_of_week: null, start_time: '09:30' })).toBe('9:30 AM');
  });
});

describe('studentName', () => {
  it('prefers the first name, falls back to the display name', () => {
    expect(studentName({ id: 'a', first_name: 'Zayah', display_name: 'Zayah T' })).toBe('Zayah');
    expect(studentName({ id: 'a', first_name: null, display_name: 'Zayah T' })).toBe('Zayah T');
    expect(studentName(null)).toBe('');
  });
});
