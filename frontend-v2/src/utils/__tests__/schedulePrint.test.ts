/**
 * The printed schedule IS the HTML this builds, so the HTML is what's worth
 * asserting on: the right days in the right order, the room a family walks to,
 * and school-entered text that can't break the page.
 */
import { scheduleHtml } from '../schedulePrint';
import type { ScheduledClass } from '@/src/hooks/useClassSchedule';

const classes: ScheduledClass[] = [
  {
    id: 'c1',
    name: 'Pottery',
    location: 'Studio A',
    teacher_name: 'Ms. Lee',
    meetings: [{ day_of_week: 2, start_time: '10:30', end_time: '11:30', location: null }],
  },
  {
    id: 'c2',
    name: 'Robotics',
    location: null,
    teacher_name: null,
    // Earlier in the day than Pottery, and on the same day, so it must print first.
    meetings: [{ day_of_week: 2, start_time: '09:00', end_time: '10:00', location: 'Lab 2' }],
  },
  {
    id: 'c3',
    name: 'Choir',
    location: null,
    teacher_name: null,
    meetings: [{ day_of_week: 1, start_time: '13:00', end_time: '14:00', location: null }],
  },
];

describe('scheduleHtml', () => {
  it('prints days Monday-first with each day in time order', () => {
    const html = scheduleHtml('Ada', classes);
    expect(html.indexOf('Monday')).toBeLessThan(html.indexOf('Tuesday'));
    expect(html.indexOf('Robotics')).toBeLessThan(html.indexOf('Pottery'));
  });

  it("carries the meeting's own room, falling back to the class location", () => {
    const html = scheduleHtml('Ada', classes);
    expect(html).toContain('Lab 2');   // meeting overrides (class has none)
    expect(html).toContain('Studio A'); // class default, meeting has none
  });

  it('names the student and the school', () => {
    const html = scheduleHtml('Ada Lovelace', classes, 'iCreate');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('iCreate');
  });

  it('escapes school-entered text instead of putting it in the page as markup', () => {
    const html = scheduleHtml('Ada', [{
      id: 'c4',
      name: '<script>alert(1)</script>',
      location: 'Room "5"',
      teacher_name: 'A & B',
      meetings: [{ day_of_week: 3, start_time: '09:00', end_time: '10:00', location: null }],
    }]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('Room &quot;5&quot;');
  });

  it('says so rather than printing an empty table when nothing is scheduled', () => {
    expect(scheduleHtml('Ada', [])).toContain('No classes scheduled yet.');
  });
});
