/**
 * usePolling — the loop that replaced five copied setInterval effects.
 *
 * The copies were already visibility-aware, so the interesting behaviour here
 * is the part they did not have: backing off when the thing being polled is
 * failing, instead of retrying a struggling server every 15 seconds forever,
 * on phones, on cellular.
 */

import { renderHook, act } from '@testing-library/react-native';

import { usePolling } from '../usePolling';

// `mock`-prefixed so jest's out-of-scope-variable guard allows the closure.
let mockAppActive = true;
jest.mock('../useAppActive', () => ({
  useAppActive: () => mockAppActive,
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockAppActive = true;
});

afterEach(() => {
  jest.useRealTimers();
});

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('usePolling', () => {
  it('runs the task on the interval', () => {
    const task = jest.fn();
    renderHook(() => usePolling(task, 1000));

    expect(task).not.toHaveBeenCalled(); // the first fetch is the caller's job
    act(() => { jest.advanceTimersByTime(3000); });
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('does not poll while the app is backgrounded', () => {
    mockAppActive = false;
    const task = jest.fn();
    renderHook(() => usePolling(task, 1000));

    act(() => { jest.advanceTimersByTime(5000); });
    expect(task).not.toHaveBeenCalled();
  });

  it('does not poll when disabled', () => {
    const task = jest.fn();
    renderHook(() => usePolling(task, 1000, { enabled: false }));

    act(() => { jest.advanceTimersByTime(5000); });
    expect(task).not.toHaveBeenCalled();
  });

  it('backs off when the task reports failure', async () => {
    // The fetchers catch their own errors and return false; a rejected promise
    // from a background poll would surface as an unhandled rejection.
    const task = jest.fn().mockResolvedValue(false);
    renderHook(() => usePolling(task, 1000));

    act(() => { jest.advanceTimersByTime(1000); });
    await flush();
    expect(task).toHaveBeenCalledTimes(1);

    // One failure -> the next attempt is 2s away, so 1s buys nothing.
    act(() => { jest.advanceTimersByTime(1000); });
    await flush();
    expect(task).toHaveBeenCalledTimes(1);

    act(() => { jest.advanceTimersByTime(1000); });
    await flush();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('recovers immediately on the first success', async () => {
    // Backoff that does not reset is just a slower poll.
    const task = jest.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    renderHook(() => usePolling(task, 1000));

    act(() => { jest.advanceTimersByTime(1000); });
    await flush();
    act(() => { jest.advanceTimersByTime(2000); });
    await flush();
    expect(task).toHaveBeenCalledTimes(2);

    act(() => { jest.advanceTimersByTime(1000); });
    await flush();
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('treats a thrown task as a failure rather than crashing the interval', () => {
    const task = jest.fn(() => { throw new Error('boom'); });
    renderHook(() => usePolling(task, 1000));

    expect(() => act(() => { jest.advanceTimersByTime(1000); })).not.toThrow();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('does not restart the timer when the task identity changes', () => {
    // The callers pass an inline arrow, so the task is a new function on every
    // render. Rebuilding the interval each time would reset its phase and poll
    // far more often than asked.
    const task = jest.fn();
    const { rerender } = renderHook<void, { fn: () => void }>(
      ({ fn }) => usePolling(fn, 1000),
      { initialProps: { fn: task } },
    );

    act(() => { jest.advanceTimersByTime(900); });
    rerender({ fn: jest.fn(task) });
    act(() => { jest.advanceTimersByTime(100); });

    expect(task).toHaveBeenCalledTimes(1);
  });
});
