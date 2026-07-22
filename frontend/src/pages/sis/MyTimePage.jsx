import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { getPreviewTeacher, withPreview } from './teacherPreview'

/**
 * MyTimePage — the hourly teacher's time clock: clock in/out, review the
 * period's entries and totals, and see forgot-to-clock-out warnings. Entries
 * become "submitted" at clock-out and admins approve them on /timesheets.
 */

const iso = (d) => d.toISOString().slice(0, 10)

const defaultPeriod = () => {
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - 13)
  return { start: iso(start), end: iso(now) }
}

const STATUS_STYLES = {
  open: 'bg-amber-100 text-amber-800',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const MyTimePage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [{ start, end }, setPeriod] = useState(defaultPeriod())
  const [data, setData] = useState({ entries: [], total_hours: 0, forgot_clock_out: [] })
  const [openEntry, setOpenEntry] = useState(null)
  const [usesClock, setUsesClock] = useState(true)
  const [busy, setBusy] = useState(false)

  // Read once per mount — sessionStorage can't change without a navigation.
  const [preview] = useState(() => getPreviewTeacher())

  const load = useCallback(() => {
    if (!orgId) return
    api.get(withPreview(withOrg(`/api/sis/teacher/time/entries?start=${start}&end=${end}`, orgId), preview))
      .then((r) => setData(r.data || {}))
      .catch(() => toast.error('Failed to load your hours'))
    api.get(withPreview(withOrg('/api/sis/teacher/dashboard', orgId), preview))
      .then((r) => {
        setOpenEntry(r.data?.data?.open_time_entry || null)
        setUsesClock(Boolean(r.data?.data?.profile?.uses_time_clock))
      })
      .catch(() => {})
  }, [orgId, start, end, preview])

  useEffect(() => { load() }, [load])

  const clock = async (action) => {
    setBusy(true)
    try {
      await api.post(`/api/sis/teacher/time/${action}`, { organization_id: orgId })
      toast.success(action === 'clock-in' ? 'Clocked in' : 'Clocked out')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Time clock error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">My Time</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {usesClock && preview && (
        <p className="text-sm text-neutral-500">
          Viewing {preview.name}&apos;s hours. Clock actions are hidden in preview.
        </p>
      )}
      {usesClock && !preview ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
          {openEntry ? (
            <>
              <p className="text-sm text-neutral-600">
                Clocked in at {new Date(openEntry.clock_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </p>
              <button onClick={() => clock('clock-out')} disabled={busy}
                className="ml-auto px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-semibold disabled:opacity-50">
                Clock out
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-neutral-600">You are not clocked in.</p>
              <button onClick={() => clock('clock-in')} disabled={busy}
                className="ml-auto px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
                Clock in
              </button>
            </>
          )}
        </div>
      ) : !usesClock ? (
        <p className="text-sm text-neutral-500">
          {preview
            ? `The time clock is not enabled for ${preview.name}.`
            : 'The time clock is not enabled for your account. If you are an hourly employee, ask your administrator.'}
        </p>
      ) : null}

      {data.forgot_clock_out?.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You have {data.forgot_clock_out.length} entr{data.forgot_clock_out.length === 1 ? 'y' : 'ies'} from a previous
          day with no clock-out. Ask your administrator to correct {data.forgot_clock_out.length === 1 ? 'it' : 'them'}.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className="font-semibold text-neutral-900">Entries</h2>
          <input type="date" value={start} onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
          <span className="text-neutral-400">to</span>
          <input type="date" value={end} onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
          <span className="ml-auto text-sm font-semibold text-neutral-900">
            Total: {data.total_hours ?? 0}h
          </span>
        </div>
        {!data.entries?.length && <p className="text-sm text-neutral-500">No entries in this period.</p>}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">In</th>
                <th className="py-2 pr-4">Out</th>
                <th className="py-2 pr-4">Hours</th>
                <th className="py-2 pr-4">Job</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data.entries || []).map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-4 text-neutral-800">{e.work_date}</td>
                  <td className="py-2 pr-4">{e.clock_in ? new Date(e.clock_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                  <td className="py-2 pr-4">{e.clock_out ? new Date(e.clock_out).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                  <td className="py-2 pr-4 font-medium">{e.hours}</td>
                  <td className="py-2 pr-4 text-neutral-500">{e.job_label || '—'}</td>
                  <td className="py-2 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[e.status] || ''}`}>
                      {e.status}
                    </span>
                    {e.edit_reason && <span className="text-xs text-neutral-400 ml-2" title={e.edit_reason}>edited</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default MyTimePage
