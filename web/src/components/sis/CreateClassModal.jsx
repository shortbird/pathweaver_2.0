import React from 'react'
import { AcademicCapIcon, XMarkIcon } from '@heroicons/react/24/outline'
import ModalOverlay from '../ui/ModalOverlay'
import ClassForm from './ClassForm'

/**
 * Create a class: the dialog around ClassForm (the one class form, which the
 * class record's Details tab also renders in place to edit). The FIELDS are
 * ClassFieldsEditor, the same grid the class list's inline row editor uses.
 * They used to be two hand-maintained copies differing by two fields and by
 * which bugs each had; iCreate could set an assistant teacher in one and
 * watch it vanish on save (2026-08-06).
 *
 * Re-exports the day/time helpers it used to own from ./classFields, so existing
 * importers keep working.
 */

export {
  hhmm, minutesBetween, blockMinutes, blockLabel, addMin, fmt12ap,
  blockEndOptions, meetingsToForm,
} from './classFields'

export default function CreateClassModal({ onClose, onSubmit, initial = null, staff = [], timeBlocks = [], rooms = [], roomOccupancy = {} }) {
  const isEdit = Boolean(initial)
  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center">
              <AcademicCapIcon className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Class' : 'Create Class'}</h2>
          </div>
          <button type="button" onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <ClassForm onCancel={onClose} onSubmit={onSubmit} initial={initial} staff={staff}
          timeBlocks={timeBlocks} rooms={rooms} roomOccupancy={roomOccupancy} />
      </div>
    </ModalOverlay>
  )
}
