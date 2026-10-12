/**
 * The student's "Parent or guardian" card on mobile: a student with no parent
 * can ask, a linked student sees who, a school's student sees nothing.
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import api from '@/src/services/api';
import { AddParentCard } from '../AddParentCard';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/utils/alerts', () => ({ showAlert: jest.fn(), confirmAlert: jest.fn() }));

const ok = (data: any) => Promise.resolve({ data: { success: true, data } });

beforeEach(() => jest.clearAllMocks());

describe('AddParentCard', () => {
  it('sends a request for a student with no parent', async () => {
    (api.get as jest.Mock)
      .mockReturnValueOnce(ok({ state: 'available', parents: [], request: null }))
      .mockReturnValueOnce(ok({ state: 'available', parents: [], request: { status: 'invited', parent_email: 'mom@example.com' } }));
    (api.post as jest.Mock).mockReturnValue(ok({ id: 'r1' }));
    const screen = render(<AddParentCard />);

    fireEvent.changeText(await screen.findByLabelText("Parent's email address"), 'mom@example.com');
    await act(async () => { fireEvent.press(screen.getByText('Send')); });

    expect(api.post).toHaveBeenCalledWith('/api/parent-link-requests', { parent_email: 'mom@example.com' });
    expect(await screen.findByText(/We emailed mom@example.com/)).toBeTruthy();
  });

  it('names the linked parent', async () => {
    (api.get as jest.Mock).mockReturnValue(ok({ state: 'has_parent', parents: [{ id: 'p', name: 'Sarah Towns' }], request: null }));
    const screen = render(<AddParentCard />);
    expect(await screen.findByText(/Sarah Towns/)).toBeTruthy();
    expect(screen.queryByLabelText("Parent's email address")).toBeNull();
  });

  it("renders nothing for a school's student", async () => {
    (api.get as jest.Mock).mockReturnValue(ok({ state: 'school', parents: [], request: null }));
    const screen = render(<AddParentCard />);
    await act(async () => {});
    expect(screen.queryByTestId('add-parent-card')).toBeNull();
  });
});
