import { useSyncExternalStore } from 'react'

/**
 * Whether the issue reporter's panel is open, readable from anywhere.
 *
 * It exists for one reason: a modal's focus trap and the reporter cannot both
 * hold focus, and the modal wins. `ui/Modal` traps focus inside itself, and
 * focus-trap pulls focus back whenever it lands outside -- `allowOutsideClick`
 * exempts the CLICK, not the focus. So the reporter's panel opened, its
 * textarea took focus for an instant, the trap snatched it back, and typing
 * went nowhere. Submitting then failed on the empty message: "I can't send
 * feedback when the message popup is open" (an iCreate org admin, 2026-09-22,
 * trying to report a bug about the composer she had open at the time).
 *
 * A React context would have to wrap the app above every modal; this is the
 * same thing without the provider, and a modal reads it with one hook.
 */
let panelOpen = false
const listeners = new Set()

export const setReporterPanelOpen = (next) => {
  if (panelOpen === next) return
  panelOpen = next
  listeners.forEach((l) => l())
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l) }
const snapshot = () => panelOpen

/** True while the reporter panel is open. Modals pause their focus trap on it. */
export const useReporterPanelOpen = () => useSyncExternalStore(subscribe, snapshot, snapshot)
