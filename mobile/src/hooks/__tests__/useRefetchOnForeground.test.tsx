/**
 * Tests for useRefetchOnForeground — the hook every data hook uses to refetch
 * when the app returns to the foreground while its screen is focused.
 *
 * The global setup mocks useFocusEffect as a no-op; here it must actually run
 * the effect (with cleanup on unmount) so the AppState subscription exists.
 */

import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react-native';
import { Text, AppState, AppStateStatus } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRefetchOnForeground } from '@/src/hooks/useRefetchOnForeground';

function Probe({ refetch }: { refetch: () => void }) {
  useRefetchOnForeground(refetch);
  return <Text>probe</Text>;
}

describe('useRefetchOnForeground', () => {
  let listeners: ((status: AppStateStatus) => void)[] = [];
  const removeSpy = jest.fn();

  beforeEach(() => {
    listeners = [];
    removeSpy.mockClear();
    // Make the mocked useFocusEffect behave like a real focused screen: run
    // the effect and honor its cleanup.
    (useFocusEffect as jest.Mock).mockImplementation((cb: () => (() => void) | undefined) => {
      useEffect(cb, [cb]);
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      (event, cb) => {
        if (event === 'change') listeners.push(cb as (s: AppStateStatus) => void);
        return { remove: removeSpy } as never;
      },
    );
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (useFocusEffect as jest.Mock).mockReset();
  });

  const fire = (status: AppStateStatus) => {
    act(() => { listeners.forEach((l) => l(status)); });
  };

  it('refetches on background -> active', () => {
    const refetch = jest.fn();
    render(<Probe refetch={refetch} />);
    fire('background');
    fire('active');
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('refetches on inactive -> active (iOS notification shade)', () => {
    const refetch = jest.fn();
    render(<Probe refetch={refetch} />);
    fire('inactive');
    fire('active');
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('does not refetch on going TO the background', () => {
    const refetch = jest.fn();
    render(<Probe refetch={refetch} />);
    fire('background');
    expect(refetch).not.toHaveBeenCalled();
  });

  it('does not refetch on mount', () => {
    const refetch = jest.fn();
    render(<Probe refetch={refetch} />);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('calls the LATEST refetch after a re-render with a new closure', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = render(<Probe refetch={first} />);
    rerender(<Probe refetch={second} />);
    fire('background');
    fire('active');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<Probe refetch={jest.fn()} />);
    unmount();
    expect(removeSpy).toHaveBeenCalled();
  });
});
