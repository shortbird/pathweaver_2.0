/**
 * Reset password screen tests - token handling, password validation,
 * success/error states.
 *
 * Covers issues found during v2 launch readiness audit:
 * - Reset password page was missing entirely
 * - Email link pointed to wrong port (localhost:3000 vs 8081)
 * - API field name mismatch (password vs new_password)
 */

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

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ResetPasswordScreen from '../reset-password';
import { clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { authAPI } from '@/src/services/api';

const mockUseLocalSearchParams = require('expo-router').useLocalSearchParams;
const mockRouter = require('expo-router').router;

beforeEach(() => {
  clearAuthState();
  jest.clearAllMocks();
});

describe('ResetPasswordScreen', () => {
  // ── No Token ──

  it('shows invalid link message when no token provided', () => {
    mockUseLocalSearchParams.mockReturnValue({});

    const { getByText } = render(<ResetPasswordScreen />);

    expect(getByText('Invalid Reset Link')).toBeTruthy();
    expect(getByText('Back to Login')).toBeTruthy();
  });

  it('navigates to login when back button pressed on invalid link', () => {
    mockUseLocalSearchParams.mockReturnValue({});

    const { getByText } = render(<ResetPasswordScreen />);
    fireEvent.press(getByText('Back to Login'));

    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login');
  });

  // ── With Token ──

  it('renders password form when token is present', () => {
    mockUseLocalSearchParams.mockReturnValue({ token: 'valid-token-123' });

    const { getByText, getByPlaceholderText } = render(<ResetPasswordScreen />);

    expect(getByText('Set New Password')).toBeTruthy();
    expect(getByPlaceholderText('Enter new password')).toBeTruthy();
    expect(getByPlaceholderText('Confirm new password')).toBeTruthy();
    expect(getByText('Reset Password')).toBeTruthy();
  });

  it('shows password strength indicators', () => {
    mockUseLocalSearchParams.mockReturnValue({ token: 'valid-token-123' });

    const { getByPlaceholderText, getByText } = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByPlaceholderText('Enter new password'), 'a');

    // Text includes Unicode bullet/check prefix, use regex for substring
    expect(getByText(/At least 12 characters/)).toBeTruthy();
    expect(getByText(/One uppercase letter/)).toBeTruthy();
    expect(getByText(/One number/)).toBeTruthy();
    expect(getByText(/One special character/)).toBeTruthy();
  });

  // ── Validation ──

  it('shows error for weak password', () => {
    mockUseLocalSearchParams.mockReturnValue({ token: 'valid-token-123' });

    const { getByText, getByPlaceholderText } = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByPlaceholderText('Enter new password'), 'short');
    fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'short');
    fireEvent.press(getByText('Reset Password'));

    expect(getByText('At least 12 characters')).toBeTruthy();
  });

  it('shows error when passwords do not match', () => {
    mockUseLocalSearchParams.mockReturnValue({ token: 'valid-token-123' });

    const { getByText, getByPlaceholderText } = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByPlaceholderText('Enter new password'), 'StrongPass123!');
    fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'DifferentPass!1');
    fireEvent.press(getByText('Reset Password'));

    expect(getByText('Passwords do not match')).toBeTruthy();
  });

  // ── API Integration ──

  it('calls resetPassword API with token and new_password', async () => {
    mockUseLocalSearchParams.mockReturnValue({ token: 'valid-token-123' });
    (authAPI.resetPassword as jest.Mock).mockResolvedValue({ data: { message: 'Success' } });

    const { getByText, getByPlaceholderText } = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByPlaceholderText('Enter new password'), 'StrongPass123!');
    fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'StrongPass123!');
    fireEvent.press(getByText('Reset Password'));

    await waitFor(() => {
      expect(authAPI.resetPassword).toHaveBeenCalledWith('valid-token-123', 'StrongPass123!');
    });
  });

  it('shows success message after successful reset', async () => {
    mockUseLocalSearchParams.mockReturnValue({ token: 'valid-token-123' });
    (authAPI.resetPassword as jest.Mock).mockResolvedValue({ data: { message: 'Success' } });

    const { getByText, getByPlaceholderText } = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByPlaceholderText('Enter new password'), 'StrongPass123!');
    fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'StrongPass123!');
    fireEvent.press(getByText('Reset Password'));

    await waitFor(() => {
      expect(getByText(/successfully reset/i)).toBeTruthy();
      expect(getByText('Sign In')).toBeTruthy();
    });
  });

  it('shows error when reset fails (expired token)', async () => {
    mockUseLocalSearchParams.mockReturnValue({ token: 'expired-token' });
    (authAPI.resetPassword as jest.Mock).mockRejectedValue({
      response: { data: { error: 'Reset link has expired. Please request a new password reset.' } },
    });

    const { getByText, getByPlaceholderText } = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByPlaceholderText('Enter new password'), 'StrongPass123!');
    fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'StrongPass123!');
    fireEvent.press(getByText('Reset Password'));

    await waitFor(() => {
      expect(getByText(/expired/i)).toBeTruthy();
    });
  });

  it('navigates to login after successful reset', async () => {
    mockUseLocalSearchParams.mockReturnValue({ token: 'valid-token-123' });
    (authAPI.resetPassword as jest.Mock).mockResolvedValue({ data: { message: 'Success' } });

    const { getByText, getByPlaceholderText } = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByPlaceholderText('Enter new password'), 'StrongPass123!');
    fireEvent.changeText(getByPlaceholderText('Confirm new password'), 'StrongPass123!');
    fireEvent.press(getByText('Reset Password'));

    await waitFor(() => {
      expect(getByText('Sign In')).toBeTruthy();
    });

    fireEvent.press(getByText('Sign In'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login');
  });
});
