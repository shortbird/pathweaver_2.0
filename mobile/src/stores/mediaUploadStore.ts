/**
 * Tracks in-flight background media uploads keyed by learning-event id.
 *
 * Capture is optimistic: the moment is created and shown immediately while its
 * video uploads in the background (CaptureSheet). Without this, the moment card
 * appears with no video and looks like it failed. The feed/journal cards read
 * this store to show an "Uploading video… N%" placeholder until the upload
 * finishes and the real video block lands.
 */

import { create } from 'zustand';

interface MediaUploadState {
  /** learning_event id -> upload percent (0-100). Absent = no active upload. */
  uploads: Record<string, number>;
  start: (eventId: string) => void;
  setProgress: (eventId: string, pct: number) => void;
  finish: (eventId: string) => void;
}

export const useMediaUploadStore = create<MediaUploadState>((set) => ({
  uploads: {},
  start: (eventId) =>
    set((s) => ({ uploads: { ...s.uploads, [eventId]: 0 } })),
  setProgress: (eventId, pct) =>
    set((s) => (eventId in s.uploads ? { uploads: { ...s.uploads, [eventId]: pct } } : s)),
  finish: (eventId) =>
    set((s) => {
      if (!(eventId in s.uploads)) return s;
      const next = { ...s.uploads };
      delete next[eventId];
      return { uploads: next };
    }),
}));
