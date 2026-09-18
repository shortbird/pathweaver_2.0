/**
 * Tests for PaperworkHost — the stopgap screen for guardians their school
 * holds for unsigned required paperwork.
 *
 * The backend gate shipped ahead of any mobile flow, so a held parent logged
 * in and then hit 403 on every screen with nothing to show for it (iCreate,
 * 2026-08-24). These cover the two ways the app learns it is held, and the
 * two ways the hold lifts. Mirrors PhoneVerificationHost.test.tsx.
 */

import React from 'react';
import { render, screen, waitFor, act, fireEvent, configure } from '@testing-library/react-native';

import { PaperworkHost } from '../PaperworkHost';

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
  onSignatureRequired: (fn: () => void) => {
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

let mockActingAs = { isActive: false, mode: null as 'masquerade' | null };
jest.mock('@/src/stores/actingAsStore', () => {
  const useActingAsStore = (selector: (s: unknown) => unknown) => selector(mockActingAs);
  useActingAsStore.getState = () => mockActingAs;
  return { useActingAsStore };
});

const HELD = { data: { blocked: true, assignments: [{ id: 'a-1' }] } };
const CLEAR = { data: { blocked: false, assignments: [] } };

beforeEach(() => {
  jest.clearAllMocks();
  mockHoldListener = null;
  mockAuthState = { isAuthenticated: true, user: { id: 'u-1' }, logout: mockLogout };
  mockActingAs = { isActive: false, mode: null };
});

describe('PaperworkHost', () => {
  it('tells a held parent to finish the paperwork on the website', async () => {
    mockGet.mockResolvedValue(HELD);
    render(<PaperworkHost />);
    expect(await screen.findByText('You have unfinished paperwork')).toBeTruthy();
    expect(screen.getByText('Open www.optioeducation.com')).toBeTruthy();
  });

  it('stays out of the way of everybody else', async () => {
    mockGet.mockResolvedValue(CLEAR);
    render(<PaperworkHost />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.queryByText('You have unfinished paperwork')).toBeNull();
  });

  it('catches the parent who was already in the app when the document was sent', async () => {
    // Their status check said clear; a 403 arrives later from any request.
    mockGet.mockResolvedValue(CLEAR);
    render(<PaperworkHost />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    await act(async () => {
      mockHoldListener?.();
    });
    expect(await screen.findByText('You have unfinished paperwork')).toBeTruthy();
  });

  it('lets them back in once they have signed on the web', async () => {
    // Driven by what the server would say at the time, not by call order —
    // see the identical note in PhoneVerificationHost.test.tsx.
    let signedOnWeb = false;
    mockGet.mockImplementation(async () => (signedOnWeb ? CLEAR : HELD));
    render(<PaperworkHost />);
    await screen.findByText('You have unfinished paperwork');

    signedOnWeb = true;
    // act() rather than waitFor(): this screen is a Modal wrapping a
    // SafeAreaView, and tearing that down took longer than waitFor's 1s
    // default under CI's worker contention (see the phone host's test).
    await act(async () => {
      fireEvent.press(screen.getByText('Check again'));
    });
    expect(screen.queryByText('You have unfinished paperwork')).toBeNull();
  });

  it('does not hold anyone when the status check fails', async () => {
    // A network blip must not lock somebody out of their own app; the
    // middleware still holds the real line.
    mockGet.mockRejectedValue(new Error('offline'));
    render(<PaperworkHost />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.queryByText('You have unfinished paperwork')).toBeNull();
  });

  it('shows nothing to a signed-out user', async () => {
    mockAuthState = { isAuthenticated: false, user: undefined as never, logout: mockLogout };
    render(<PaperworkHost />);
    expect(screen.queryByText('You have unfinished paperwork')).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('offers a way out for someone who cannot sign online', async () => {
    mockGet.mockResolvedValue(HELD);
    render(<PaperworkHost />);
    await screen.findByText('You have unfinished paperwork');
    fireEvent.press(screen.getByText('Sign out'));
    expect(mockLogout).toHaveBeenCalled();
  });
});

describe('an admin masquerading as a held guardian', () => {
  // An admin must not sign a family's paperwork for them, so the hold must
  // never come up over a masquerade (same rule as PhoneVerificationHost).

  it('is not asked about, let alone held', async () => {
    mockActingAs = { isActive: true, mode: 'masquerade' };
    mockAuthState = { isAuthenticated: true, user: { id: 'held-parent' }, logout: mockLogout };
    mockGet.mockResolvedValue(HELD);
    render(<PaperworkHost />);
    await act(async () => {});
    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.queryByText('You have unfinished paperwork')).toBeNull();
  });

  it('ignores a stray 403 raised during the masquerade', async () => {
    mockActingAs = { isActive: true, mode: 'masquerade' };
    render(<PaperworkHost />);
    await act(async () => {
      mockHoldListener?.();
    });
    expect(screen.queryByText('You have unfinished paperwork')).toBeNull();
  });

  it('drops the screen when a masquerade starts over a held session', async () => {
    mockGet.mockResolvedValue(HELD);
    const view = render(<PaperworkHost />);
    expect(await screen.findByText('You have unfinished paperwork')).toBeTruthy();

    mockActingAs = { isActive: true, mode: 'masquerade' };
    mockAuthState = { isAuthenticated: true, user: { id: 'held-parent' }, logout: mockLogout };
    view.rerender(<PaperworkHost />);
    await waitFor(() => expect(screen.queryByText('You have unfinished paperwork')).toBeNull());
  });
});
