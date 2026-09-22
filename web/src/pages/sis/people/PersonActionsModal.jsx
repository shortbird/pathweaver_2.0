import React from 'react'
import { Modal } from '../../../components/ui/Modal'
import StudentRow from '../../../components/sis/StudentRow'

/**
 * Everything you can do with one person, as a list you pick from.
 *
 * It replaced the per-row ⋯ menu on 2026-09-22. Two reasons, and the second
 * is the one that mattered: the menu was a column of its own on a table that
 * already ran off the side of the screen, and because it opened an absolutely
 * positioned panel inside the card, the card could not be given a scrollbar
 * without clipping it. Removing the menu freed the table to behave like every
 * other table in the console.
 *
 * Manage is first because it is what most clicks want, and it is what the row
 * click used to do on its own.
 */
export const PersonActionsModal = ({ person, actions, onClose }) => (
  <Modal isOpen onClose={onClose} title="What would you like to do?" size="sm">
    <div className="mb-4">
      <StudentRow person={person} withAge={false} />
    </div>
    <ul className="divide-y divide-gray-100 border-y border-gray-100">
      {actions.map((a) => (
        <li key={a.label}>
          <button
            type="button"
            onClick={() => { onClose(); a.onClick() }}
            className={`w-full text-left px-3 py-2.5 text-sm hover:bg-neutral-50 ${
              a.danger ? 'text-red-600' : 'text-neutral-800'
            }`}
          >
            {a.label}
          </button>
        </li>
      ))}
    </ul>
  </Modal>
)

export default PersonActionsModal
