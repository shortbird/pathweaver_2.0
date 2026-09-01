/**
 * PhoneVerificationHost — the screen an adult sees while their school holds
 * them for phone verification.
 *
 * The backend gate shipped ahead of any mobile flow, so a held adult logged in
 * and then hit 403 on every screen with nothing to show for it. The first fix
 * was a stopgap that could only point at a browser; the flow now runs here.
 *
 * Covered: the two ways the app learns it is held, the two steps that lift the
 * hold, and every way the flow can refuse — because this screen is the only
 * thing a held adult can reach, so a dead end here is a dead end full stop.
 */

import React from 'react';
import {
  render, screen, waitFor, act, fireEvent, configure,
} from '@testing-library/react-native';

import { PhoneVerificationHost } from '../PhoneVerificationHost';

// Every findBy/waitFor here waits on a Modal-wrapped SafeAreaView render, which
// is exactly the heavy cold-start jest.config.js raised testTimeout for. That
// raise does not reach these helpers: they have their own 1s budget. Give them
// CI's contention headroom too — a passing assertion still returns immediately.
configure({ asyncUtilTimeout: 10000 });

const mockGet = jest.fn();
const mockPost = jest.fn();
let mockHoldListener: (() => void) | null = null;

jest.mock('@/src/services/api', () => ({
  __esModule: true,
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
  onPhoneVerificationRequired: (fn: () => void) => {
    mockHoldListener = fn;
    return () => {
      mockHoldListener = null;
    };
  },
}));

// The mocks are built INSIDE the factory: jest.mock is hoisted above the
// const declarations, so a factory closing over an outer object captures
// undefined.
jest.mock('@/src/components/ui', () => {
  const actual = jest.requireActual('@/src/components/ui');
  return { ...actual, toast: { success: jest.fn(), error: jest.fn() } };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockToast = require('@/src/components/ui').toast as {
  success: jest.Mock; error: jest.Mock;
};

const mockLogout = jest.fn();
let mockAuthState = { isAuthenticated: true, user: { id: 'u-1' }, logout: mockLogout };
jest.mock('@/src/stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector(mockAuthState),
}));

const HELD = { data: { required: true, verified: false } };
const CLEAR = { data: { required: false, verified: false } };

/** Render held, and get as far as the code step with a code typed in. */
const reachCodeStep = async (typed = '123456') => {
  mockGet.mockResolvedValue(HELD);
  mockPost.mockResolvedValue({ data: { success: true, phone: '••• ••• 4567' } });
  render(<PhoneVerificationHost />);
  await screen.findByText('Verify your phone number');
  fireEvent.changeText(screen.getByTestId('phone-input'), '8015550123');
  await act(async () => {
    fireEvent.press(screen.getByText('Text me a code'));
  });
  fireEvent.changeText(screen.getByTestId('code-input'), typed);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockHoldListener = null;
  mockAuthState = { isAuthenticated: true, user: { id: 'u-1' }, logout: mockLogout };
});

