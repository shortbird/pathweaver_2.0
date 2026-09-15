/**
 * One settings sheet for the family: add a child, invite an observer, and
 * each child's picture, profile and a door to their web-only settings
 * (login, AI, privacy).
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { FamilySettingsSheet } from '../FamilySettingsSheet';
import { useAddKidStore } from '@/src/stores/familyStore';
import { useAuthStore } from '@/src/stores/authStore';
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
    useAuthStore.setState({ user: { id: 'p1', role: 'parent', organization: null } as any });
    const { getByLabelText, getByTestId, queryByLabelText } = render(
      <FamilySettingsSheet visible onClose={jest.fn()} kids={kids} />,
    );
    expect(getByLabelText('Add a child')).toBeTruthy();
    expect(getByLabelText('Invite an observer')).toBeTruthy();
    expect(getByTestId('family-settings-child-kid-a')).toBeTruthy();
    expect(getByTestId('family-settings-child-kid-b')).toBeTruthy();
    expect(getByLabelText("Change Romney's picture")).toBeTruthy();
    expect(getByLabelText("Romney's profile")).toBeTruthy();
    // Login, AI and privacy are web settings; every child gets the door and
    // nobody gets an in-app account creator with a hardcoded password.
    expect(getByLabelText("Romney's login, AI and privacy")).toBeTruthy();
    expect(getByLabelText("Timmy's login, AI and privacy")).toBeTruthy();
    expect(queryByLabelText('Give login access')).toBeNull();
  });

  it("opens the web Family Settings on that child's tab", () => {
    useAuthStore.setState({ user: { id: 'p1', role: 'parent', organization: null } as any });
    const onClose = jest.fn();
    const { getByTestId, rerender } = render(<FamilySettingsSheet visible onClose={onClose} kids={kids} />);
    fireEvent.press(getByTestId('family-settings-web-kid-b'));
    rerender(<FamilySettingsSheet visible={false} onClose={onClose} kids={kids} />);
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/(app)/view-on-web',
      params: expect.objectContaining({ path: '/family?settings=kid-b' }),
    }));
  });

  it('hides Add a child for a family in an SIS school', () => {
    useAuthStore.setState({
      user: {
        id: 'p1', role: 'org_managed', org_role: 'parent',
        organization: { id: 'org', effective_modules: ['sis'] },
      } as any,
    });
    const { queryByLabelText, getByLabelText } = render(
      <FamilySettingsSheet visible onClose={jest.fn()} kids={kids} />,
    );
    expect(queryByLabelText('Add a child')).toBeNull();
    expect(getByLabelText('Invite an observer')).toBeTruthy();
  });

  it('opens the add-child sheet after this one closes', () => {
    useAuthStore.setState({ user: { id: 'p1', role: 'parent', organization: null } as any });
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
