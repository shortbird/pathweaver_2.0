import React from 'react'
import PopMenu from '../../../components/sis/ui/PopMenu'

/** The per-row menu. Navigate-away actions live here; edits live in Manage. */
export const RowActions = ({ open, onOpen, onClose, actions }) => (
  <PopMenu open={open} onClose={onClose} items={actions}
    trigger={(
      <button
        onClick={() => (open ? onClose() : onOpen())}
        className="px-2 py-1 rounded-md text-neutral-500 hover:bg-neutral-100 text-lg leading-none"
        aria-label="Actions"
      >
        ⋯
      </button>
    )} />
)

export default RowActions
