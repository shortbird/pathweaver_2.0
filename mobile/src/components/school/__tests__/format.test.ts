/**
 * School feed date formatting — mirrors the web SchoolCommunity rules:
 * all-day events are stored date-only (00:00 UTC) and must format in UTC or
 * they render as the previous evening west of Greenwich; events in another
 * year carry the year so a January date under a December one reads in order.
 */

import { fmtDate, fmtWhen, fmtTimeRange, fmtDayHeading } from '../format';

describe('fmtDate', () => {
  it('formats an ISO timestamp as a short date', () => {
    expect(fmtDate('2026-08-07T15:30:00Z')).toMatch(/Aug/);
  });
  it('is empty for garbage', () => {
    expect(fmtDate(null as any)).toBe('');
    expect(fmtDate('not a date')).toBe('');
  });
});

describe('fmtWhen', () => {
  it('formats an all-day event in UTC so the date never shifts back a day', () => {
    // Labor Day, stored date-only. In America/Denver a local format would say Sep 6.
    const label = fmtWhen({ start_at: '2026-09-07T00:00:00Z', all_day: true } as any);
    expect(label).toContain('7');
    expect(label).toContain('all day');
  });

  it('includes a time for timed events', () => {
    const label = fmtWhen({ start_at: '2026-08-20T16:00:00Z', all_day: false } as any);
    expect(label).toMatch(/\d{1,2}[:.]\d{2}/);
  });

  it('shows a timed event at the clock the office typed', () => {
    // Perch 1d0d41a9: "the hang time was showing up as 4am for him, instead of
    // 10am". The row is 10:00:00+00 because the SIS form's "10:00" went into a
    // timestamptz unconverted — a wall clock wearing a UTC label. Formatting it
    // as an instant subtracts six hours in Denver.
    const label = fmtWhen({ start_at: '2026-09-11T10:00:00Z', all_day: false } as any);
    expect(label).toContain('10:00');
    expect(label).not.toContain('4:00');
  });

  it('keeps an early-morning event on its own day', () => {
    const label = fmtWhen({ start_at: '2026-09-11T04:00:00Z', all_day: false } as any);
    expect(label).toContain('11');
    expect(label).not.toContain('10');
  });

  it('adds the year when the event is not this year', () => {
    const label = fmtWhen({ start_at: '2027-01-11T00:00:00Z', all_day: true } as any);
    expect(label).toContain('2027');
  });

  it('is empty without a start', () => {
    expect(fmtWhen({ start_at: null } as any)).toBe('');
  });
});

describe('the test process is west of Greenwich', () => {
  it('runs in America/Denver, or none of the wall-clock tests below can fail', () => {
    // In UTC, local time and UTC agree, and a formatter that forgets
    // timeZone: 'UTC' gives the right answer for the wrong reason. Every
    // wall-clock test in this file was green in CI while the bug shipped.
    // globalSetup.js pins the zone; this is the tripwire if it stops.
    expect(new Date('2026-09-15T18:30:00Z').getTimezoneOffset()).toBe(360);
  });
});

describe('fmtTimeRange', () => {
  it('shows a timed event at the clock the office typed, not shifted to local', () => {
    // Marika, iCreate, 2026-09-15: "We have a mom's night right now, but on the
    // app it says this event starts at 12:30." The row is 18:30:00+00 — the
    // 6:30 the office typed, tagged +00 unconverted. Read as an instant in
    // Denver it is 12:30 PM, six hours early, and "would likely explain our
    // low turnout at all events thus far".
    const label = fmtTimeRange({
      start_at: '2026-09-15T18:30:00Z', end_at: '2026-09-15T20:00:00Z', all_day: false,
    });
    expect(label).toContain('6:30');
    expect(label).toContain('8:00');
    expect(label).not.toContain('12:30');
    expect(label).not.toContain('2:00');
  });

  it('shows a morning event in the morning', () => {
    // The same rule from the other side of noon: 10am stays 10am, and does
    // not become 4am (Perch 1d0d41a9).
    const label = fmtTimeRange({ start_at: '2026-09-11T10:00:00Z', end_at: null, all_day: false });
    expect(label).toContain('10:00');
    expect(label).not.toContain('4:00');
  });

  it('is just the start when there is no end', () => {
    const label = fmtTimeRange({ start_at: '2026-09-18T15:00:00Z', end_at: null, all_day: false });
    expect(label).toContain('3:00');
    expect(label).not.toContain('–');
  });

  it('is just the start when the end is the same minute', () => {
    const label = fmtTimeRange({
      start_at: '2026-09-18T15:00:00Z', end_at: '2026-09-18T15:00:00Z', all_day: false,
    });
    expect(label).not.toContain('–');
  });

  it('says "All day" for an all-day event whatever its stamps hold', () => {
    expect(fmtTimeRange({ start_at: '2026-09-07T00:00:00Z', end_at: null, all_day: true }))
      .toBe('All day');
  });

  it('says "All day" when there is no start at all', () => {
    expect(fmtTimeRange({ start_at: null, end_at: null, all_day: false })).toBe('All day');
  });

  it('drops an end it cannot parse rather than printing garbage', () => {
    const label = fmtTimeRange({
      start_at: '2026-09-18T15:00:00Z', end_at: 'later', all_day: false,
    });
    expect(label).toContain('3:00');
    expect(label).not.toContain('–');
  });
});

describe('fmtDayHeading', () => {
  it('names the day the key says, not the evening before', () => {
    // A 'YYYY-MM-DD' key parsed as a Date is midnight UTC, which in Denver is
    // 6pm the previous day. Built from parts it stays on its own day.
    const label = fmtDayHeading('2026-09-15');
    expect(label).toContain('15');
    expect(label).toMatch(/Tue/);
  });

  it('is empty for a key that is not a date', () => {
    expect(fmtDayHeading('')).toBe('');
    expect(fmtDayHeading('next tuesday')).toBe('');
  });
});
