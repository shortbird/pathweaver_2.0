/**
 * Toast store — drives the global toast/snackbar notifications.
 *
 * Mirrors the bugReportStore pattern: a Zustand store holds the live queue,
 * and a single <ToastHost /> mounted in app/_layout.tsx renders it.
 *
 * The canonical way to fire a toast is the imperative `toast` API below. It
 * reads the store via getState(), so it works from ANYWHERE — components,
 * hooks, other stores, even non-React code like the api-client error
 * interceptor. That's what makes this trivial to expand to any feature:
 *
 *   import { toast } from '@/src/stores/toastStore';
 *
 *   toast.success('Moment captured');
 *   toast.error('Could not save', { title: 'Upload failed' });
 *   toast.info('Syncing…', { duration: 0 });            // 0 = sticky until dismissed
 *   const id = toast.success('Saved', {                 // with a tap action
 *     action: { label: 'View', onPress: () => router.push('/journal') },
 *   });
 *   toast.dismiss(id);
 */

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastOptions {
  /** Primary line of text. Keep it short — this is a glanceable confirmation. */
  message: string;
  /** Optional bold title shown above the message. */
  title?: string;
  /** Visual style + icon. Defaults to 'info'. */
  type?: ToastType;
  /**
   * Auto-dismiss after N ms. Omit to use the per-type default
   * (success 3s, info 3.5s, error 5s). Pass 0 to make it sticky.
   */
  duration?: number;
  /** Optional inline action button (e.g. "Undo", "View"). */
  action?: { label: string; onPress: () => void };
}

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration: number;
  action?: ToastOptions['action'];
}

interface ToastState {
  toasts: Toast[];
  /** Enqueue a toast. Returns its id so callers can dismiss it early. */
  show: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

// Module-level monotonic id — no Date.now()/Math.random() needed, and
// collision-free within a session.
let counter = 0;
const nextId = () => `toast_${++counter}`;

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3000,
  info: 3500,
  error: 5000,
};

// Cap how many stack at once so a burst of errors can't bury the screen.
const MAX_VISIBLE = 3;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (opts) => {
    const id = nextId();
    const type = opts.type ?? 'info';
    const entry: Toast = {
      id,
      type,
      message: opts.message,
      title: opts.title,
      duration: opts.duration ?? DEFAULT_DURATION[type],
      action: opts.action,
    };
    set((s) => ({ toasts: [...s.toasts, entry].slice(-MAX_VISIBLE) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/**
 * Imperative toast API. Import this anywhere and call it — see the file header
 * for examples. Prefer this over poking the store directly.
 */
export const toast = {
  show: (opts: ToastOptions) => useToastStore.getState().show(opts),
  success: (message: string, opts?: Omit<ToastOptions, 'message' | 'type'>) =>
    useToastStore.getState().show({ ...opts, message, type: 'success' }),
  error: (message: string, opts?: Omit<ToastOptions, 'message' | 'type'>) =>
    useToastStore.getState().show({ ...opts, message, type: 'error' }),
  info: (message: string, opts?: Omit<ToastOptions, 'message' | 'type'>) =>
    useToastStore.getState().show({ ...opts, message, type: 'info' }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
  clear: () => useToastStore.getState().clear(),
};
