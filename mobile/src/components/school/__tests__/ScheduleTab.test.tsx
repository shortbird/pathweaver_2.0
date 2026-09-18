/**
 * The Schedule tab: pick a child, see their week, say when they will be out.
 *
 * Schedule and Absence were two chips on the hub until 2026-09-18. Covered:
 * the picker shows every child and switches the week, a child with no
 * classes says so rather than showing nothing, a lone schedule gets no
 * picker, and the absence report opens from the child on screen with that
 * child already chosen.
 */

import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react-native';
import { ScheduleTab } from '../ScheduleTab';
import type { StudentSchedule } from '@/src/hooks/useClassSchedule';

const mockUseClassSchedule = jest.fn();
jest.mock('@/src/hooks/useClassSchedule', () => ({
  ...jest.requireActual('@/src/hooks/useClassSchedule'),
  useClassSchedule: (...args: unknown[]) => mockUseClassSchedule(...args),
}));

const mockSelectStudents = jest.fn();
const mockCancel = jest.fn();
let mockAbsences: any;
jest.mock('@/src/hooks/useSchool', () => ({
  ...jest.requireActual('@/src/hooks/useSchool'),
  useSchoolAbsences: () => mockAbsences,
}));

jest.mock('@/src/components/school/AbsenceReportSheet', () => ({
  AbsenceReportSheet: ({ visible }: { visible: boolean }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Text } = require('react-native');
    return visible ? <Text testID="absence-sheet">sheet</Text> : null;
  },
}));

const meeting = (day: number, start: string, location?: string) => ({
  day_of_week: day, start_time: start, end_time: null, location: location ?? null,
});

const student = (id: string, name: string, classes: string[]): StudentSchedule => ({
  student_id: id,
  student_name: name,
  classes: classes.map((n, i) => ({
    id: `c-${id}-${i}`, name: n, meetings: [meeting(1 + i, '10:30:00', 'Room 3')],
  })),
});

const MADELEINE = student('kid-1', 'Madeleine Myers', ['Pottery']);
const CHARLOTTE = student('kid-2', 'Charlotte Myers', ['Earth Science']);
const NEWCOMER = student('kid-3', 'Theo Myers', []);

const withSchedules = (schedules: StudentSchedule[], loading = false) =>
  mockUseClassSchedule.mockReturnValue({
    schedules, loading, hasAny: schedules.some((s) => s.classes.length > 0), refresh: jest.fn(),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockAbsences = {
    students: [
      { student_id: 'kid-1', name: 'Madeleine Myers' },
      { student_id: 'kid-2', name: 'Charlotte Myers' },
      { student_id: 'kid-3', name: 'Theo Myers' },
    ],
    studentIds: ['kid-1'],
    selectStudents: mockSelectStudents,
    toggleStudent: jest.fn(),
    byStudent: {
      'kid-2': {
        absences: [
          { id: 'ab-1', absence_date: '2026-09-24', class_id: null, reason: 'Dentist' },
          { id: 'ab-2', absence_date: '2026-09-25', class_id: null, reason: 'Dentist' },
        ],
        classes: [],
      },
    },
    absences: [],
    classes: [],
    orgName: 'iCreate',
    loading: false,
    error: null,
    report: jest.fn(),
    cancel: mockCancel,
  };
});

