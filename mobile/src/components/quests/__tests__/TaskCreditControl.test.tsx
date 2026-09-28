/**
 * The credit control on a completed task row, and the precheck sheet it opens.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import { TaskCreditControl } from '../TaskCreditControl';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

const status = (diploma_status: string | null) => ({
  data: { data: { has_completion: diploma_status !== null, diploma_status } },
});

beforeEach(() => jest.clearAllMocks());

describe('TaskCreditControl', () => {
  it('offers Request credit on a finished task nobody has sent yet', async () => {
    (api.get as jest.Mock).mockResolvedValue(status('none'));
    const { findByLabelText } = render(<TaskCreditControl taskId="t1" />);
    expect(await findByLabelText('Request credit')).toBeTruthy();
  });

  it('offers a resubmit after a reviewer asked for more', async () => {
    (api.get as jest.Mock).mockResolvedValue(status('grow_this'));
    const { findByLabelText, getByText } = render(<TaskCreditControl taskId="t1" />);
    expect(await findByLabelText('Resubmit for credit')).toBeTruthy();
    expect(getByText(/A reviewer asked for more/)).toBeTruthy();
  });

  it.each([
    ['pending_review', 'Credit requested · awaiting review'],
    ['pending_org_approval', 'Credit requested · awaiting your school'],
    ['finalized', 'Credit approved'],
  ])('shows where a %s request stands, with no button', async (s, label) => {
    (api.get as jest.Mock).mockResolvedValue(status(s));
    const { findByLabelText, queryByTestId } = render(<TaskCreditControl taskId="t1" />);
    expect(await findByLabelText(label)).toBeTruthy();
    expect(queryByTestId('request-credit-btn')).toBeNull();
  });

  it('renders nothing when the status cannot be read', async () => {
    (api.get as jest.Mock).mockRejectedValue(new Error('offline'));
    const { toJSON } = render(<TaskCreditControl taskId="t1" />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(toJSON()).toBeNull();
  });

  it('shows the preview, submits anyway, and then shows the request as pending', async () => {
    (api.get as jest.Mock).mockResolvedValue(status('none'));
    (api.post as jest.Mock)
      .mockResolvedValueOnce({ data: { data: {
        available: true,
        likelihood: 'needs_work',
        criteria: [{ criterion: 'Shows the finished bridge', verdict: 'not_met' }],
        suggestion: 'Add a photo of the bridge holding weight.',
        unread: [],
      } } })
      .mockResolvedValueOnce({ data: { data: { success: true, diploma_status: 'pending_review' } } });

    const { findByLabelText, findByText, getByText, getByLabelText } = render(<TaskCreditControl taskId="t1" />);
    // fireEvent supplies no synthetic event; the handler calls stopPropagation.
    fireEvent.press(await findByLabelText('Request credit'), { stopPropagation: () => {} });

    expect(await findByText('Might come back for more work')).toBeTruthy();
    expect(getByText('Shows the finished bridge')).toBeTruthy();
    expect(getByText('Not shown yet')).toBeTruthy();
    expect(getByText('Add a photo of the bridge holding weight.')).toBeTruthy();

    fireEvent.press(getByLabelText('Submit for review anyway'));
    expect(await findByLabelText('Credit requested · awaiting review')).toBeTruthy();
    expect(api.post).toHaveBeenLastCalledWith('/api/tasks/t1/request-credit', {});
  });
});
