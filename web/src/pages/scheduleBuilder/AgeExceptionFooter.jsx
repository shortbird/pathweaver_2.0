/**
 * Extracted from pages/ScheduleBuilderPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import field from './field'
import ageBandText from './ageBandText'

const AgeExceptionFooter = ({ ageHidden, requestedIds, busy, onRequest }) => {
  const [open, setOpen] = useState(false)
  const [classId, setClassId] = useState('')
  const [message, setMessage] = useState('')
  const requested = ageHidden.filter((c) => requestedIds?.has(c.id))
  const askable = ageHidden.filter((c) => !requestedIds?.has(c.id))
  const chosen = askable.find((c) => c.id === classId) || askable[0]
  return (
    <div className="pt-3 mt-1 border-t border-gray-100 space-y-1.5">
      {requested.map((c) => (
        <p key={c.id} className="text-xs text-gray-400">
          Age exception requested for {c.name} — the school will follow up.
        </p>
      ))}
      {askable.length > 0 && (!open ? (
        <p className="text-xs text-gray-400">
          Some classes at this time are for other ages. Exceptions are rare, but you can{' '}
          <button type="button" onClick={() => setOpen(true)} className="underline hover:text-gray-600">
            ask the school for an age exception
          </button>.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            The school reviews each request individually and will follow up with you.
          </p>
          <select className={`${field} w-full`} value={chosen?.id || ''}
            onChange={(e) => setClassId(e.target.value)} aria-label="Class to request">
            {askable.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({ageBandText(c)})</option>
            ))}
          </select>
          <textarea className={`${field} w-full`} rows={2} value={message}
            placeholder="Why does this class fit your student? (optional)"
            onChange={(e) => setMessage(e.target.value)} />
          <div className="flex items-center gap-3">
            <button type="button" disabled={!chosen || busy === chosen?.id}
              onClick={async () => {
                const ok = await onRequest(chosen, message)
                if (ok) { setOpen(false); setMessage(''); setClassId('') }
              }}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-optio-purple/40 text-optio-purple hover:bg-optio-purple/5 disabled:opacity-50">
              {busy === chosen?.id ? 'Sending…' : 'Send request'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-400 hover:underline">Cancel</button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default AgeExceptionFooter
