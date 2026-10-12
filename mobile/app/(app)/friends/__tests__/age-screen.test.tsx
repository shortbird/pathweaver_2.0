/**
 * The Friends age screen. The answer locks on the server, so the screen reads
 * it back as an age before it sends, and refuses a date that makes the user
 * younger than five: a parent testing the app locked an account at age zero
 * (bounty report, 2026-09-09).
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import FriendsScreen from '../index';
import { useFriends } from '@/src/hooks/useFriends';
import { confirmAlert, showAlert } from '@/src/utils/alerts';

jest.mock('@/src/hooks/useFriends', () => ({ useFriends: jest.fn(), askParent: jest.fn() }));
jest.mock('@/src/utils/alerts', () => ({ showAlert: jest.fn(), confirmAlert: jest.fn() }));

const submitDob = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (useFriends as jest.Mock).mockReturnValue({
    eligibility: { state: 'needs_dob', reason: 'x' },
    connections: { active: [], incoming: [], outgoing: [], awaiting_approval: [] },
    loading: false, busy: false, error: null,
    refetch: jest.fn(), respond: jest.fn(), revoke: jest.fn(), submitDob,
  });
});

const enter = async (value: string) => {
  const screen = render(<FriendsScreen />);
  fireEvent.changeText(screen.getByLabelText("What's your date of birth?"), value);
  await act(async () => { fireEvent.press(screen.getByText('Continue')); });
  return screen;
};

describe('the Friends age screen', () => {
  it("refuses this year's date without sending it", async () => {
    await enter(`${new Date().getFullYear()}-01-01`);
    expect(showAlert).toHaveBeenCalledWith('Please check the year', expect.any(String));
    expect(confirmAlert).not.toHaveBeenCalled();
    expect(submitDob).not.toHaveBeenCalled();
  });

  it('reads the age back and sends nothing on "Change it"', async () => {
    (confirmAlert as jest.Mock).mockResolvedValue(false);
    await enter(`${new Date().getFullYear() - 15}-01-01`);
    expect((confirmAlert as jest.Mock).mock.calls[0][0].title).toMatch(/1[45] years old/);
    expect(submitDob).not.toHaveBeenCalled();
  });

  it('sends the date on "Yes, save it"', async () => {
    (confirmAlert as jest.Mock).mockResolvedValue(true);
    const dob = `${new Date().getFullYear() - 15}-01-01`;
    await enter(dob);
    expect(submitDob).toHaveBeenCalledWith(dob);
  });
});
