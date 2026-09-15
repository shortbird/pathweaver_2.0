/**
 * One settings sheet for the family: add a child, invite an observer, and
 * each child's picture, profile and (managed profiles only) login access.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { FamilySettingsSheet } from '../FamilySettingsSheet';
import { useAddKidStore } from '@/src/stores/familyStore';
import { useInviteObserverStore } from '@/src/stores/inviteObserverStore';
import { createMockChild } from '@/src/__tests__/utils/mockFactories';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
// The sheet runs the chosen action once it has closed; make that immediate.
jest.mock('@/src/components/ui/bottom-sheet', () => ({
  BottomSheet: ({ visible, children, onClosed }: any) => {
    const { useEffect } = require('react');
    useEffect(() => { if (!visible) onClosed?.(); }, [visible]);
    return visible ? children : null;
  },
}));

const kids = [
  createMockChild({ id: 'kid-a', first_name: 'Romney', last_name: 'Hanna', display_name: 'Romney Hanna', is_dependent: false }),
  createMockChild({ id: 'kid-b', first_name: 'Timmy', last_name: 'Hanna', display_name: 'Timmy Hanna', is_dependent: true }),
];

describe('FamilySettingsSheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists the family doors and a section per child', () => {
    const { getByLabelText, getByTestId, queryByLabelText, getAllByLabelText } = render(
      <FamilySettingsSheet visible onClose={jest.fn()} kids={kids} />,
    );
    expect(getByLabelText('Add a child')).toBeTruthy();
    expect(getByLabelText('Invite an observer')).toBeTruthy();
    expect(getByTestId('family-settings-child-kid-a')).toBeTruthy();
    expect(getByTestId('family-settings-child-kid-b')).toBeTruthy();
    expect(getByLabelText("Change Romney's picture")).toBeTruthy();
    expect(getByLabelText("Romney's profile")).toBeTruthy();
    // A linked student already has a login; only the managed profile gets the door.
    expect(getAllByLabelText('Give login access').length).toBe(1);
    expect(queryByLabelText('Give login access')).toBeTruthy();
  });

  it('opens the add-child sheet after this one closes', () => {
    const open = jest.fn();
    useAddKidStore.setState({ open });
    const onClose = jest.fn();
    const { getByTestId, rerender } = render(<FamilySettingsSheet visible onClose={onClose} kids={kids} />);
    fireEvent.press(getByTestId('family-settings-add-child'));
    expect(onClose).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    rerender(<FamilySettingsSheet visible={false} onClose={onClose} kids={kids} />);
    expect(open).toHaveBeenCalled();
  });

  it('opens the invite-observer sheet the same way', () => {
    const open = jest.fn();
    useInviteObserverStore.setState({ open });
    const onClose = jest.fn();
    const { getByLabelText, rerender } = render(<FamilySettingsSheet visible onClose={onClose} kids={kids} />);
    fireEvent.press(getByLabelText('Invite an observer'));
    rerender(<FamilySettingsSheet visible={false} onClose={onClose} kids={kids} />);
    expect(open).toHaveBeenCalled();
  });
});
