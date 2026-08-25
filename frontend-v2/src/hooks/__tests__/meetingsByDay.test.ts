import { meetingsByDay, type ScheduledClass } from '../useClassSchedule';

/**
 * Families read a schedule day-first.
 *
 * The school hub used to show a card per class with its meetings listed inside,
 * which answers "when does Pottery meet?" but not the question families arrive
 * with — "where is she at 10:30 on Tuesday?" An iCreate parent reported it on
 * 2026-08-25: "super clunky to find out where they are at certain times...
 * at least separated by days and ideeeeeally in schedule order."
 *
 * These mirror frontend/src/components/schedule/scheduleByDay.test.jsx — the
 * two platforms must group and order a schedule identically, or the same family
 * gets two different answers on phone and laptop.
 */

const cls = (id: string, name: string, meetings: any[], extra: any = {}): ScheduledClass => ({
  id, name, meetings, location: null, teacher_name: null, ...extra,
});

describe('meetingsByDay', () => {
  it('splits one class across the days it actually meets', () => {
    const days = meetingsByDay([
      cls('c1', 'Pottery', [
        { day_of_week: 3, start_time: '13:00', end_time: '14:00' },
        { day_of_week: 1, start_time: '09:30', end_time: '10:30' },
      ]),
    ]);
    expect(days.map((d) => d.label)).toEqual(['Monday', 'Wednesday']);
  });

  it('orders each day by start time, not by class name', () => {
    const days = meetingsByDay([
      cls('c1', 'Zoology', [{ day_of_week: 2, start_time: '09:30', end_time: '10:30' }]),
      cls('c2', 'Art', [{ day_of_week: 2, start_time: '11:30', end_time: '12:30' }]),
      cls('c3', 'Math', [{ day_of_week: 2, start_time: '10:30', end_time: '11:30' }]),
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].rows.map((r) => r.cls.name)).toEqual(['Zoology', 'Math', 'Art']);
  });

  it('runs Monday-first with Sunday last', () => {
    const days = meetingsByDay([
      cls('c1', 'A', [{ day_of_week: 0, start_time: '09:00' }]),
      cls('c2', 'B', [{ day_of_week: 6, start_time: '09:00' }]),
      cls('c3', 'C', [{ day_of_week: 1, start_time: '09:00' }]),
    ]);
    expect(days.map((d) => d.label)).toEqual(['Monday', 'Saturday', 'Sunday']);
  });

  it('omits days with nothing scheduled', () => {
    const days = meetingsByDay([cls('c1', 'Pottery', [{ day_of_week: 1, start_time: '09:30' }])]);
    expect(days.map((d) => d.label)).toEqual(['Monday']);
  });

  it('keeps a class with no meetings instead of dropping it', () => {
    const days = meetingsByDay([
      cls('c1', 'Pottery', [{ day_of_week: 1, start_time: '09:30' }]),
      cls('c2', 'Choir', []),
    ]);
    const last = days[days.length - 1];
    expect(last.label).toBe('Not scheduled yet');
    expect(last.rows[0].cls.name).toBe('Choir');
    expect(last.rows[0].meeting).toBeNull();
  });

  it('groups a one-off dated meeting by its date, not as a weekly slot', () => {
    const days = meetingsByDay([
      cls('c1', 'Field trip', [{ specific_date: '2026-09-12', start_time: '09:00' }]),
      cls('c2', 'Pottery', [{ day_of_week: 1, start_time: '09:30' }]),
    ]);
    expect(days.map((d) => d.label)).toEqual(['Monday', '2026-09-12']);
  });

  it('sinks a meeting with no start time below the timed ones in its day', () => {
    const days = meetingsByDay([
      cls('c1', 'TBD', [{ day_of_week: 2 }]),
      cls('c2', 'Math', [{ day_of_week: 2, start_time: '10:30' }]),
    ]);
    expect(days[0].rows.map((r) => r.cls.name)).toEqual(['Math', 'TBD']);
  });

  it('treats day_of_week 0 as Sunday rather than as missing', () => {
    // `0` is falsy — a truthiness check here would file Sunday classes under
    // "Not scheduled yet" and quietly lose them off the schedule.
    const days = meetingsByDay([cls('c1', 'Sunday choir', [{ day_of_week: 0, start_time: '09:00' }])]);
    expect(days.map((d) => d.label)).toEqual(['Sunday']);
  });

  it('returns nothing for no classes', () => {
    expect(meetingsByDay([])).toEqual([]);
  });
});
