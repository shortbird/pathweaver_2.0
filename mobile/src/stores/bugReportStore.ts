/**
 * Bug-report store - drives the global in-app bug reporter sheet.
 *
 * `open()` is called from the shake gesture (with a captured screenshot) and
 * from the "Report a bug" row in Profile (no screenshot). The BugReportHost
 * renders the sheet when `visible` is true.
 */

import { create } from 'zustand';

interface BugReportState {
  visible: boolean;
  /** Local file URI of a screenshot captured at open time (shake path). */
  screenshotUri: string | null;
  open: (opts?: { screenshotUri?: string | null }) => void;
  close: () => void;
}

export const useBugReportStore = create<BugReportState>((set) => ({
  visible: false,
  screenshotUri: null,
  open: (opts) => set({ visible: true, screenshotUri: opts?.screenshotUri ?? null }),
  close: () => set({ visible: false, screenshotUri: null }),
}));
