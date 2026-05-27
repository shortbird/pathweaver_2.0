/**
 * CaptureContextStore - lets a screen tell the global Capture button
 * (center tab) what context the user is currently in. When the student
 * is on a quest detail screen, that screen sets `quest`, and the global
 * CaptureSheet opens already scoped to that quest's tasks.
 *
 * Screens MUST clear the context when they unfocus, otherwise the next
 * Capture will incorrectly stay scoped to the previous quest.
 */

import { create } from 'zustand';

export interface CaptureQuestContext {
  questId: string;
  questTitle: string;
}

interface CaptureContextState {
  quest: CaptureQuestContext | null;
  setQuest: (q: CaptureQuestContext | null) => void;
  clear: () => void;
}

export const useCaptureContextStore = create<CaptureContextState>((set) => ({
  quest: null,
  setQuest: (quest) => set({ quest }),
  clear: () => set({ quest: null }),
}));
