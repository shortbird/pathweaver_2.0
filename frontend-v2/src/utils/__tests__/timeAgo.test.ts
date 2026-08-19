/**
 * timeAgo — shared relative-time formatting.
 *
 * The caching assertions are the point: the feed calls these for every card,
 * and the previous per-call `toLocaleDateString` built a fresh Hermes
 * Intl.DateTimeFormat each time.
 */

import { formatTimeAgo, formatRelativeTime, formatMonthDay, formatMonthDayTime } from '../timeAgo';

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatTimeAgo', () => {
  it('returns the compact bucket for each range', () => {
    expect(formatTimeAgo(ago(10_000))).toBe('just now');
    expect(formatTimeAgo(ago(5 * MIN))).toBe('5m');
    expect(formatTimeAgo(ago(3 * HOUR))).toBe('3h');
    expect(formatTimeAgo(ago(2 * DAY))).toBe('2d');
  });

  it('falls back to a month/day stamp past a week', () => {
    expect(formatTimeAgo('2026-06-17T08:06:32Z')).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});

describe('formatRelativeTime', () => {
  it('returns the sentence form', () => {
    expect(formatRelativeTime(ago(10_000))).toBe('Just now');
    expect(formatRelativeTime(ago(5 * MIN))).toBe('5m ago');
    expect(formatRelativeTime(ago(3 * HOUR))).toBe('3h ago');
    expect(formatRelativeTime(ago(2 * DAY))).toBe('2d ago');
  });

  it('uses the empty label when there is no timestamp', () => {
    expect(formatRelativeTime(null)).toBe('No activity yet');
    expect(formatRelativeTime(undefined, 'Nothing here')).toBe('Nothing here');
  });
});

describe('formatMonthDayTime', () => {
  it('combines the date and time stamps', () => {
    expect(formatMonthDayTime(new Date('2026-06-17T15:04:00'))).toMatch(
      /^[A-Z][a-z]{2} \d{1,2} \d{1,2}:\d{2}\s?[AP]M$/,
    );
  });
});

describe('formatter caching', () => {
  it('constructs each Intl formatter at most once, however many calls', () => {
    jest.resetModules();
    const real = Intl.DateTimeFormat;
    const spy = jest
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation((...args: any[]) => new (real as any)(...args));

    // Re-require so the module's lazy singletons start empty under the spy.
    const timeAgo = require('../timeAgo');
    const old = '2026-06-17T08:06:32Z';
    for (let i = 0; i < 25; i++) {
      timeAgo.formatTimeAgo(old);
      timeAgo.formatMonthDay(new Date(old));
    }
    // One month/day formatter, and nothing else built.
    expect(spy).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 25; i++) timeAgo.formatMonthDayTime(new Date(old));
    // Plus one hour/minute formatter — still not one per call.
    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockRestore();
  });
});

describe('formatMonthDay', () => {
  it('formats a date as short month + day', () => {
    expect(formatMonthDay(new Date('2026-06-17T12:00:00'))).toBe('Jun 17');
  });
});
