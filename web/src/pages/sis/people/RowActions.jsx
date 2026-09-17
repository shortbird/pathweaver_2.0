import React from 'react'

/** The per-row menu. Navigate-away actions live here; edits live in Manage. */
export const RowActions = ({ open, onOpen, onClose, actions }) => (
  <div className="relative inline-block text-left">
    <button
      onClick={() => (open ? onClose() : onOpen())}
      className="px-2 py-1 rounded-md text-neutral-500 hover:bg-neutral-100 text-lg leading-none"
      aria-label="Actions"
    >
      ⋯
    </button>
    {open && (
      <>
        {/* click-away catcher */}
        <button type="button" aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={onClose} />
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-left">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={() => { onClose(); a.onClick() }}
              className={`block w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 ${a.danger ? 'text-red-600' : 'text-neutral-700'}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </>
    )}
  </div>
)

export default RowActions
