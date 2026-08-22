/**
 * Tests for PhoneVerificationHost — the stopgap screen for adults their school
 * holds for phone verification.
 *
 * The backend gate shipped ahead of any mobile flow, so a held adult logged in
 * and then hit 403 on every screen with nothing to show for it. These cover the
 * two ways the app learns it is held, and the two ways the hold lifts.
 */

import React from 'react';
import { render, screen, waitFor, act, fireEvent, configure } from '@testing-library/react-native';

// Every findBy/waitFor here waits on a Modal-wrapped SafeAreaView render, which
// is exactly the heavy cold-start jest.config.js raised testTimeout for. That
// raise does not reach these helpers: they have their own 1s budget. Give them
// CI's contention headroom too — a passing assertion still returns immediately.
configure({ asyncUtilTimeout: 10000 });

const mockGet = jest.fn();
let mockHoldListener: (() => void) | null = null;

jest.mock('@/src/services/api', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockGet(...args) },
  onPhoneVerificationRequired: (fn: () => void) => {
    mockHoldListener = fn;
    return () => {
      mockHoldListener = null;
    };
  },
}));

const mockLogout = jest.fn();
let mockAuthState = { isAuthenticated: true, user: { id: 'u-1' }, logout: mockLogout };
jest.mock('@/src/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(mockAuthState),
}));

import { PhoneVerificationHost } from '../PhoneVerificationHost';

const HELD = { data: { required: true, verified: false } };
const CLEAR = { data: { required: false, verified: false } };

beforeEach(() => {
  jest.clearAllMocks();
  mockHoldListener = null;
  mockAuthState = { isAuthenticated: true, user: { id: 'u-1' }, logout: mockLogout };
});

describe('PhoneVerificationHost', () => {
  it('tells a held adult to verify on the website', async () => {
    mockGet.mockResolvedValue(HELD);
    render(<PhoneVerificationHost />);
    expect(await screen.findByText('Verify your phone number')).toBeTruthy();
    expect(screen.getByText('Open the Optio website')).toBeTruthy();
  });

  it('stays out of the way of everybody else', async () => {
    mockGet.mockResolvedValue(CLEAR);
    render(<PhoneVerificationHost />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.queryByText('Verify your phone number')).toBeNull();
  });

  it('catches the adult who was already in the app when the school turned it on', async () => {
    // Their status check said clear; a 403 arrives later from any request.
    mockGet.mockResolvedValue(CLEAR);
    render(<PhoneVerificationHost />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    await act(async () => {
      mockHoldListener?.();
    });
    expect(await screen.findByText('Verify your phone number')).toBeTruthy();
  });

  it('lets them back in once they have verified on the web', async () => {
    // Driven by what the server would say at the time, not by call order:
    // chaining mockResolvedValueOnce assumes the mount effect runs exactly
    // once, and when it ran twice the "Check again" call fell through to an
    // undefined mock. Passed locally, failed in CI on timing alone.
    let verifiedOnWeb = false;
    mockGet.mockImplementation(async () => (verifiedOnWeb ? CLEAR : HELD));
    render(<PhoneVerificationHost />);
    await screen.findByText('Verify your phone number');

    verifiedOnWeb = true;
    // act() rather than waitFor(): this screen is a Modal wrapping a
    // SafeAreaView, and tearing that down took longer than waitFor's 1s default
    // under CI's worker contention — the same heavy-render flake jest.config's
    // testTimeout comment describes. Flushing the update instead of polling for
    // it takes the clock out of the assertion altogether.
    await act(async () => {
      fireEvent.press(screen.getByText('Check again'));
    });
    expect(screen.queryByText('Verify your phone number')).toBeNull();
  });

  it('does not hold anyone when the status check fails', async () => {
    // A network blip must not lock somebody out of their own app; the
    // middleware still holds the real line.
    mockGet.mockRejectedValue(new Error('offline'));
    render(<PhoneVerificationHost />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.queryByText('Verify your phone number')).toBeNull();
  });

  it('shows nothing to a signed-out user', async () => {
    mockAuthState = { isAuthenticated: false, user: undefined as never, logout: mockLogout };
    render(<PhoneVerificationHost />);
    expect(screen.queryByText('Verify your phone number')).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('offers a way out for someone who cannot verify', async () => {
    mockGet.mockResolvedValue(HELD);
    render(<PhoneVerificationHost />);
    await screen.findByText('Verify your phone number');
    fireEvent.press(screen.getByText('Sign out'));
    expect(mockLogout).toHaveBeenCalled();
  });
});
