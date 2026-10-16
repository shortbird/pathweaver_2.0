import React from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
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

const OPTIO_ICON_URL = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg'

export default function CreateClassModal({ onClose, onSubmit, initial = null, staff = [], timeBlocks = [], rooms = [], roomOccupancy = {}, org = null, classOptions = [] }) {
  const isEdit = Boolean(initial)
  // The school's own logo when it has one, Optio's mark otherwise.
  const schoolLogo = org?.branding_config?.logo_url || org?.logo_url || null
  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <img src={schoolLogo || OPTIO_ICON_URL} alt={schoolLogo ? `${org?.name || 'School'} logo` : 'Optio'}
              className="h-10 w-auto max-w-[120px] object-contain shrink-0" />
            <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Class' : 'Create Class'}</h2>
          </div>
          <button type="button" onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <ClassForm onCancel={onClose} onSubmit={onSubmit} initial={initial} staff={staff}
          timeBlocks={timeBlocks} rooms={rooms} roomOccupancy={roomOccupancy} org={org}
          classOptions={classOptions} />
      </div>
    </ModalOverlay>
  )
}
