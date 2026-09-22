import React, { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * A menu that drops from a button: the frame, the click-away catcher behind
 * it, and the items (M14d).
 *
 * Four SIS surfaces hand-rolled the same thing -- a fixed inset-0 button to
 * close on click-away, an absolutely placed panel, items styled by hand
 * (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, L4). The people row's
 * actions, the People page's "+ Add", the Task Center's "other things to
 * assign" and the waitlist's "Other section" are this once. The caller owns
 * `open` (it usually needs to close on its own terms) and renders the
 * trigger; `items` is the common case and `children` the bespoke panel.
 *
 * Props:
 *   open, onClose                the state; the catcher and every item call onClose
 *   trigger                      the button the menu drops from (rendered as given)
 *   items                        [{label, onClick, danger?, disabled?}]; or pass children
 *   width                        the panel's Tailwind w-* class
 *   align                        'right' (default) or 'left'
 *   className                    on the relative wrapper
 *   floating                     position the panel against the viewport, in a
 *                                portal, instead of under the wrapper. For a
 *                                trigger inside a scrolling box (a table with
 *                                overflow-x-auto clips an absolute panel on its
 *                                last rows); opens upward when there is no room
 *                                below, and closes on scroll or resize rather
 *                                than drifting away from its button.
 */
export default function PopMenu({
  open, onClose, trigger, items = null, children = null,
  width = 'w-52', align = 'right', className = '', floating = false,
}) {
  const wrapRef = useRef(null)
  const panelRef = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!floating || !open) { setPos(null); return undefined }
    const place = () => {
      const r = wrapRef.current?.getBoundingClientRect()
      if (!r) return
      const h = panelRef.current?.offsetHeight || 0
      const below = window.innerHeight - r.bottom
      const up = h > 0 && below < h + 8 && r.top > below
      setPos({
        top: up ? Math.max(8, r.top - h - 4) : r.bottom + 4,
        ...(align === 'left' ? { left: r.left } : { right: window.innerWidth - r.right }),
      })
    }
    place()
    // A second pass once the panel has a height to measure.
    const raf = requestAnimationFrame(place)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [floating, open, align, onClose])

  const panel = (
    <div role="menu" ref={panelRef}
      style={floating ? { position: 'fixed', ...(pos || { top: -9999, right: 0 }) } : undefined}
      className={`${floating ? 'z-50' : `absolute ${align === 'left' ? 'left-0' : 'right-0'} z-20 mt-1`} ${width} rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-left`}>
      {items ? items.map((a) => (
        <button key={a.label} type="button" role="menuitem" disabled={a.disabled}
          onClick={() => { onClose(); a.onClick() }}
          className={`block w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50 ${a.danger ? 'text-red-600' : 'text-neutral-700'}`}>
          {a.label}
        </button>
      )) : children}
    </div>
  )

  return (
    <div ref={wrapRef} className={`relative inline-block text-left ${className}`}>
      {trigger}
      {open && (
        <>
          {/* Click-away. Behind the menu, above everything else. */}
          <button type="button" aria-label="Close menu" tabIndex={-1}
            className={`fixed inset-0 ${floating ? 'z-40' : 'z-10'} cursor-default`} onClick={onClose} />
          {floating ? createPortal(panel, document.body) : panel}
        </>
      )}
    </div>
  )
}
