/**
 * The Diploma Credit Tracker's Approved tab.
 *
 * The mobile tracker filtered on a status called 'approved' that the backend
 * never sends (finalized is the terminal state), so its "N approved" count
 * was always 0 and approved credit was never listed. With the tab, the note
 * a reviewer types on Approve is readable; the preview cap keeps a
 * long-enrolled student's profile from becoming a hundred-row list.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { DiplomaCreditTracker } from '../DiplomaCreditTracker';
import api from '@/src/services/api';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

const request = (overrides: Record<string, unknown>) => ({
  completion_id: overrides.completion_id,
  task_id: `task-${overrides.completion_id}`,
  quest_id: 'q1',
  task_title: overrides.task_title || `Task ${overrides.completion_id}`,
  quest_title: 'Bridges',
  pillar: 'stem',
  xp_value: 100,
  subjects: { science: 100 },
  revision_number: 1,
  credit_requested_at: '2026-09-10T10:00:00Z',
  latest_feedback: null,
  finalized_at: null,
  ...overrides,
});

const approved = (id: string, extra: Record<string, unknown> = {}) => request({
  completion_id: id, diploma_status: 'finalized',
  finalized_at: '2026-09-14T15:12:00Z', ...extra,
});

function renderTracker(requests: unknown[]) {
  (api.get as jest.Mock).mockResolvedValue({ data: { data: { credit_requests: requests } } });
  return render(<DiplomaCreditTracker />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DiplomaCreditTracker - Approved tab', () => {
  it('lists approved credit when nothing is waiting, and opens to the note', async () => {
    const screen = renderTracker([approved('a1', {
      task_title: 'Load test', latest_feedback: 'Clear method. The graph sold it.',
    })]);
    const row = await screen.findByText('Load test');
    expect(screen.getByText('All caught up!')).toBeTruthy();
    expect(screen.queryByText(/Complete tasks and request diploma credit/)).toBeNull();

    fireEvent.press(row);
    expect(screen.getByText('Clear method. The graph sold it.')).toBeTruthy();
    expect(screen.getByText(/^Approved /)).toBeTruthy();
  });

  it('shows no note box for an approval that came without one', async () => {
    const screen = renderTracker([approved('a1', { task_title: 'Load test' })]);
    fireEvent.press(await screen.findByText('Load test'));
    expect(screen.queryByText(/Teacher Feedback/)).toBeNull();
  });

  it('offers Approved beside Grow This, and Grow This wins the auto-select', async () => {
    const screen = renderTracker([
      request({ completion_id: 'g1', diploma_status: 'grow_this', task_title: 'Grow me',
                latest_feedback: 'Add the data table.' }),
      approved('a1', { task_title: 'Done one' }),
    ]);
    await screen.findByText('Grow me');
    expect(screen.getByText('Grow This (1)')).toBeTruthy();
    expect(screen.queryByText('Done one')).toBeNull();

    fireEvent.press(screen.getByText('Approved (1)'));
    expect(screen.getByText('Done one')).toBeTruthy();
    expect(screen.queryByText('Grow me')).toBeNull();
  });

  it('counts an org-stage request as pending rather than caught up', async () => {
    const screen = renderTracker([
      request({ completion_id: 'p1', diploma_status: 'pending_org_approval', task_title: 'Waiting' }),
    ]);
    await screen.findByText('Waiting');
    expect(screen.getByText('1 awaiting')).toBeTruthy();
    expect(screen.getByText('Awaiting Org Review')).toBeTruthy();
  });

  it('previews the newest approvals and shows the rest on request', async () => {
    const many = Array.from({ length: 10 }, (_, i) => approved(`a${i + 1}`));
    const screen = renderTracker(many);
    await screen.findByText('Task a1');
    expect(screen.getAllByText(/^Task a/)).toHaveLength(8);

    fireEvent.press(screen.getByText('Show all 10 approved'));
    await waitFor(() => expect(screen.getAllByText(/^Task a/)).toHaveLength(10));
    expect(screen.queryByText(/Show all/)).toBeNull();
  });
});
