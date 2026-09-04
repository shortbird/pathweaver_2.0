/**
 * Extracted from pages/ScheduleBuilderPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import { ModalOverlay, GlassTabBar, Spinner } from '../../components/ui'
import ClassDetailsModal, { meetingText, money } from '../../components/schedule/ClassDetailsModal'
import AgeExceptionFooter from './AgeExceptionFooter'
import conflictsWith from './conflictsWith'
import slotLabel from './slotLabel'

const SlotClassesModal = ({ slot, classes, ageHidden = [], requestedIds, onRequestException, enrolledHere = [], age, enrolled, busy, locked, onClose, onDetails, onAdd, onDrop }) => (
  <ModalOverlay onClose={onClose}>
    <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Classes at {slotLabel(slot)}</h2>
          <p className="text-xs text-gray-400">
            {enrolledHere.length ? 'What’s scheduled now, plus other classes at this time.' : 'Pick a class for this time slot.'}
            {age != null ? ` Showing classes for age ${age}.` : ''}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>
      <div className="p-4 pt-2 overflow-y-auto flex-1 space-y-2">
        {/* Already on the schedule for this slot — so a multi-block class never hides
            the other options in the blocks it covers. */}
        {enrolledHere.map((c) => (
          <div key={`enr-${c.id}`} className="flex items-center justify-between rounded-lg border border-optio-purple/40 bg-optio-purple/5 px-3 py-2.5">
            <div className="min-w-0">
              <div className="font-medium text-gray-900 truncate">{c.name}</div>
              <div className="text-xs text-gray-500">{meetingText(c.meetings)}</div>
              <span className="inline-flex mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-optio-purple/10 text-optio-purple">Enrolled</span>
            </div>
            <div className="shrink-0 ml-3 flex items-center gap-2">
              <button onClick={() => onDetails(c, true)} className="text-sm text-optio-purple hover:underline">Details</button>
              {!locked && onDrop && (
                <button onClick={() => onDrop(c)} disabled={busy === c.id}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50">
                  {busy === c.id ? '…' : 'Drop'}
                </button>
              )}
            </div>
          </div>
        ))}
        {enrolledHere.length > 0 && classes.length > 0 && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 pt-1">Other classes at this time</p>
        )}
        {classes.length === 0 && enrolledHere.length === 0 && (
          <p className="text-sm text-gray-400 py-4 text-center">
            {/* Only blame age when the age filter actually hid something —
                otherwise "for age 17" misreads a thin catalog as an age problem. */}
            {ageHidden.length > 0
              ? `No open classes for age ${age} meet at this time — try another slot.`
              : 'No classes are open for registration at this time — try another slot.'}
          </p>
        )}
        {classes.map((c) => {
          const conflict = conflictsWith(c, enrolled)
          const full = c.is_full
          return (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 hover:border-optio-purple/50 transition-colors">
              <div className="min-w-0">
                <div className="font-medium text-gray-900 truncate">{c.name}</div>
                <div className="text-xs text-gray-500">
                  {meetingText(c.meetings)}
                  {money(c.price_cents) ? ` · ${money(c.price_cents)}` : ''}
                  {c.spots_left != null && !full ? ` · ${c.spots_left} spot${c.spots_left === 1 ? '' : 's'} left` : ''}
                </div>
                <div className="flex gap-1.5 mt-0.5">
                  {full && <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">Full — waitlist</span>}
                  {conflict && <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-600">Overlaps {conflict}</span>}
                </div>
              </div>
              <div className="shrink-0 ml-3 flex items-center gap-2">
                <button onClick={() => onDetails(c)} className="text-sm text-optio-purple hover:underline">Details</button>
                <button onClick={() => onAdd(c)} disabled={busy === c.id || !!conflict}
                  title={conflict ? `Overlaps ${conflict} — drop it first` : undefined}
                  className="btn-primary">
                  {busy === c.id ? 'Adding…' : full ? 'Waitlist' : 'Add'}
                </button>
              </div>
            </div>
          )
        })}
        {!locked && ageHidden.length > 0 && (
          <AgeExceptionFooter ageHidden={ageHidden} requestedIds={requestedIds}
            busy={busy} onRequest={onRequestException} />
        )}
      </div>
    </div>
  </ModalOverlay>
)

// Classes at this slot the age filter hid. Deliberately understated — the
// school grants exceptions sparingly, so this is a quiet footnote link, not a
// button alongside the class list.

export default SlotClassesModal
