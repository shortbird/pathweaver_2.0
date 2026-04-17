/**
 * Tests for useAppActive — the hook that returns true only while the app is
 * foregrounded. Used by polling hooks to pause intervals in the background.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Text, AppState, AppStateStatus } from 'react-native';
import { useAppActive } from '@/src/hooks/useAppActive';

function Probe() {
  const active = useAppActive();
  return <Text testID="active">{active ? 'yes' : 'no'}</Text>;
}

describe('useAppActive', () => {
  let listeners: Array<(status: AppStateStatus) => void> = [];

  beforeEach(() => {
    listeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      (event, cb) => {
        if (event === 'change') listeners.push(cb as (s: AppStateStatus) => void);
        return { remove: jest.fn() } as never;
      },
    );
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns true when app starts active', () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('active').props.children).toBe('yes');
  });

  it('flips to false when app backgrounds', () => {
    const { getByTestId } = render(<Probe />);
    act(() => {
      listeners.forEach((l) => l('background'));
    });
    expect(getByTestId('active').props.children).toBe('no');
  });

  it('flips back to true when app resumes', () => {
    const { getByTestId } = render(<Probe />);
    act(() => { listeners.forEach((l) => l('background')); });
    act(() => { listeners.forEach((l) => l('active')); });
    expect(getByTestId('active').props.children).toBe('yes');
  });
});
