import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

/**
 * Daily check-in card for the Parent dashboard. Renders ONLY for children enrolled
 * in an SIS-enabled school (the /today endpoint reports applicable=false otherwise),
 * so non-SIS families never see it. Lets a guardian check their child in at drop-off,
 * out at pickup, or report a full-day absence.
 *
 * `children`: [{ id, name }] — the parent's students (dependents + linked).
 */
const STATUS_LABEL = {
  checked_in: 'Checked in', checked_out: 'Checked out', absent: 'Absent today',
}

const ParentCheckInCard = ({ children = [] }) => {
  // rows: [{ id, name, status }] for SIS-applicable children only
  const [rows, setRows] = useState([])
  const [busyId, setBusyId] = useState(null)

  const refresh = useCallback(() => {
    if (!children.length) { setRows([]); return }
    Promise.all(children.map((c) =>
      api.get(`/api/sis/checkin/${c.id}/today`)
        .then((r) => (r.data?.applicable
          ? { id: c.id, name: c.name, status: r.data?.checkin?.status || null }
          : null))
        .catch(() => null)
    )).then((results) => setRows(results.filter(Boolean)))
  }, [children])

  useEffect(() => { refresh() }, [refresh])

  const act = async (id, verb) => {
    setBusyId(id)
    try {
      await api.post(`/api/sis/checkin/${id}/${verb}`, {})
      toast.success('Updated')
      refresh()
    } catch {
      toast.error('Could not update check-in')
    } finally {
      setBusyId(null)
    }
  }

  if (!rows.length) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h2 className="font-semibold text-neutral-900 mb-2">Daily check-in</h2>
      <div className="divide-y divide-gray-100">
        {rows.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-2">
            <div>
              <span className="font-medium text-neutral-800">{c.name}</span>
              {c.status && <span className="ml-2 text-xs text-neutral-500">{STATUS_LABEL[c.status] || c.status}</span>}
            </div>
            <div className="flex gap-2">
              <button disabled={busyId === c.id} onClick={() => act(c.id, 'check-in')}
                className="text-sm font-semibold rounded-full bg-gradient-to-r from-optio-purple to-optio-pink text-white px-3 py-1 disabled:opacity-50">
                Check in
              </button>
              <button disabled={busyId === c.id} onClick={() => act(c.id, 'check-out')}
                className="text-sm rounded-full border border-gray-300 px-3 py-1 disabled:opacity-50">
                Check out
              </button>
              <button disabled={busyId === c.id} onClick={() => act(c.id, 'absence')}
                className="text-sm text-red-500 hover:underline px-2 disabled:opacity-50">
                Absent
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ParentCheckInCard
