/**
 * The printed schedule.
 *
 * iCreate, 2026-08-31: "Would be nice if we could print the schedule." What
 * lands on paper is the whole feature, and nobody re-reads a printout in code
 * review, so these assert the sheet itself rather than that printAsync was
 * called: every class present, the room the family should walk to, and school
 * text escaped rather than rendered as markup.
 */

import * as Print from 'expo-print';
import { scheduleHtml, escapeHtml, printSchedule } from '../printSchedule';
import type { ScheduledClass } from '@/src/hooks/useClassSchedule';

const POTTERY: ScheduledClass = {
  id: 'c1',
  name: 'Pottery',
  location: 'Room 3',
  teacher_name: 'Ms. Alvarez',
  meetings: [{ day_of_week: 2, start_time: '09:00', end_time: '10:30', location: null }],
};
const CHOIR: ScheduledClass = {
  id: 'c2',
  name: 'Choir',
  location: 'Room 1',
  teacher_name: null,
  // Moves rooms on the day it meets.
  meetings: [{ day_of_week: 1, start_time: '13:00', end_time: '14:00', location: 'Stage' }],
};
const UNSCHEDULED: ScheduledClass = {
  id: 'c3', name: 'Independent Study', location: null, teacher_name: null, meetings: [],
};

const PRINTED_ON = new Date(2026, 8, 1); // Sept 1, 2026, local

describe('the printed sheet', () => {
  it('names the child and every class', () => {
    const html = scheduleHtml('Charlotte Myers', [POTTERY, CHOIR], { printedOn: PRINTED_ON });
    expect(html).toContain('Charlotte Myers');
    expect(html).toContain('Pottery');
    expect(html).toContain('Choir');
  });

  it('groups by day, Monday first', () => {
    const html = scheduleHtml('Charlotte', [POTTERY, CHOIR], { printedOn: PRINTED_ON });
    expect(html.indexOf('Monday')).toBeGreaterThan(-1);
    expect(html.indexOf('Monday')).toBeLessThan(html.indexOf('Tuesday'));
  });

  it('carries the time and the room the family walks to', () => {
    const html = scheduleHtml('Charlotte', [POTTERY, CHOIR], { printedOn: PRINTED_ON });
    expect(html).toContain('9:00 AM – 10:30 AM');
    expect(html).toContain('Ms. Alvarez');
    expect(html).toContain('Room 3');
    // The meeting's own room beats the class default — Choir is on the Stage
    // that day, and a printout that says Room 1 sends the family to the wrong
    // door with no way to notice.
    expect(html).toContain('Stage');
    expect(html).not.toContain('Room 1');
  });

  it('keeps a class with no meetings on the page', () => {
    // The family is paying for it; a sheet that quietly omits it is worse than
    // one that admits the school has not scheduled it yet.
    const html = scheduleHtml('Charlotte', [POTTERY, UNSCHEDULED], { printedOn: PRINTED_ON });
    expect(html).toContain('Independent Study');
    expect(html).toContain('Not scheduled yet');
  });

  it('says so rather than printing a blank page', () => {
    const html = scheduleHtml('Charlotte', [], { printedOn: PRINTED_ON });
    expect(html).toContain('No classes are scheduled yet');
  });

  it('dates the printout', () => {
    const html = scheduleHtml('Charlotte', [POTTERY], { printedOn: PRINTED_ON });
    expect(html).toContain('September 1, 2026');
  });

  it('escapes school-entered text instead of rendering it', () => {
    const html = scheduleHtml('Charlotte', [{
      ...POTTERY, name: 'Art & <script>alert(1)</script> Design',
    }], { printedOn: PRINTED_ON });
    expect(html).toContain('Art &amp; &lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('escapes the child’s own name too', () => {
    expect(escapeHtml('Tom & "Jerry"')).toBe('Tom &amp; &quot;Jerry&quot;');
  });
});

describe('handing it to the OS', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens the print sheet with the rendered week', async () => {
    await printSchedule('Charlotte Myers', [POTTERY]);
    expect(Print.printAsync).toHaveBeenCalledTimes(1);
    const { html } = (Print.printAsync as jest.Mock).mock.calls[0][0];
    expect(html).toContain('Charlotte Myers');
    expect(html).toContain('Pottery');
  });

  it('lets a failure reach the caller', async () => {
    (Print.printAsync as jest.Mock).mockRejectedValueOnce(new Error('no print service'));
    await expect(printSchedule('Charlotte', [POTTERY])).rejects.toThrow('no print service');
  });
});
