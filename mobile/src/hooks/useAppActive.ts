/**
 * useAppActive — true only while the app is both foregrounded and the caller
 * is mounted. Used by polling hooks to pause intervals in the background
 * (P1). On web, AppState is a no-op, so we fall back to `document.hidden`.
 */

import { useEffect, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

export function useAppActive(): boolean {
  const [active, setActive] = useState<boolean>(() => {
    if (Platform.OS === 'web') {
      return typeof document === 'undefined' ? true : !document.hidden;
    }
    return AppState.currentState === 'active';
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      setActive(status === 'active');
    });

    let onVis: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      onVis = () => setActive(!document.hidden);
      document.addEventListener('visibilitychange', onVis);
    }

    return () => {
      sub.remove();
      if (onVis && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }, []);

  return active;
}
