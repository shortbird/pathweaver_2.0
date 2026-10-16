/**
 * Signing up for a school event in the app.
 *
 * Apogee NoCo, SPARK Friday Excursions (2026-10-16): families pick which
 * children are coming, "Full" turns a new family away, and a family already in
 * can still change its sign-up. The web has the same component; the words come
 * from shared/eventRsvp.ts on both.
 */

import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import { EventRsvp } from '../EventRsvp';
import { CalendarTab } from '../CalendarTab';
import { rsvpStatus } from '@shared/eventRsvp';

jest.mock('@/src/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('@/src/stores/toastStore', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const KIDS = [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Ben' }];
const SPARK = {
  id: 'e1', title: 'SPARK: Zoo', description: null, location: 'Denver Zoo',
  start_at: '2099-10-09T09:00:00Z', end_at: null, all_day: false, categories: ['SPARK'],
  rsvp_enabled: true, rsvp_mode: 'children' as const, rsvp_capacity: 10,
  rsvp_spots_left: 4, rsvp_full: false, my_rsvp: null,
};

beforeEach(() => jest.clearAllMocks());

it('signs up the children picked', async () => {
  (api.get as jest.Mock).mockResolvedValue({ data: { rsvp: null, children: KIDS, spots_left: 4 } });
  (api.post as jest.Mock).mockResolvedValue({ data: { rsvp: { attending: true, student_ids: ['b'] } } });
  render(<EventRsvp event={SPARK} organizationId="org-1" />);
  expect(screen.getByTestId('rsvp-status-e1').props.children).toBe('Sign up · 4 spots left');
  fireEvent.press(screen.getByTestId('rsvp-open-e1'));
  fireEvent.press(await screen.findByTestId('rsvp-child-b'));
  fireEvent.press(screen.getByTestId('rsvp-yes'));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  expect((api.post as jest.Mock).mock.calls[0][1]).toMatchObject({ attending: true, student_ids: ['b'] });
});

it('shows Full and no button to a new family', () => {
  render(<EventRsvp event={{ ...SPARK, rsvp_spots_left: 0, rsvp_full: true }} organizationId="org-1" />);
  expect(screen.getByTestId('rsvp-status-e1').props.children).toBe('Full');
  expect(screen.queryByTestId('rsvp-open-e1')).toBeNull();
});

it('lets a family already in change its sign-up when full', () => {
  render(<EventRsvp organizationId="org-1" event={{
    ...SPARK, rsvp_spots_left: 0, rsvp_full: true,
    my_rsvp: { attending: true, party_size: 2, student_ids: ['a', 'b'] },
  }} />);
  expect(screen.getByTestId('rsvp-status-e1').props.children).toBe('Signed up · 2 children');
  expect(screen.getByTestId('rsvp-open-e1')).toBeTruthy();
});

it('says nothing on an event that is not taking replies', () => {
  render(<EventRsvp event={{ ...SPARK, rsvp_enabled: false }} organizationId="org-1" />);
  expect(screen.queryByTestId('rsvp-e1')).toBeNull();
});

describe('the shared words', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  it('reads closed, not coming, and count mode', () => {
    expect(rsvpStatus({ ...SPARK, rsvp_closes_at: '2026-10-01T23:59:00Z' }, now)?.label).toBe('Replies closed');
    expect(rsvpStatus({ ...SPARK, my_rsvp: { attending: false } }, now)?.label).toBe('Not coming');
    expect(rsvpStatus({ ...SPARK, rsvp_mode: 'count', rsvp_spots_left: null,
      my_rsvp: { attending: true, party_size: 3 } }, now)?.label).toBe('Signed up · 3 people');
    expect(rsvpStatus({ ...SPARK, rsvp_spots_left: null }, now)?.label).toBe('Sign up');
  });
});

jest.mock('@/src/hooks/useSchoolCalendar', () => ({
  ...jest.requireActual('@/src/hooks/useSchoolCalendar'),
  thisMonth: () => '2099-10',
  todayIso: () => '2099-10-01',
  useSchoolCalendar: () => ({
    month: '2099-10', setMonth: jest.fn(), loading: false, error: null, reload: jest.fn(),
    days: [
      { date: '2099-10-09', events: [SPARK] },
      { date: '2099-10-12', events: [{ id: 'e2', title: 'Picnic', description: null, location: null,
        start_at: '2099-10-12T00:00:00Z', end_at: null, all_day: true, categories: ['Community'] }] },
    ],
  }),
}));

it('filters the agenda by category', () => {
  render(<CalendarTab organizationId="org-1" />);
  expect(screen.getByText('Picnic')).toBeTruthy();
  fireEvent.press(screen.getByTestId('cal-cat-SPARK'));
  expect(screen.queryByText('Picnic')).toBeNull();
  expect(screen.getByText('SPARK: Zoo')).toBeTruthy();
});
