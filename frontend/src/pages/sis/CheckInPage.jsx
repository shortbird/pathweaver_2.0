import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'
const today = () => new Date().toISOString().slice(0, 10)
const STATUS_STYLE = {
  checked_in: 'bg-green-100 text-green-700',
  checked_out: 'bg-blue-100 text-blue-700',
  absent: 'bg-red-100 text-red-700',
}
const fmt = (ts) => (ts ? new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '')

const CheckInPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [date, setDate] = useState(today())
  const [board, setBoard] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(`/api/sis/checkin/day?date=${date}&organization_id=${orgId}`)
      .then((r) => setBoard(r.data?.board || []))
      .catch(() => toast.error('Failed to load check-ins'))
      .finally(() => setLoading(false))
  }, [orgId, date])

  useEffect(() => { load() }, [load])

  const act = async (studentId, verb) => {
    const path = verb === 'absence' ? 'absence' : verb
    try {
      await api.post(`/api/sis/checkin/${studentId}/${path}`, { organization_id: orgId })
      load()
    } catch { toast.error('Could not update check-in') }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Check-In</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !board.length && <p className="text-neutral-500">No enrolled students to check in.</p>}

      <div className="space-y-2">
        {board.map((s) => (
          <div key={s.student_user_id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div>
              <span className="font-medium text-neutral-800">{s.name}</span>
              {s.status && (
                <span className={`ml-3 text-xs rounded-full px-2 py-0.5 ${STATUS_STYLE[s.status] || ''}`}>
                  {s.status.replace('_', ' ')}
                  {s.status === 'checked_in' && s.checked_in_at ? ` · ${fmt(s.checked_in_at)}` : ''}
                  {s.status === 'checked_out' && s.checked_out_at ? ` · ${fmt(s.checked_out_at)}` : ''}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => act(s.student_user_id, 'check-in')}>Check in</Button>
              <Button size="sm" variant="secondary" onClick={() => act(s.student_user_id, 'check-out')}>Check out</Button>
              <button onClick={() => act(s.student_user_id, 'absence')} className="text-sm text-red-500 hover:underline px-2">Absent</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CheckInPage
