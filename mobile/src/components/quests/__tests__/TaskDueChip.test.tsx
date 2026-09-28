/**
 * The due chip on a class quest task.
 *
 * Ticket 26c91e25 (owner-approved): class quest tasks can carry an optional
 * due date, one per task per class, set by the teacher on web. GET
 * /api/quests/<id> carries it on each task as `due_date` (ISO datetime or
 * null). The student sees "Due Tue, Oct 6"; an unfinished task past its date
 * reads "Past due"; a task with no date shows nothing.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { TaskDueChip, dueChipState } from '../TaskDueChip';
import { formatDueDate } from '@/src/utils/dueDate';

const NOW = new Date('2026-10-01T12:00:00Z');
const FUTURE = '2026-10-06T18:00:00+00:00';
const PAST = '2026-09-20T18:00:00+00:00';

describe('TaskDueChip', () => {
  it('renders the date for a dated task', () => {
    const due = '2099-10-06T18:00:00+00:00';
    const { getByText, getByTestId } = render(<TaskDueChip dueDate={due} isCompleted={false} />);
    expect(getByTestId('task-due-chip')).toBeTruthy();
    expect(getByText(`Due ${formatDueDate(due)}`)).toBeTruthy();
  });

  it('renders nothing when the task has no due date', () => {
    expect(render(<TaskDueChip dueDate={null} isCompleted={false} />).toJSON()).toBeNull();
    expect(render(<TaskDueChip isCompleted={false} />).toJSON()).toBeNull();
  });

  it('uses the past-due style for a past date on an incomplete task', () => {
    const { getByTestId, getByText } = render(
      <TaskDueChip dueDate="2020-01-06T18:00:00+00:00" isCompleted={false} />,
    );
    expect(getByTestId('task-due-chip-past')).toBeTruthy();
    expect(getByText(/^Past due/)).toBeTruthy();
  });

  it('a completed task past its date keeps the plain date', () => {
    const { queryByTestId, getByTestId } = render(
      <TaskDueChip dueDate="2020-01-06T18:00:00+00:00" isCompleted />,
    );
    expect(queryByTestId('task-due-chip-past')).toBeNull();
    expect(getByTestId('task-due-chip')).toBeTruthy();
  });

  it('formats as weekday, month and day', () => {
    const state = dueChipState(FUTURE, false, NOW)!;
    expect(state.pastDue).toBe(false);
    expect(state.text).toBe(
      `Due ${new Date(FUTURE).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`,
    );
    expect(dueChipState(PAST, false, NOW)!.pastDue).toBe(true);
    expect(dueChipState('not a date', false, NOW)).toBeNull();
  });

  it('reads a bare date as due at the end of that local day', () => {
    const today = new Date(2026, 9, 1, 15, 0, 0);
    expect(dueChipState('2026-10-01', false, today)!.pastDue).toBe(false);
  });
});
