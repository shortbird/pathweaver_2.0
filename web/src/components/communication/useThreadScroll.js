import { useLayoutEffect, useRef } from 'react'

// How close to the bottom still counts as "reading the newest message".
const STUCK_PX = 48

/**
 * Keeps a thread's scroll position honest. One rule set for every thread
 * (DMs, group chats, the school inbox), because each used to have the same
 * bug: an effect that scrolled to the bottom whenever the messages array
 * changed, and the array changes far more often than a message arrives. The
 * 60s poll re-signs every attachment URL, a reaction or an edit replaces the
 * array, a send invalidates and refetches. Somebody reading last week's
 * messages was yanked to the bottom by every one of them ("I sometimes get
 * scrolled to different places in the thread", 2026-09-15).
 *
 * The rules:
 *   - Opening a thread lands at the bottom, before paint.
 *   - A message appended to the end scrolls to the bottom only if the reader
 *     was already there, or if the message is their own: you send, you see
 *     it. Someone who scrolled up stays put.
 *   - Nothing else moves the view.
 *   - An image that finishes loading while the reader is at the bottom keeps
 *     them at the bottom. The content grew under them, not above them, and
 *     the first jump happened before the image had a height.
 *
 * `containerRef` is the scrolling element (overflow-y-auto). `threadKey`
 * changes when a different thread is shown. `selfId` is who "own" means in
 * this thread -- the school's inbox account in the school inbox.
 */
export default function useThreadScroll(containerRef, messages, threadKey, selfId) {
  const stuck = useRef(true)
  const lastThreadKey = useRef(null)
  const lastMessageId = useRef(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return undefined

    const toBottom = (smooth) => {
      if (smooth && typeof el.scrollTo === 'function') {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        el.scrollTop = el.scrollHeight
      }
    }
    const onScroll = () => {
      stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STUCK_PX
    }
    // Image load events do not bubble; capture catches them from the
    // container.
    const onLoad = (e) => {
      if (e.target?.tagName === 'IMG' && stuck.current) toBottom(false)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('load', onLoad, true)

    const last = messages?.length ? messages[messages.length - 1] : null
    const threadChanged = lastThreadKey.current !== threadKey
    if (threadChanged) {
      if (last) toBottom(false)
      stuck.current = true
    } else if (last && last.id !== lastMessageId.current) {
      const own = selfId && last.sender_id === selfId
      if (stuck.current || own || last.isOptimistic) toBottom(true)
    }
    lastThreadKey.current = threadKey
    lastMessageId.current = last?.id ?? null

    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('load', onLoad, true)
    }
  }, [containerRef, messages, threadKey, selfId])
}
