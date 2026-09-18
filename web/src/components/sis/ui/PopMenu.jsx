import React from 'react'

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
 *   items                        [{label, onClick, danger?}]; or pass children
 *   width                        the panel's Tailwind w-* class
 *   align                        'right' (default) or 'left'
 *   className                    on the relative wrapper
 */
export default function PopMenu({
  open, onClose, trigger, items = null, children = null,
  width = 'w-52', align = 'right', className = '',
}) {
  return (
    <div className={`relative inline-block text-left ${className}`}>
      {trigger}
      {open && (
        <>
          {/* Click-away. Behind the menu, above everything else. */}
          <button type="button" aria-label="Close menu" tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default" onClick={onClose} />
          <div role="menu"
            className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} z-20 mt-1 ${width} rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-left`}>
            {items ? items.map((a) => (
              <button key={a.label} type="button" role="menuitem"
                onClick={() => { onClose(); a.onClick() }}
                className={`block w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 ${a.danger ? 'text-red-600' : 'text-neutral-700'}`}>
                {a.label}
              </button>
            )) : children}
          </div>
        </>
      )}
    </div>
  )
}
