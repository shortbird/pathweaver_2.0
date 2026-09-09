/**
 * School feed date formatting — mirrors the web SchoolCommunity rules:
 * all-day events are stored date-only (00:00 UTC) and must format in UTC or
 * they render as the previous evening west of Greenwich; events in another
 * year carry the year so a January date under a December one reads in order.
 */

import { fmtDate, fmtWhen } from '../format';

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

  it('adds the year when the event is not this year', () => {
    const label = fmtWhen({ start_at: '2027-01-11T00:00:00Z', all_day: true } as any);
    expect(label).toContain('2027');
  });

  it('is empty without a start', () => {
    expect(fmtWhen({ start_at: null } as any)).toBe('');
  });
});
