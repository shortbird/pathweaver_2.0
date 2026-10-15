/**
 * Invite screen (/invite/:code), signed out.
 *
 * Ticket 93b118fa: the screen used to POST each typed email to
 * /invitations/check-email, a signed-out endpoint that said whether the email
 * had an Optio account (accounts can be children's). The endpoint is gone. The
 * screen now always shows the name fields, says an existing account holder may
 * leave them blank, and lets the accept route decide.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import api from '@/src/services/api';
import { clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import AcceptInvitationScreen from '../[code]';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: {
    restore: jest.fn(),
    setTokens: jest.fn().mockResolvedValue(undefined),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
  },
}));

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;

beforeEach(() => {
  clearAuthState();
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ code: 'abc123' });
  mockGet.mockResolvedValue({
    data: {
      valid: true,
      invitation: {
        email: '', invited_name: '', role: 'parent', is_link_based: true,
        organization: { name: 'Test School', slug: 'test-school' },
      },
    },
  });
});

describe('AcceptInvitationScreen (signed out, link-based invite)', () => {
  it('shows the name fields with the leave-blank helper and never calls check-email', async () => {
    jest.useFakeTimers();
    try {
      const screen = render(<AcceptInvitationScreen />);
      await act(async () => { await Promise.resolve(); });
      const email = await screen.findByPlaceholderText('Enter your email');
      expect(screen.getByPlaceholderText('First name')).toBeTruthy();
      expect(screen.getByPlaceholderText('Last name')).toBeTruthy();
      expect(screen.getByText('Already have an Optio account? You can leave your name blank.')).toBeTruthy();

      fireEvent.changeText(email, 'someone@example.com');
      await act(async () => { jest.advanceTimersByTime(2000); });

      expect(mockPost).not.toHaveBeenCalled();
      expect(screen.getByPlaceholderText('First name')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('submits with blank names so the server can decide', async () => {
    mockPost.mockResolvedValue({ data: { success: true, existing_user: true } });
    const screen = render(<AcceptInvitationScreen />);
    fireEvent.changeText(await screen.findByPlaceholderText('Enter your email'), 'pat@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm your password'), 'password123');
    fireEvent.press(screen.getByText('Join'));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('/api/admin/organizations/invitations/accept/abc123');
    expect(body).toMatchObject({ email: 'pat@example.com', first_name: '', last_name: '' });
    expect(await screen.findByText('Log in to access your account.')).toBeTruthy();
  });
});
