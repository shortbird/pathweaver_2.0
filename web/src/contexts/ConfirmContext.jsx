import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import ConfirmDialog from '../components/ui/ConfirmDialog'

/**
 * useConfirm — the app-wide replacement for `window.confirm`.
 *
 * `window.confirm` is not dependable on mobile. Inside an iOS in-app WKWebView
 * — a link opened from Gmail, Outlook, Facebook, or a school newsletter — the
 * host app never implements the JS-dialog delegate, so the call returns `false`
 * without ever rendering anything. Safari's pop-up blocking and its
 * "don't show more dialogs" suppression land the same way. Desktop browsers
 * always render it, which is why these failures only ever show up as
 * "I tapped the button and nothing happened" from someone on a phone.
 *
 * It also blocks the main thread and renders OS chrome in the middle of a
 * styled app, which is why `ui/ConfirmDialog` already existed.
 *
 * Usage — an await where the `window.confirm` used to be:
 *
 *   const confirm = useConfirm()
 *   ...
 *   if (!(await confirm('Delete this quest?'))) return
 *
 * A string is the title. Pass an object for anything more:
 *
 *   await confirm({
 *     title: 'Delete this quest?',
 *     body: 'Students who already started it keep their work.',
 *     confirmLabel: 'Delete quest',
 *     cancelLabel: 'Keep it',
 *     destructive: true,
 *   })
 *
 * `destructive` defaults to true — nearly every caller is a delete/remove, and
 * the safe default is the one that styles the button as dangerous.
 */

const ConfirmContext = createContext(null)

/**
 * Split a `window.confirm`-style message into the dialog's title and body.
 *
 * These messages were written for a native dialog that only had one text slot,
 * so they read "Question? Consequence." or use a blank line as a separator.
 * Rendering the whole thing as the bold title looks like shouting, so take the
 * lead question as the title and demote the rest to body copy.
 */
export const splitMessage = (message) => {
  const text = String(message ?? '').trim()
  const para = text.indexOf('\n\n')
  if (para > -1) return { title: text.slice(0, para).trim(), body: text.slice(para + 2).trim() }
  const line = text.indexOf('\n')
  if (line > -1) return { title: text.slice(0, line).trim(), body: text.slice(line + 1).trim() }
  // A single long line: break after the first sentence so the title stays a
  // headline. Short messages are already a headline and stay whole.
  if (text.length > 60) {
    const m = /^(.{10,}?[?!.])\s+(\S.*)$/s.exec(text)
    if (m) return { title: m[1], body: m[2] }
  }
  return { title: text, body: null }
}

export const ConfirmProvider = ({ children }) => {
  const [request, setRequest] = useState(null)
  const [draft, setDraft] = useState('')   // the text input, when asking for one
  // The pending ask: { resolve, cancelled, input }. Held in a ref so `confirm`
  // keeps a stable identity — call sites put it in dependency lists.
  const pendingRef = useRef(null)

  // Settle whatever is open before replacing it: a second ask while one is
  // pending would strand the first promise and hang its caller mid-handler.
  const open = useCallback((opts, cancelled) => {
    const prev = pendingRef.current
    if (prev) prev.resolve(prev.cancelled)
    return new Promise((resolve) => {
      pendingRef.current = { resolve, cancelled, input: !!opts.input }
      setDraft(opts.defaultValue || '')
      setRequest(opts)
    })
  }, [])

  const confirm = useCallback((options) => {
    const opts = typeof options === 'string' ? splitMessage(options) : (options || {})
    return open({ destructive: true, ...opts }, false)
  }, [open])

  // The `window.prompt` replacement: resolves to the entered string, or null if
  // the person cancelled — same contract the callers already branch on.
  const promptText = useCallback((options) => {
    const opts = typeof options === 'string' ? { title: options } : (options || {})
    return open({ destructive: false, ...opts, input: true }, null)
  }, [open])

  const answer = useCallback((ok) => {
    const pending = pendingRef.current
    pendingRef.current = null
    setRequest(null)
    if (pending) pending.resolve(ok ? (pending.input ? draft : true) : pending.cancelled)
  }, [draft])

  const value = useMemo(() => ({ confirm, promptText }), [confirm, promptText])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {request && (
        <ConfirmDialog
          isOpen
          title={request.title}
          confirmLabel={request.confirmLabel || 'Confirm'}
          cancelLabel={request.cancelLabel || 'Cancel'}
          destructive={request.destructive}
          onConfirm={() => answer(true)}
          onClose={() => answer(false)}
        >
          {/* whitespace-pre-line: several of these messages still carry the
              line breaks they were written with for the native dialog. */}
          {request.body ? <p className="whitespace-pre-line">{request.body}</p> : null}
          {request.input && (
            <input
              type="text"
              autoFocus
              aria-label={request.title}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') answer(true) }}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
            />
          )}
        </ConfirmDialog>
      )}
    </ConfirmContext.Provider>
  )
}

// Used when a component calls useConfirm() outside the provider — in practice
// only a unit test rendering the component in isolation. It answers "cancel",
// which makes the guarded action a no-op, and says so loudly: silently
// answering "yes" would let a test pass while a delete runs unconfirmed.
const missing = (name, cancelledValue) => (options) => {
  console.error(
    `[${name}] No <ConfirmProvider> above this component, so the dialog was ` +
    'auto-cancelled and the guarded action did not run. App.jsx mounts one; ' +
    'a test needs to render inside <ConfirmProvider>.',
    options,
  )
  return Promise.resolve(cancelledValue)
}

const NO_PROVIDER = {
  confirm: missing('useConfirm', false),
  promptText: missing('usePromptText', null),
}

export const useConfirm = () => (useContext(ConfirmContext) || NO_PROVIDER).confirm

/** `window.prompt` replacement. Resolves to the string, or null if cancelled. */
export const usePromptText = () => (useContext(ConfirmContext) || NO_PROVIDER).promptText

export default ConfirmProvider
