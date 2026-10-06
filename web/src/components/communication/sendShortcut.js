/**
 * The web send shortcut for every message composer: Ctrl+Enter (Cmd+Enter on
 * a Mac) sends; plain Enter is a new line.
 *
 * Enter used to send, and staff writing a multi-paragraph reply to a family
 * kept sending half a message every time they pressed Enter for a new
 * paragraph (iCreate, ticket e937883a). The mobile app already treats Enter as
 * a new line, so the web now matches it.
 */

export const isMacPlatform = () => {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.userAgentData?.platform || navigator.platform || ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/** True when this keydown is the send (or save) shortcut. */
export const isSendShortcut = (e) =>
  e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent?.isComposing

/** "Ctrl+Enter" or "⌘+Enter", for the hint under a composer. */
export const sendShortcutLabel = () => (isMacPlatform() ? '⌘+Enter' : 'Ctrl+Enter')
