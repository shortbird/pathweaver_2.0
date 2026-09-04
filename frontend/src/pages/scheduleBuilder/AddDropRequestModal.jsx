/**
 * Extracted from pages/ScheduleBuilderPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import { ModalOverlay, GlassTabBar, Spinner } from '../../components/ui'
import ClassDetailsModal, { meetingText, money } from '../../components/schedule/ClassDetailsModal'
import React, { useEffect, useMemo, useState, useCallback } from 'react'
import field from './field'
import fmtDate from './fmtDate'

/**
 * Add/drop request — what a family can still do once the builder is read-only.
 *
 * Deliberately built out of the schedule itself rather than a blank "describe
 * your request" box: the office has to act on this, and "can Charlotte switch
 * out of the Tuesday art one" is not something a coordinator can enter into the
 * SIS without a phone call back. Picking real classes produces a request that
 * names the class, the day and the time, so the change can be made from the
 * task alone.
 */
const AddDropRequestModal = ({ studentName, orgName, enrolled, catalog, deadline, busy, onClose, onSubmit }) => {
  const [drops, setDrops] = useState([])   // class ids
  const [adds, setAdds] = useState([])     // class ids
  const [note, setNote] = useState('')
  const [picking, setPicking] = useState('')

  const dropList = enrolled.filter((c) => drops.includes(c.id))
  const addList = adds.map((id) => catalog.find((c) => c.id === id)).filter(Boolean)
  const addable = catalog.filter((c) => !adds.includes(c.id))
  const nothingPicked = !dropList.length && !addList.length

  const toggleDrop = (id) => setDrops((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]))

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between px-4 pt-4 pb-2 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Request an add/drop</h2>
            <p className="text-xs text-gray-400">
              {orgName || 'The office'} makes the change and follows up
              {studentName ? ` about ${studentName.split(' ')[0]}` : ''}.
              {deadline ? ` Requests close after ${fmtDate(deadline)}.` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-4 pt-2 overflow-y-auto flex-1 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Classes to drop</p>
            {enrolled.length === 0 ? (
              <p className="text-sm text-gray-400">No classes are scheduled yet.</p>
            ) : (
              <div className="space-y-1.5">
                {enrolled.map((c) => (
                  <label key={c.id}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer ${drops.includes(c.id) ? 'border-red-300 bg-red-50/60' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="checkbox" className="mt-1" checked={drops.includes(c.id)}
                      onChange={() => toggleDrop(c.id)} />
                    <span className="min-w-0">
                      <span className="block font-medium text-gray-900 truncate">{c.name}</span>
                      <span className="block text-xs text-gray-500">{meetingText(c.meetings)}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Classes to add</p>
            {addList.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {addList.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border border-optio-purple/40 bg-optio-purple/5 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block font-medium text-gray-900 truncate">{c.name}</span>
                      <span className="block text-xs text-gray-500">{meetingText(c.meetings)}</span>
                    </span>
                    <button type="button" onClick={() => setAdds((a) => a.filter((x) => x !== c.id))}
                      className="text-sm text-gray-400 hover:text-gray-600 shrink-0 ml-3">Remove</button>
                  </div>
                ))}
              </div>
            )}
            {addable.length > 0 ? (
              <select className={`${field} w-full`} value={picking} aria-label="Class to add"
                onChange={(e) => {
                  if (!e.target.value) return
                  setAdds((a) => [...a, e.target.value])
                  setPicking('')
                }}>
                <option value="">Pick a class to add…</option>
                {addable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{meetingText(c.meetings) ? ` — ${meetingText(c.meetings)}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-400">No other classes are open right now.</p>
            )}
          </div>

          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
              Anything else the office should know?
            </span>
            <textarea className={`${field} w-full`} rows={3} value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — timing, a preferred teacher, why the change." />
          </label>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:underline">Cancel</button>
          <button type="button" disabled={busy || nothingPicked}
            title={nothingPicked ? 'Pick at least one class to add or drop' : undefined}
            onClick={() => onSubmit({ drops: dropList, adds: addList, note })}
            className="btn-primary disabled:opacity-50">
            {busy ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

export default AddDropRequestModal
