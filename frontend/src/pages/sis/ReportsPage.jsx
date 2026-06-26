import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`
const pct = (rate) => (rate == null ? '—' : `${Math.round(rate * 100)}%`)

const Stat = ({ label, value }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-4">
    <div className="text-sm text-neutral-500">{label}</div>
    <div className="text-2xl font-bold text-neutral-900 mt-1">{value}</div>
  </div>
)

const ReportsPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [enrollment, setEnrollment] = useState(null)
  const [revenue, setRevenue] = useState(null)
  const [attendance, setAttendance] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      api.get(withOrg('/api/sis/reports/enrollment', orgId)),
      api.get(withOrg('/api/sis/reports/revenue', orgId)),
      api.get(withOrg('/api/sis/reports/attendance', orgId)),
    ])
      .then(([e, r, a]) => {
        setEnrollment(e.data?.report || null)
        setRevenue(r.data?.report || null)
        setAttendance(a.data?.report || null)
      })
      .catch(() => toast.error('Failed to load reports'))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Reports</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}

      {!loading && (
        <div className="space-y-8">
          <section>
            <h2 className="font-semibold text-neutral-900 mb-3">Enrollment</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Students" value={enrollment?.total ?? 0} />
              <Stat label="Enrolled" value={enrollment?.by_status?.enrolled ?? 0} />
              <Stat label="Applicants" value={enrollment?.by_status?.applicant ?? 0} />
              <Stat label="Active classes" value={enrollment?.active_classes ?? 0} />
            </div>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-3">Revenue (recorded)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Invoices" value={revenue?.invoice_count ?? 0} />
              <Stat label="Billed" value={money(revenue?.billed_cents)} />
              <Stat label="Collected" value={money(revenue?.collected_cents)} />
              <Stat label="Outstanding" value={money(revenue?.outstanding_cents)} />
            </div>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-3">Attendance</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Attendance rate" value={pct(attendance?.overall?.attendance_rate)} />
              <Stat label="Present" value={attendance?.overall?.counts?.present ?? 0} />
              <Stat label="Absent" value={attendance?.overall?.counts?.absent ?? 0} />
              <Stat label="Sessions" value={attendance?.overall?.total ?? 0} />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default ReportsPage
