/**
 * usePolling — one visibility-aware, backing-off poll loop.
 *
 * Five copies of the same effect lived in useMessages.ts:
 *
 *     useEffect(() => {
 *       if (!isAuthenticated || !appActive) return;
 *       const interval = setInterval(() => fetch(true), 30000);
 *       return () => clearInterval(interval);
 *     }, [isAuthenticated, appActive, fetch]);
 *
 * They were already gated on `appActive`, so the audit's "battery + backend
 * load" reading was half stale — a backgrounded app has never polled. What was
 * missing is BACKOFF. A conversation endpoint that starts failing was retried
 * every 15 seconds forever, which is the shape that turns one server problem
 * into a self-inflicted load spike, on phones, on cellular.
 *
 * On each consecutive failure the interval doubles, to a ceiling of ten times
 * the base. One success resets it. Nothing is retried faster than the caller
 * asked for.
 */

import { useEffect, useRef, useState } from 'react';

import { useAppActive } from './useAppActive';

const MAX_BACKOFF_MULTIPLIER = 10;

export interface PollingOptions {
  /** Skip polling entirely (unauthenticated, no id yet, screen not ready). */
  enabled?: boolean;
}

export function usePolling(
  task: () => void | Promise<unknown>,
  intervalMs: number,
  { enabled = true }: PollingOptions = {}
): void {
  const appActive = useAppActive();
  const [failures, setFailures] = useState(0);

  // The task changes identity on every render in most callers; keeping it in a
  // ref means the timer is not torn down and rebuilt each time, which would
  // reset the phase and poll more often than asked.
  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    if (!enabled || !appActive) return;

    const multiplier = Math.min(2 ** failures, MAX_BACKOFF_MULTIPLIER);
    const delay = intervalMs * multiplier;

    const id = setInterval(() => {
      let result: void | Promise<unknown>;
      try {
        result = taskRef.current();
      } catch {
        setFailures((n) => n + 1);
        return;
      }
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<unknown>).then(
          // `false` counts as a failure. The message fetchers catch their own
          // errors -- they must, or a dropped poll would surface as an unhandled
          // rejection -- so a rejected promise is not the signal here. They
          // return false instead, which is the only way this loop can know the
          // difference between "nothing new" and "the server is down".
          (ok) => setFailures((n) => (ok === false ? n + 1 : 0)),
          () => setFailures((n) => n + 1)
        );
      }
    }, delay);

    return () => clearInterval(id);
  }, [enabled, appActive, intervalMs, failures]);
}
