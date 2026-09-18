import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useRemovalPreview, sisPeopleApi } from '../../../hooks/api/useSisPeople'
import ModalOverlay from '../../../components/ui/ModalOverlay'

const HISTORY_LABELS = {
  class_enrollments: 'active class',
  attendance: 'attendance record',
  completed_work: 'completed task',
  registrations: 'registration',
  forms: 'submitted form',
  dependents: 'linked student',
  classes: 'class taught',
  onboarding: 'onboarding task',
}

const historyLine = (history = {}) => Object.entries(history)
  .filter(([, n]) => n > 0)
  .map(([k, n]) => `${n} ${HISTORY_LABELS[k] || k.replace(/_/g, ' ')}${n === 1 ? '' : 's'}`)
  .join(' · ')

/**
 * Removing a person from the school. Two outcomes, and which one is available
 * depends on what they're attached to: an account with records is archived
 * (hidden, history intact), a clean duplicate can be deleted outright. Deleting
 * a family never removed the accounts inside it — that left iCreate with three
 * ghost Swensons and no way to clear them.
 */
export const RemovePersonModal = ({ person, orgId, onClose, onDone }) => {
  const { data: preview = null, error } = useRemovalPreview(orgId, person.student_id)
  const failed = Boolean(error)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (error) toast.error(error?.response?.data?.error || 'Could not check this account')
  }, [error])

  const run = async (mode) => {
    setBusy(true)
    try {
      const { data } = await sisPeopleApi.remove(orgId, person.student_id, mode)
      // A delete can still be refused by a record the preview never probed; the
      // server archives them instead and sends back the reason to show.
      toast.success(data?.message
        ? data.message
        : data?.deleted
          ? `${person.name} deleted`
          : `${person.name} removed from the school${data?.seats_released ? ` · ${data.seats_released} class seat(s) freed` : ''}`)
      onDone()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not remove this person')
    } finally { setBusy(false) }
  }

  const attached = preview ? historyLine(preview.history) : ''

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-neutral-900">Remove {person.name}?</h2>

        {!preview && !failed && <p className="mt-3 text-sm text-neutral-500">Checking what they are attached to…</p>}
        {failed && <p className="mt-3 text-sm text-neutral-500">Could not load this account&apos;s records.</p>}

        {preview && (
          <>
            <p className="mt-3 text-sm text-neutral-600">
              {attached
                ? <>They have {attached} on file.</>
                : <>They have no school records — nothing would be orphaned.</>}
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="font-medium text-neutral-800">Archive</p>
                <p className="text-neutral-500 mt-0.5">
                  {preview.kind === 'student'
                    ? 'Marks them withdrawn and frees their class seats. Their history stays.'
                    : 'Removes them from this school. The account itself is kept.'}
                </p>
                <button onClick={() => run('archive')} disabled={busy}
                  className="mt-2 px-3 py-1.5 rounded-lg border border-gray-300 text-neutral-700 hover:bg-gray-50 disabled:opacity-50">
                  Archive
                </button>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="font-medium text-neutral-800">Delete permanently</p>
                <p className="text-neutral-500 mt-0.5">
                  {preview.can_delete
                    ? 'For duplicates and typos — the account is gone for good.'
                    : 'Not available: deleting would orphan the records above.'}
                </p>
                <button onClick={() => run('delete')} disabled={busy || !preview.can_delete}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40">
                  Delete
                </button>
              </div>
            </div>
          </>
        )}

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">
            Cancel
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

export default RemovePersonModal
