/**
 * BugReportHost - global mount point for the in-app bug reporter.
 *
 * Responsibilities:
 *  - Record route breadcrumbs (usePathname) into diagnostics.
 *  - Install the console-error capture once.
 *  - Listen for a shake gesture (authenticated users only) → capture a
 *    screenshot → open the report sheet.
 *  - Render the BugReportSheet.
 *
 * Mounted once in app/_layout.tsx, after the navigator.
 */

import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { useBugReportStore } from '@/src/stores/bugReportStore';
import { useShakeToReport } from '@/src/hooks/useShakeToReport';
import { recordRoute, installConsoleCapture } from '@/src/services/diagnostics';
import { BugReportSheet } from './BugReportSheet';

async function captureScreenshot(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { captureScreen } = require('react-native-view-shot');
    return await captureScreen({ format: 'jpg', quality: 0.6 });
  } catch {
    // Screenshot is best-effort — never block opening the report.
    return null;
  }
}

export function BugReportHost() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const open = useBugReportStore((s) => s.open);

  useEffect(() => {
    installConsoleCapture();
  }, []);

  useEffect(() => {
    if (pathname) recordRoute(pathname);
  }, [pathname]);

  const handleShake = useCallback(async () => {
    // Guard: if the sheet is already open, ignore.
    if (useBugReportStore.getState().visible) return;
    const screenshotUri = await captureScreenshot();
    open({ screenshotUri });
  }, [open]);

  useShakeToReport(handleShake, isAuthenticated);

  return <BugReportSheet />;
}
