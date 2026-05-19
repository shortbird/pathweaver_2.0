/**
 * Teacher SpeedGrader evidence page — token gating + quest-scoped render.
 */

jest.mock('@/src/services/api', () => ({
  api: { defaults: { baseURL: 'http://test.local' } },
}));

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import LtiEvidence from '../lti-evidence';

const PAYLOAD = {
  student: { display_name: 'Jane Doe' },
  quest: { id: 'q1', title: 'Build Something You Care About' },
  earned_xp: 300,
  tasks: [
    {
      id: 't1',
      title: 'Learn the rules',
      pillar: 'stem',
      xp_value: 100,
      is_completed: true,
      completed_at: '2026-05-19T00:00:00Z',
      evidence_blocks: [
        { block_type: 'text', content: { text: 'I did the thing.' }, order_index: 0 },
        { block_type: 'link', content: { url: 'https://example.com', title: 'My repo' }, order_index: 1 },
      ],
    },
  ],
};

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

afterEach(() => jest.clearAllMocks());

describe('LtiEvidence (SpeedGrader)', () => {
  it('errors when no token in the URL (never calls the API)', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    mockFetch(200, PAYLOAD);
    const { getByTestId } = render(<LtiEvidence />);
    await waitFor(() => expect(getByTestId('lti-shell-error')).toBeTruthy());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows an error on 401 (invalid/expired token) without leaking data', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ lti_token: 'bad' });
    mockFetch(401, { error: 'Invalid or missing evidence token' });
    const { getByTestId, queryByText } = render(<LtiEvidence />);
    await waitFor(() => expect(getByTestId('lti-shell-error')).toBeTruthy());
    expect(queryByText('Jane Doe')).toBeNull();
  });

  it('renders quest-scoped evidence on success', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ lti_token: 'good' });
    mockFetch(200, PAYLOAD);
    const { getByText, queryByText } = render(<LtiEvidence />);
    await waitFor(() =>
      expect(getByText('Build Something You Care About')).toBeTruthy(),
    );
    expect(getByText('Jane Doe')).toBeTruthy();
    expect(getByText('300 XP earned')).toBeTruthy();
    expect(getByText('Learn the rules')).toBeTruthy();
    expect(getByText('I did the thing.')).toBeTruthy();
    expect(getByText('🔗 My repo')).toBeTruthy();
    // Token went to the LTI evidence endpoint, not /public/diploma.
    expect(global.fetch).toHaveBeenCalledWith(
      'http://test.local/lti/evidence?lti_token=good',
    );
    expect(queryByText('portfolio')).toBeNull();
  });
});
