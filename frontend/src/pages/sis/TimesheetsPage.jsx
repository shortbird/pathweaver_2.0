import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

/**
 * TimesheetsPage (admin) — per-staff hour totals for a pay period, entry-level
 * review/edit (with an audit reason), period approval, and the payroll CSV
 * export. Export only: the platform never calculates or issues pay beyond
 * hours x stored rate.
 */

const iso = (d) => d.toISOString().slice(0, 10)

const defaultPeriod = () => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() <= 15 ? 1 : 16)
  return { start: iso(start), end: iso(now) }
}

const STATUS_STYLES = {
  open: 'bg-amber-100 text-amber-800',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const EntryRow = ({ entry, orgId, onChanged }) => {
  const [editing, setEditing] = useState(false)
  const [clockIn, setClockIn] = useState('')
  const [clockOut, setClockOut] = useState('')
  const [reason, setReason] = useState('')

  const toLocal = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const startEdit = () => {
    setClockIn(toLocal(entry.clock_in))
    setClockOut(toLocal(entry.clock_out))
    setReason('')
    setEditing(true)
  }

  const save = async () => {
    if (!reason.trim()) { toast.error('An edit reason is required'); return }
    try {
      await api.patch(`/api/sis/staff-admin/time-entries/${entry.id}`, {
        organization_id: orgId,
        clock_in: clockIn ? new Date(clockIn).toISOString() : entry.clock_in,
        clock_out: clockOut ? new Date(clockOut).toISOString() : entry.clock_out,
        edit_reason: reason.trim(),
      })
      toast.success('Entry updated')
      setEditing(false)
      onChanged()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update the entry')
    }
  }

  const setStatus = async (status) => {
    try {
      await api.patch(`/api/sis/staff-admin/time-entries/${entry.id}`, {
        organization_id: orgId, status,
      })
      onChanged()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update')
    }
  }

  return (
    <tr>
      <td className="py-1.5 pr-3">{entry.work_date}</td>
      <td className="py-1.5 pr-3">
        {editing
          ? <input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className="border border-gray-300 rounded px-1 py-0.5 text-xs" />
          : (entry.clock_in ? new Date(entry.clock_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—')}
      </td>
      <td className="py-1.5 pr-3">
        {editing
          ? <input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className="border border-gray-300 rounded px-1 py-0.5 text-xs" />
          : (entry.clock_out ? new Date(entry.clock_out).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—')}
      </td>
      <td className="py-1.5 pr-3 font-medium">{entry.hours}</td>
      <td className="py-1.5 pr-3">
        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[entry.status] || ''}`}>{entry.status}</span>
        {entry.edit_reason && <span className="text-xs text-neutral-400 ml-1.5" title={entry.edit_reason}>edited</span>}
      </td>
      <td className="py-1.5 text-right">
        {editing ? (
          <span className="flex items-center gap-1.5 justify-end">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Edit reason (required)"
              className="border border-gray-300 rounded px-1.5 py-0.5 text-xs w-40" />
            <button onClick={save} className="text-xs px-2 py-1 rounded bg-neutral-900 text-white">Save</button>
            <button onClick={() => setEditing(false)} className="text-xs text-neutral-500">Cancel</button>
          </span>
        ) : (
          <span className="flex items-center gap-2 justify-end">
            {entry.status === 'submitted' && (
              <button onClick={() => setStatus('approved')} className="text-xs px-2 py-1 rounded bg-green-600 text-white">Approve</button>
            )}
            <button onClick={startEdit} className="text-xs text-optio-purple hover:underline">Edit</button>
          </span>
        )}
      </td>
    </tr>
  )
}

const TimesheetsPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [{ start, end }, setPeriod] = useState(defaultPeriod())
  const [sheets, setSheets] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg(`/api/sis/staff-admin/timesheets?start=${start}&end=${end}`, orgId))
      .then((r) => setSheets(r.data?.timesheets || []))
      .catch(() => toast.error('Failed to load timesheets'))
      .finally(() => setLoading(false))
  }, [orgId, start, end])

  useEffect(() => { load() }, [load])

  const approveAll = async (userId) => {
    try {
      const r = await api.post('/api/sis/staff-admin/timesheets/approve', {
        organization_id: orgId, user_id: userId, start, end,
      })
      toast.success(`Approved ${r.data?.approved ?? 0} entries`)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not approve')
    }
  }

  const download = (path, name) => {
    api.get(withOrg(`${path}?start=${start}&end=${end}`, orgId), { responseType: 'blob' })
      .then((r) => {
        const url = URL.createObjectURL(new Blob([r.data]))
        const a = document.createElement('a')
        a.href = url; a.download = name; a.click()
        URL.revokeObjectURL(url)
      })
      .catch(() => toast.error('Export failed'))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-900">Timesheets</h1>
        <div className="flex flex-wrap items-center gap-3">
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
          <input type="date" value={start} onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
          <span className="text-neutral-400">to</span>
          <input type="date" value={end} onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
          <button onClick={() => download('/api/sis/staff-admin/payroll.csv', `payroll_${start}_${end}.csv`)}
            className="px-3 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold">
            Export payroll CSV
          </button>
        </div>
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !sheets.length && (
        <p className="text-neutral-500">No time entries in this period.</p>
      )}

      <div className="space-y-3">
        {sheets.map((s) => (
          <details key={s.user_id} className="bg-white rounded-xl border border-gray-200">
            <summary className="px-4 py-3 cursor-pointer flex flex-wrap items-center gap-3">
              <span className="font-semibold text-neutral-900">{s.name}</span>
              {s.payroll_id && <span className="text-xs text-neutral-400">#{s.payroll_id}</span>}
              {s.pay_type && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-neutral-600 capitalize">{s.pay_type}</span>}
              <span className="ml-auto text-sm text-neutral-600">
                {s.total_hours}h total · <span className="text-green-700">{s.approved_hours}h approved</span>
                {s.open_entries > 0 && <span className="text-amber-700"> · {s.open_entries} open</span>}
              </span>
              <button onClick={(e) => { e.preventDefault(); approveAll(s.user_id) }}
                className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold">
                Approve period
              </button>
            </summary>
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">In</th>
                    <th className="py-2 pr-3">Out</th>
                    <th className="py-2 pr-3">Hours</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {s.entries.map((e) => (
                    <EntryRow key={e.id} entry={e} orgId={orgId} onChanged={load} />
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

export default TimesheetsPage
