/**
 * useRefetchOnForeground — call `refetch` when the app returns to the
 * foreground while the calling screen is focused.
 *
 * Generalizes the feed's listener (bug #4: "no way to refresh the feed when I
 * reopen the app after a while") to every data hook: without it, each screen
 * fetched on mount only, so reopening the app showed whatever was on screen
 * when it was backgrounded. Scoped to focus via useFocusEffect so a reopen
 * refetches only the visible screen, not every mounted tab.
 *
 * On web (dev-only surface) AppState is a no-op, so fall back to
 * `visibilitychange` — same split as useAppActive.
 */

import { useCallback, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

export function useRefetchOnForeground(refetch: () => void): void {
  // Ref so an unstable refetch identity (several hooks return a fresh closure
  // per render) doesn't tear down and re-create the subscription every render.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web') {
        if (typeof document === 'undefined') return undefined;
        const onVis = () => {
          if (!document.hidden) refetchRef.current();
        };
        document.addEventListener('visibilitychange', onVis);
        return () => document.removeEventListener('visibilitychange', onVis);
      }

      const appState = { current: AppState.currentState };
      const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
        if (appState.current.match(/inactive|background/) && next === 'active') {
          refetchRef.current();
        }
        appState.current = next;
      });
      return () => sub.remove();
    }, []),
  );
}
