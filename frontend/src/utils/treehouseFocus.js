/**
 * The Treehouse "focus mode" (kiosk fullscreen).
 *
 * When on, the main Layout hides the sidebar, top navbar, and footer so a young
 * student sees only the page content. Backed by localStorage + a window event so
 * any component can toggle it and the Layout reacts immediately.
 *
 * Enabled automatically on kiosk login; toggled from the Treehouse home.
 */
const KEY = 'treehouse_focus'
export const FOCUS_EVENT = 'treehouse-focus-change'

export const isFocusMode = () => {
  try { return localStorage.getItem(KEY) === 'true' } catch { return false }
}

export const setFocusMode = (on) => {
  try {
    if (on) localStorage.setItem(KEY, 'true')
    else localStorage.removeItem(KEY)
  } catch { /* localStorage unavailable */ }
  window.dispatchEvent(new Event(FOCUS_EVENT))
}
