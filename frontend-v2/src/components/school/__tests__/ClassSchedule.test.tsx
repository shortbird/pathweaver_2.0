/**
 * A parent can see one child's schedule on that child's own page.
 *
 * Five reports asked for this between 2026-08-25 and 2026-09-01, all the same
 * shape: "I would really like to be able to see my child's schedule under their
 * profile and not just by scrolling to the bottom of the building icon", and
 * "The student schedule is not visible under their name but only when we scroll
 * down to the very bottom of the building icon."
 *
 * The schedule existed; it lived only on the school hub, below everything else,
 * with a section per child. Narrowed to one student it belongs on that child's
 * profile, open on arrival — a collapsed section there would recreate the
 * hunting the reports were about.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import ClassSchedule from '../ClassSchedule';
import type { StudentSchedule } from '@/src/hooks/useClassSchedule';

const mockUseClassSchedule = jest.fn();
jest.mock('@/src/hooks/useClassSchedule', () => ({
  ...jest.requireActual('@/src/hooks/useClassSchedule'),
  useClassSchedule: (...args: any[]) => mockUseClassSchedule(...args),
}));

const meeting = (day: number, start: string, location?: string) => ({
  day_of_week: day, start_time: start, end_time: null, location: location ?? null,
});

const student = (id: string, name: string, className: string): StudentSchedule => ({
  student_id: id,
  student_name: name,
  classes: [{ id: `c-${id}`, name: className, meetings: [meeting(1, '10:30:00', 'Room 3')] }],
});

const MADELEINE = student('kid-1', 'Madeleine Myers', 'Pottery');
const CHARLOTTE = student('kid-2', 'Charlotte Myers', 'Earth Science');

const withSchedules = (schedules: StudentSchedule[]) =>
  mockUseClassSchedule.mockReturnValue({ schedules, loading: false, hasAny: schedules.length > 0 });

beforeEach(() => jest.clearAllMocks());

describe('narrowed to one child', () => {
  it('shows only that child’s classes', () => {
    withSchedules([MADELEINE, CHARLOTTE]);
    const { queryByText } = render(<ClassSchedule studentId="kid-1" defaultOpen />);
    expect(queryByText('Pottery')).toBeTruthy();
    expect(queryByText('Earth Science')).toBeNull();
  });

  it('titles the section for the schedule, not the child', () => {
    // Their name is already at the top of their own page.
    withSchedules([MADELEINE, CHARLOTTE]);
    const { queryByTestId } = render(<ClassSchedule studentId="kid-1" />);
    expect(queryByTestId('section-toggle-Class schedule')).toBeTruthy();
    expect(queryByTestId('section-toggle-Madeleine Myers')).toBeNull();
  });

  it('can open on arrival', () => {
    withSchedules([MADELEINE]);
    const { queryByText } = render(<ClassSchedule studentId="kid-1" defaultOpen />);
    // The meeting row is only rendered when the section is expanded.
    expect(queryByText('Pottery')).toBeTruthy();
  });

  it('renders nothing when that child has no classes', () => {
    // A sibling having classes must not put an empty box on this child's page.
    withSchedules([{ ...MADELEINE, classes: [] }, CHARLOTTE]);
    const { queryByTestId } = render(<ClassSchedule studentId="kid-1" />);
    expect(queryByTestId('class-schedule')).toBeNull();
  });

  it('renders nothing for a child who is not in the schedule at all', () => {
    withSchedules([CHARLOTTE]);
    const { queryByTestId } = render(<ClassSchedule studentId="kid-1" />);
    expect(queryByTestId('class-schedule')).toBeNull();
  });
});

// ── Add/drop requests ────────────────────────────────────────────────────────
// The mobile app has no schedule builder, only this read-only schedule, so for
// iCreate's families this button IS the add/drop feature (their office asked
// for it 2026-09-01, deadline Sept 8).
describe('the add/drop request', () => {
  const inWindow = (extra: Partial<StudentSchedule['add_drop']> = {}) => ({
    ...MADELEINE,
    organization_id: 'org-1',
    add_drop: { open: true, deadline: '2026-09-08', pending: false, ...extra },
  });

  it('offers the request under the week while the window is open', () => {
    withSchedules([inWindow()]);
    const { queryByLabelText, queryByText } = render(<ClassSchedule studentId="kid-1" defaultOpen />);
    expect(queryByLabelText('Request an add/drop')).toBeTruthy();
    expect(queryByText(/Add\/drop closes after September 8, 2026/)).toBeTruthy();
  });

  it('is absent once the deadline has passed', () => {
    // The server decides this, in the school's own timezone.
    withSchedules([inWindow({ open: false })]);
    const { queryByLabelText } = render(<ClassSchedule studentId="kid-1" defaultOpen />);
    expect(queryByLabelText('Request an add/drop')).toBeNull();
  });

  it('is absent for a school that never opened an add/drop period', () => {
    withSchedules([MADELEINE]);
    const { queryByLabelText } = render(<ClassSchedule studentId="kid-1" defaultOpen />);
    expect(queryByLabelText('Request an add/drop')).toBeNull();
  });

  it('says the request is in rather than inviting a duplicate', () => {
    withSchedules([inWindow({ pending: true })]);
    const { queryByLabelText, queryByText } = render(<ClassSchedule studentId="kid-1" defaultOpen />);
    expect(queryByText('Your add/drop request is in')).toBeTruthy();
    expect(queryByLabelText('Request an add/drop')).toBeNull();
    expect(queryByText('Send another request')).toBeTruthy();
  });
});

describe('the school hub is unchanged', () => {
  it('still lists every child when no studentId is given', () => {
    withSchedules([MADELEINE, CHARLOTTE]);
    const { queryByTestId } = render(<ClassSchedule defaultOpen />);
    expect(queryByTestId('section-toggle-Madeleine Myers')).toBeTruthy();
    expect(queryByTestId('section-toggle-Charlotte Myers')).toBeTruthy();
  });

  it('renders nothing while loading', () => {
    mockUseClassSchedule.mockReturnValue({ schedules: [], loading: true, hasAny: false });
    const { queryByTestId } = render(<ClassSchedule studentId="kid-1" />);
    expect(queryByTestId('class-schedule')).toBeNull();
  });

  it('renders nothing for a family with no SIS classes at all', () => {
    mockUseClassSchedule.mockReturnValue({ schedules: [], loading: false, hasAny: false });
    const { queryByTestId } = render(<ClassSchedule studentId="kid-1" />);
    expect(queryByTestId('class-schedule')).toBeNull();
  });
});
