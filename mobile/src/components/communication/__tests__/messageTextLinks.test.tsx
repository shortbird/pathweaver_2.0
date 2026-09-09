/**
 * Tapping a homework link in a chat bubble.
 *
 * iCreate, 2026-09-07 (208b75b5): "my students can't access homework links from
 * the mobile app." The teacher pastes an assignment URL into the class chat and
 * the bubble rendered it as flat text — nothing to tap, on the one surface
 * where selecting 90 characters by hand is hardest.
 *
 * Every tap goes through safeOpenURL rather than Linking.openURL: it is the
 * app's guarded exit to the OS, and handing an unroutable value straight to
 * Linking is what crashed a screen once already (Sentry NODE-8).
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MessageText from '../MessageText';
import { safeOpenURL } from '@/src/utils/linking';

jest.mock('@/src/utils/linking', () => ({ safeOpenURL: jest.fn(() => Promise.resolve(true)) }));

const LINK = 'https://classroom.google.com/c/abc';

describe('MessageText', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens the link when the link is tapped', () => {
    const { getByText } = render(
      <MessageText content={`Homework: ${LINK}`} color="#000" />);
    fireEvent.press(getByText(LINK));
    expect(safeOpenURL).toHaveBeenCalledWith(LINK);
  });

  it('keeps the words around the link in the same bubble', () => {
    const { getByText } = render(
      <MessageText content={`Homework: ${LINK} — due Friday`} color="#000" />);
    expect(getByText('Homework: ')).toBeTruthy();
    expect(getByText(' — due Friday')).toBeTruthy();
  });

  it('renders a plain message without anything pressable', () => {
    const { getByText } = render(
      <MessageText content="Bring your sketchbook" color="#000" />);
    fireEvent.press(getByText('Bring your sketchbook'));
    expect(safeOpenURL).not.toHaveBeenCalled();
  });
});
