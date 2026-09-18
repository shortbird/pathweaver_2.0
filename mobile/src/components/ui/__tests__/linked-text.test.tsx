/**
 * LinkedText: inline URLs in typed text become tappable, opened safely.
 */

import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { LinkedText } from '../linked-text';

const mockOpen = jest.fn();
jest.mock('@/src/utils/linking', () => ({
  safeOpenURL: (u: string) => mockOpen(u),
}));
jest.mock('../toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

beforeEach(() => jest.clearAllMocks());

it('renders plain text untouched', () => {
  render(<LinkedText>Just words</LinkedText>);
  expect(screen.getByText('Just words')).toBeTruthy();
  expect(screen.queryByTestId('linked-text-link')).toBeNull();
});

it('makes the URL a link and opens it through safeOpenURL', async () => {
  mockOpen.mockResolvedValue(true);
  render(<LinkedText>Sign up: https://forms.gle/abc.</LinkedText>);
  const link = screen.getByTestId('linked-text-link');
  expect(link.props.children).toBe('https://forms.gle/abc');
  fireEvent.press(link);
  await waitFor(() => expect(mockOpen).toHaveBeenCalledWith('https://forms.gle/abc'));
});

it('tells the person when the link would not open', async () => {
  mockOpen.mockResolvedValue(false);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { toast } = require('../toast');
  render(<LinkedText>https://nowhere.invalid/x</LinkedText>);
  fireEvent.press(screen.getByTestId('linked-text-link'));
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
});