describe('learning it is held', () => {
  it('shows the flow to a held adult', async () => {
    mockGet.mockResolvedValue(HELD);
    render(<PhoneVerificationHost />);
    expect(await screen.findByText('Verify your phone number')).toBeTruthy();
    expect(screen.getByTestId('phone-input')).toBeTruthy();
  });

  it('stays out of the way of everybody else', async () => {
    mockGet.mockResolvedValue(CLEAR);
    render(<PhoneVerificationHost />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.queryByText('Verify your phone number')).toBeNull();
  });

  it('catches the adult who was already in the app when the school turned it on', async () => {
    mockGet.mockResolvedValue(CLEAR);
    render(<PhoneVerificationHost />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    await act(async () => {
      mockHoldListener?.();
    });
    expect(await screen.findByText('Verify your phone number')).toBeTruthy();
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
});

describe('sending the code', () => {
  it('prefills the number the school already has', async () => {
    // Saves a parent retyping the number they gave at registration.
    mockGet.mockResolvedValue({ data: { required: true, verified: false, prefill: '+18015550123' } });
    render(<PhoneVerificationHost />);
    await screen.findByText('Verify your phone number');
    await waitFor(() =>
      expect(screen.getByTestId('phone-input').props.value).toBe('+18015550123'));
  });

  it('texts the number and moves to the code step', async () => {
    await reachCodeStep();
    expect(mockPost).toHaveBeenCalledWith(
      '/api/phone-verification/send-code', { phone: '8015550123' });
    expect(screen.getByTestId('code-input')).toBeTruthy();
  });

  it('names the number it texted', async () => {
    await reachCodeStep();
    expect(screen.getByText('Enter the code we sent to ••• ••• 4567')).toBeTruthy();
  });

  it('surfaces the server’s complaint about a bad number', async () => {
    mockGet.mockResolvedValue(HELD);
    mockPost.mockRejectedValue({
      response: { data: { error: 'Enter a valid phone number, like 801-555-0123.' } },
    });
    render(<PhoneVerificationHost />);
    await screen.findByText('Verify your phone number');
    fireEvent.changeText(screen.getByTestId('phone-input'), 'nope');
    await act(async () => {
      fireEvent.press(screen.getByText('Text me a code'));
    });
    expect(mockToast.error).toHaveBeenCalledWith('Enter a valid phone number, like 801-555-0123.');
    // Still on the phone step — there is no code to type.
    expect(screen.queryByTestId('code-input')).toBeNull();
  });

  it('honours the server’s cooldown after too many requests', async () => {
    mockGet.mockResolvedValue(HELD);
    mockPost.mockRejectedValue({
      response: { data: { error: 'A code was just sent.', retry_after: 42 } },
    });
    render(<PhoneVerificationHost />);
    await screen.findByText('Verify your phone number');
    fireEvent.changeText(screen.getByTestId('phone-input'), '8015550123');
    await act(async () => {
      fireEvent.press(screen.getByText('Text me a code'));
    });
    // The button must not invite a press that cannot succeed.
    expect(screen.getByText('Wait 42s')).toBeTruthy();
  });
});

describe('entering the code', () => {
  it('lifts the hold when the code is right', async () => {
    await reachCodeStep();
    mockPost.mockResolvedValue({ data: { success: true, verified: true } });
    await act(async () => {
      fireEvent.press(screen.getByText('Verify'));
    });
    expect(mockPost).toHaveBeenLastCalledWith(
      '/api/phone-verification/verify', { code: '123456' });
    expect(screen.queryByText('Verify your phone number')).toBeNull();
  });

  it('keeps them here when the code is wrong', async () => {
    await reachCodeStep();
    mockPost.mockRejectedValue({ response: { data: { error: 'Incorrect code.' } } });
    await act(async () => {
      fireEvent.press(screen.getByText('Verify'));
    });
    expect(mockToast.error).toHaveBeenCalledWith('Incorrect code.');
    expect(screen.getByText('Verify your phone number')).toBeTruthy();
  });

  it('accepts only digits, and only six of them', async () => {
    await reachCodeStep('12ab34cd5678');
    expect(screen.getByTestId('code-input').props.value).toBe('123456');
  });

  it('can go back to correct the number', async () => {
    await reachCodeStep();
    fireEvent.press(screen.getByText('Use a different number'));
    expect(screen.getByTestId('phone-input')).toBeTruthy();
    expect(screen.queryByTestId('code-input')).toBeNull();
  });

  it('offers a resend, but not before the cooldown is up', async () => {
    await reachCodeStep();
    // sendCode set a 60s cooldown, so the resend is a countdown, not a button.
    expect(screen.getByText('Resend in 60s')).toBeTruthy();
  });

  it('shows the dev code when there is no real handset', async () => {
    // SMS_PROVIDER=console puts the code in the server log; without this the
    // flow cannot be finished locally at all.
    mockGet.mockResolvedValue(HELD);
    mockPost.mockResolvedValue({ data: { success: true, dev_code: '424242' } });
    render(<PhoneVerificationHost />);
    await screen.findByText('Verify your phone number');
    fireEvent.changeText(screen.getByTestId('phone-input'), '8015550123');
    await act(async () => {
      fireEvent.press(screen.getByText('Text me a code'));
    });
    expect(screen.getByText(/424242/)).toBeTruthy();
  });
});

describe('the way out', () => {
  it('offers sign out to someone who cannot verify', async () => {
    mockGet.mockResolvedValue(HELD);
    render(<PhoneVerificationHost />);
    await screen.findByText('Verify your phone number');
    fireEvent.press(screen.getByText('Sign out'));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('points at the office for someone with no phone at all', async () => {
    mockGet.mockResolvedValue(HELD);
    render(<PhoneVerificationHost />);
    await screen.findByText('Verify your phone number');
    expect(screen.getByText(/Contact your school office/)).toBeTruthy();
  });
});
