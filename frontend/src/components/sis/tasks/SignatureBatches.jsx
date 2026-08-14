import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import { withOrg } from '../../../pages/sis/useSisOrg'

/**
 * Sent paperwork — who has signed what.
 *
 * One card per send ("Employee handbook — 8 of 12 signed"), expanding to the
 * people. This is the half of the ask that the old flow had no answer for at
 * all: documents went out through the secure store and the only way to know who
 * had signed was to open twelve checklists.
 *
 * Outstanding is the default view, for the same reason the requests queue
 * defaults to open work: a send everyone has signed is finished business, and
 * leaving it at the top of the list forever buries the three that are not.
 */

const fmtDate = (iso) => {
  if (!iso) return null
  try { return new Date(iso).toLocaleDateString() } catch { return null }
}

export default function SignatureBatches({ orgId, endpoint, reloadKey = 0, onCount = null }) {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('outstanding')
  const [reminding, setReminding] = useState(null)

  const load = useCallback(() => {
    if (!orgId) return
    setLoading(true)
    api.get(withOrg(endpoint, orgId))
      .then((r) => setBatches(r.data?.batches || []))
      .catch(() => toast.error('Failed to load sent paperwork'))
      .finally(() => setLoading(false))
  }, [orgId, endpoint])

  useEffect(() => { load() }, [load, reloadKey])

  const outstanding = useMemo(
    () => batches.filter((b) => b.signed_count < b.total_count), [batches])

  useEffect(() => { onCount?.(outstanding.length) }, [outstanding.length, onCount])

  const remind = async (batch, person) => {
    setReminding(person.assignment_id)
    try {
      await api.post(withOrg(`${endpoint}/${person.assignment_id}/remind`, orgId),
        { organization_id: orgId })
      toast.success(`Reminded ${person.name || 'them'}`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not send the reminder')
    } finally {
      setReminding(null)
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>
  if (!batches.length) {
    return <p className="text-sm text-neutral-500">Nothing sent for signature yet.</p>
  }

  const shown = view === 'outstanding' ? outstanding : batches

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1" role="group" aria-label="Filter sent paperwork">
        {[['outstanding', `Outstanding (${outstanding.length})`], ['', `All (${batches.length})`]].map(([value, label]) => (
          <button key={value || 'all'} onClick={() => setView(value)} aria-pressed={view === value}
            className={`px-3 py-1.5 rounded-lg text-sm ${view === value
              ? 'bg-optio-purple/10 text-optio-purple font-semibold'
              : 'text-neutral-600 hover:bg-gray-100'}`}>
            {label}
          </button>
        ))}
      </div>

      {!shown.length && (
        <p className="text-sm text-neutral-500">Everything sent has been signed.</p>
      )}

      {shown.map((b) => {
        const complete = b.signed_count === b.total_count
        return (
          <details key={b.batch_id} className="border border-gray-200 rounded-lg">
            <summary className="px-3 py-2.5 cursor-pointer flex items-center gap-2 text-sm flex-wrap">
              <span className="font-medium text-neutral-900">{b.title}</span>
              {b.sensitivity === 'hr' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">HR</span>
              )}
              {b.sent_at && <span className="text-xs text-neutral-400">sent {fmtDate(b.sent_at)}</span>}
              {b.due_date && <span className="text-xs text-neutral-400">due {b.due_date}</span>}
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                complete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
                {b.signed_count}/{b.total_count} signed
              </span>
            </summary>
            <ul className="px-3 pb-3 divide-y divide-gray-100">
              {(b.recipients || []).map((p) => (
                <li key={p.assignment_id} className="py-2 flex items-center gap-2 text-sm flex-wrap">
                  <span className="text-neutral-800">{p.name || 'Unknown'}</span>
                  {p.audience === 'family' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-optio-pink/10 text-optio-pink">Family</span>
                  )}
                  {p.signed ? (
                    <span className="ml-auto text-xs text-green-700">
                      Signed{p.signed_name ? ` by ${p.signed_name}` : ''}
                      {p.signed_at ? ` on ${fmtDate(p.signed_at)}` : ''}
                    </span>
                  ) : (
                    <span className="ml-auto flex items-center gap-3">
                      <span className="text-xs text-neutral-400">Not signed yet</span>
                      {/* The natural next click after reading "3 of 12". */}
                      <button onClick={() => remind(b, p)} disabled={reminding === p.assignment_id}
                        className="text-xs text-optio-purple font-medium hover:underline disabled:opacity-50">
                        {reminding === p.assignment_id ? 'Reminding…' : 'Remind'}
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )
      })}
    </div>
  )
}
