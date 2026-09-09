/**
 * Focus / kiosk mode (core capability).
 *
 * A distraction-free fullscreen mode: when on, the main Layout hides the sidebar,
 * top navbar, and footer so a young student sees only the page content. Backed by
 * localStorage + a window event so any component can toggle it and the Layout
 * reacts immediately.
 *
 * The program that enters focus mode (e.g. the Treehouse kiosk) supplies its
 * return routes via `config`, so core Layout carries no program-specific routing:
 *   setFocusMode(true, { homeRoute: '/treehouse', idleLoginRoute: '/treehouse-kiosk' })
 */
const KEY = 'treehouse_focus'
const CONFIG_KEY = 'focus_mode_config'
export const FOCUS_EVENT = 'treehouse-focus-change'

export const isFocusMode = () => {
  try { return localStorage.getItem(KEY) === 'true' } catch { return false }
}

/** Routes the focus-entering program supplied: { homeRoute, idleLoginRoute }. */
export const getFocusConfig = () => {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {} } catch { return {} }
}

export const setFocusMode = (on, config = {}) => {
  try {
    if (on) {
      localStorage.setItem(KEY, 'true')
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
    } else {
      localStorage.removeItem(KEY)
      localStorage.removeItem(CONFIG_KEY)
    }
  } catch { /* localStorage unavailable */ }
  window.dispatchEvent(new Event(FOCUS_EVENT))
}
