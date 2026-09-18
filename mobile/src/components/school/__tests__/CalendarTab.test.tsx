/**
 * The Calendar tab opens the current month on today.
 *
 * It opened on the month's first event, which mid-month meant landing on 9/7
 * and scrolling past a fortnight already lived through (2026-09-18). Covered:
 * today at the top whether or not anything is on it, the earlier days folded
 * behind one tap, and other months left whole.
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { CalendarTab } from '../CalendarTab';

let mockMonth = '2026-09';
const mockSetMonth = jest.fn((m: string) => { mockMonth = m; });
let mockDays: { date: string; events: any[] }[] = [];
jest.mock('@/src/hooks/useSchoolCalendar', () => ({
  ...jest.requireActual('@/src/hooks/useSchoolCalendar'),
  thisMonth: () => '2026-09',
  todayIso: () => '2026-09-18',
  useSchoolCalendar: () => ({
    month: mockMonth, setMonth: mockSetMonth, days: mockDays, loading: false, error: null, reload: jest.fn(),
  }),
}));

const ev = (id: string, title: string, start: string) => ({
  id, title, description: null, location: null, start_at: start, end_at: null, all_day: false,
});
const day = (date: string, ...events: any[]) => ({ date, events });

beforeEach(() => {
  jest.clearAllMocks();
  mockMonth = '2026-09';
  mockDays = [
    day('2026-09-07', ev('a', 'Labor Day', '2026-09-07T00:00:00Z')),
    day('2026-09-17', ev('b', 'Picture day', '2026-09-17T15:00:00Z')),
    day('2026-09-25', ev('c', 'Field trip', '2026-09-25T15:00:00Z')),
  ];
});

it('opens on today, with the earlier days folded away', () => {
  render(<CalendarTab organizationId="org-1" />);
  expect(screen.getByTestId('cal-today-empty')).toBeTruthy();
  expect(screen.getByText('Field trip')).toBeTruthy();
  expect(screen.queryByText('Labor Day')).toBeNull();
  expect(screen.queryByText('Picture day')).toBeNull();
  expect(screen.getByText('Show 2 earlier days this month')).toBeTruthy();
});

it('marks today when something is on it, instead of the empty line', () => {
  mockDays.push(day('2026-09-18', ev('d', 'Open house', '2026-09-18T16:00:00Z')));
  render(<CalendarTab organizationId="org-1" />);
  expect(screen.getByTestId('cal-today')).toBeTruthy();
  expect(screen.queryByTestId('cal-today-empty')).toBeNull();
  expect(screen.getByText(/^Today · /)).toBeTruthy();
});

it('unfolds the earlier days on one tap', () => {
  render(<CalendarTab organizationId="org-1" />);
  fireEvent.press(screen.getByTestId('cal-show-past'));
  expect(screen.getByText('Labor Day')).toBeTruthy();
  expect(screen.getByText('Picture day')).toBeTruthy();
  expect(screen.queryByTestId('cal-show-past')).toBeNull();
});

it('leaves another month whole', () => {
  mockMonth = '2026-08';
  mockDays = [day('2026-08-03', ev('x', 'Orientation', '2026-08-03T15:00:00Z'))];
  render(<CalendarTab organizationId="org-1" />);
  expect(screen.getByText('Orientation')).toBeTruthy();
  expect(screen.queryByTestId('cal-show-past')).toBeNull();
  expect(screen.queryByTestId('cal-today-empty')).toBeNull();
});

it('says when the rest of this month is clear', () => {
  mockDays = [day('2026-09-07', ev('a', 'Labor Day', '2026-09-07T00:00:00Z'))];
  render(<CalendarTab organizationId="org-1" />);
  expect(screen.getByTestId('cal-rest-empty')).toBeTruthy();
});

it('still says when the whole month is empty', () => {
  mockDays = [];
  render(<CalendarTab organizationId="org-1" />);
  expect(screen.getByTestId('cal-empty')).toBeTruthy();
  expect(screen.queryByTestId('cal-today-empty')).toBeNull();
});
