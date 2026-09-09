/**
 * The school calendar's month maths and grouping.
 *
 * iCreate, 2026-09-04 (e223b6db): "Can we get the calendar to show up on the
 * app?" The hub showed the next three dates and said the rest lived on the web.
 *
 * The screen is a list; the parts worth testing are the ones that quietly go
 * wrong — stepping across a year boundary, and which local day an event lands
 * on, which is where an all-day event west of Greenwich slips to the day before.
 */

import {
  monthWindow, shiftMonth, eventDay, groupByDay,
} from '../useSchoolCalendar';

const ev = (over: Partial<Parameters<typeof eventDay>[0]> = {}) => ({
  id: 'e1',
  title: 'Field trip',
  description: null,
  location: null,
  start_at: '2026-09-10T15:00:00Z',
  end_at: null,
  all_day: false,
  ...over,
} as Parameters<typeof eventDay>[0]);

describe('the month window', () => {
  it('asks for exactly one month', () => {
    expect(monthWindow('2026-09')).toEqual({ from: '2026-09-01', to: '2026-10-01' });
  });

  it('rolls into the next year in December', () => {
    expect(monthWindow('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
  });
});

describe('stepping months', () => {
  it('goes forward', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10');
  });

  it('goes back', () => {
    expect(shiftMonth('2026-09', -1)).toBe('2026-08');
  });

  it('crosses December without inventing month 13', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('crosses January backwards', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('does not overflow the day, the way Date.setMonth does', () => {
    // 31 January + 1 month is February, not the 3rd of March.
    expect(shiftMonth('2026-01', 1)).toBe('2026-02');
  });
});

describe('which day an event falls on', () => {
  it('reads an all-day event in UTC, so it keeps its date', () => {
    // Stored date-only as 00:00 UTC. Read in local time anywhere west of
    // Greenwich it becomes the previous evening — which is how "NO CLASS -
    // LABOR DAY" once showed up on the Sunday.
    expect(eventDay(ev({ all_day: true, start_at: '2026-09-07T00:00:00Z' })))
      .toBe('2026-09-07');
  });

  it('has no day when it has no start', () => {
    expect(eventDay(ev({ start_at: null }))).toBe('');
  });

  it('has no day when the start is not a date', () => {
    expect(eventDay(ev({ start_at: 'sometime next week' }))).toBe('');
  });
});

describe('grouping into an agenda', () => {
  it('puts each event under its day, earliest day first', () => {
    const days = groupByDay([
      ev({ id: 'b', all_day: true, start_at: '2026-09-20T00:00:00Z' }),
      ev({ id: 'a', all_day: true, start_at: '2026-09-10T00:00:00Z' }),
    ]);
    expect(days.map((d) => d.date)).toEqual(['2026-09-10', '2026-09-20']);
  });

  it('leaves empty days out entirely', () => {
    // An agenda, not a grid: scrolling a term should be scrolling what happens.
    const days = groupByDay([ev({ all_day: true, start_at: '2026-09-10T00:00:00Z' })]);
    expect(days).toHaveLength(1);
  });

  it('leads a day with its all-day items', () => {
    const days = groupByDay([
      ev({ id: 'timed', start_at: '2026-09-10T15:00:00Z' }),
      ev({ id: 'allday', all_day: true, start_at: '2026-09-10T00:00:00Z' }),
    ]);
    expect(days[0].events.map((e) => e.id)).toEqual(['allday', 'timed']);
  });

  it('orders the timed events of a day by when they start', () => {
    const days = groupByDay([
      ev({ id: 'late', start_at: '2026-09-10T18:00:00Z' }),
      ev({ id: 'early', start_at: '2026-09-10T15:00:00Z' }),
    ]);
    expect(days[0].events.map((e) => e.id)).toEqual(['early', 'late']);
  });

  it('drops an event it cannot place rather than inventing a day for it', () => {
    expect(groupByDay([ev({ start_at: null })])).toEqual([]);
  });

  it('is empty when the month is', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