describe('picking a child', () => {
  it('lists every child and opens on the first', () => {
    withSchedules([MADELEINE, CHARLOTTE]);
    render(<ScheduleTab organizationId="org-1" />);
    expect(screen.getByTestId('schedule-child-kid-1')).toBeTruthy();
    expect(screen.getByTestId('schedule-child-kid-2')).toBeTruthy();
    expect(screen.getByText('Pottery')).toBeTruthy();
    expect(screen.queryByText('Earth Science')).toBeNull();
  });

  it('switches the week to the child tapped', () => {
    withSchedules([MADELEINE, CHARLOTTE]);
    render(<ScheduleTab organizationId="org-1" />);
    fireEvent.press(screen.getByTestId('schedule-child-kid-2'));
    expect(screen.getByText('Earth Science')).toBeTruthy();
    expect(screen.queryByText('Pottery')).toBeNull();
  });

  it('opens on the child a deep link asks for', () => {
    withSchedules([MADELEINE, CHARLOTTE]);
    render(<ScheduleTab organizationId="org-1" initialStudentId="kid-2" />);
    expect(screen.getByText('Earth Science')).toBeTruthy();
  });

  it('shows no picker over a single schedule', () => {
    withSchedules([MADELEINE]);
    render(<ScheduleTab organizationId="org-1" />);
    expect(screen.queryByTestId('schedule-child-kid-1')).toBeNull();
    expect(screen.getByText('Pottery')).toBeTruthy();
  });
});

describe('what the week shows', () => {
  it('says so when the child has no classes yet', () => {
    withSchedules([MADELEINE, NEWCOMER]);
    render(<ScheduleTab organizationId="org-1" />);
    fireEvent.press(screen.getByTestId('schedule-child-kid-3'));
    expect(screen.getByTestId('schedule-no-classes')).toBeTruthy();
    expect(screen.getByText("No classes on Theo Myers's schedule yet.")).toBeTruthy();
  });

  it('offers printing under a week that has classes', () => {
    withSchedules([MADELEINE]);
    render(<ScheduleTab organizationId="org-1" />);
    expect(screen.getByLabelText('Print or save as PDF')).toBeTruthy();
  });

  it('never links out to the web schedule builder', () => {
    withSchedules([MADELEINE, CHARLOTTE]);
    render(<ScheduleTab organizationId="org-1" />);
    expect(screen.queryByText(/on the web/)).toBeNull();
  });

  it('tells a family with nobody to schedule, rather than showing a blank page', () => {
    withSchedules([]);
    render(<ScheduleTab organizationId="org-1" />);
    expect(screen.getByTestId('schedule-empty')).toBeTruthy();
  });

  it('shows nothing but the spinner while loading', () => {
    withSchedules([], true);
    render(<ScheduleTab organizationId="org-1" />);
    expect(screen.queryByTestId('schedule-empty')).toBeNull();
    expect(screen.queryByTestId('schedule-week')).toBeNull();
  });
});

describe('absences, under the week they interrupt', () => {
  it('starts the report from the child on screen', () => {
    withSchedules([MADELEINE, CHARLOTTE]);
    render(<ScheduleTab organizationId="org-1" />);
    expect(mockSelectStudents).toHaveBeenLastCalledWith(['kid-1']);
    fireEvent.press(screen.getByTestId('schedule-child-kid-2'));
    expect(mockSelectStudents).toHaveBeenLastCalledWith(['kid-2']);
  });

  it('opens the report sheet from under the week', async () => {
    withSchedules([MADELEINE]);
    render(<ScheduleTab organizationId="org-1" />);
    expect(screen.queryByTestId('absence-sheet')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('schedule-report-absence'));
    });
    expect(screen.getByTestId('absence-sheet')).toBeTruthy();
  });

  it('lists this child\'s reported absences as one range, with a way to cancel', () => {
    withSchedules([MADELEINE, CHARLOTTE]);
    render(<ScheduleTab organizationId="org-1" />);
    expect(screen.getByText('None reported.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('schedule-child-kid-2'));
    expect(screen.getByText(/2026-09-24 – 2026-09-25/)).toBeTruthy();
    expect(screen.getByText('Dentist')).toBeTruthy();
    expect(screen.getByTestId('absence-cancel-ab-1')).toBeTruthy();
  });

  it('is not offered to a student looking at their own week', () => {
    withSchedules([{ student_id: 'me', student_name: 'My schedule', classes: MADELEINE.classes }]);
    render(<ScheduleTab organizationId="org-1" />);
    expect(screen.queryByTestId('schedule-absences')).toBeNull();
  });
});
