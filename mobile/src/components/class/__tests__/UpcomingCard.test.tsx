/**
 * The dashboard's Upcoming card.
 *
 * Ticket 26c91e25 (owner-approved): class quests and class quest tasks can
 * carry due dates. GET /api/student/agenda lists what is still owed. Upcoming
 * items come first, soonest first; past-due items sit at the BOTTOM until they
 * are done (owner decision). An empty list renders nothing, so an org with no
 * due dates sees no change on Home.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { UpcomingCard } from '../UpcomingCard';
import { toAgendaItem, orderAgenda, type AgendaItem } from '@/src/hooks/useStudentAgenda';

const mockRouter = require('expo-router').router;

const NOW = new Date('2026-10-01T12:00:00Z');

const rows = [
  { kind: 'quest', class_id: 'c1', class_name: 'English 9', quest_id: 'q-late', quest_title: 'Poetry Unit', due_date: '2026-09-25T18:00:00Z' },
  { kind: 'task', class_id: 'c1', class_name: 'English 9', quest_id: 'q-book', quest_title: 'The Hobbit', task_id: 't-2', task_title: 'Chapters 6-10', due_date: '2026-10-10T18:00:00Z' },
  { kind: 'task', class_id: 'c1', class_name: 'English 9', quest_id: 'q-book', quest_title: 'The Hobbit', task_id: 't-1', task_title: 'Chapters 1-5', due_date: '2026-10-03T18:00:00Z' },
  { kind: 'task', class_id: 'c2', class_name: 'Science', quest_id: 'q-lab', title: 'Lab Report', task_id: 't-9', task_title: 'Write it up', due_date: '2026-09-28T18:00:00Z' },
];
const items = rows.map(toAgendaItem).filter(Boolean) as AgendaItem[];

describe('orderAgenda', () => {
  it('puts upcoming first, soonest first, and past due at the bottom', () => {
    const { upcoming, pastDue } = orderAgenda(items, NOW);
    expect(upcoming.map((i) => i.taskTitle)).toEqual(['Chapters 1-5', 'Chapters 6-10']);
    expect(pastDue.map((i) => i.questTitle)).toEqual(['Poetry Unit', 'Lab Report']);
  });
});

describe('toAgendaItem', () => {
  it('reads the pre-26c91e25 `title` as the quest title', () => {
    expect(toAgendaItem(rows[3])!.questTitle).toBe('Lab Report');
  });

  it('drops rows with no quest or no date', () => {
    expect(toAgendaItem({ quest_id: 'q', due_date: null })).toBeNull();
    expect(toAgendaItem({ due_date: '2026-10-01T00:00:00Z' })).toBeNull();
  });
});

describe('UpcomingCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing for an empty list', () => {
    expect(render(<UpcomingCard items={[]} now={NOW} />).toJSON()).toBeNull();
  });

  it('renders rows in order, with past due at the bottom', () => {
    const r = render(<UpcomingCard items={items} now={NOW} />);
    const texts = r
      .getAllByText(/^(Chapters 1-5|Chapters 6-10|Past due|Poetry Unit|Write it up)$/)
      .map((n) => n.props.children);
    expect(texts).toEqual(['Chapters 1-5', 'Chapters 6-10', 'Past due', 'Poetry Unit', 'Write it up']);
  });

  it('shows a task with its quest title underneath', () => {
    const r = render(<UpcomingCard items={items} now={NOW} />);
    expect(r.getByText('Chapters 1-5')).toBeTruthy();
    expect(r.getAllByText('The Hobbit')).toHaveLength(2);
  });

  it('tapping a row opens its quest', () => {
    const r = render(<UpcomingCard items={items} now={NOW} />);
    fireEvent.press(r.getByTestId('upcoming-item-c1:q-book:t-1'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/quests/q-book');
  });
});
