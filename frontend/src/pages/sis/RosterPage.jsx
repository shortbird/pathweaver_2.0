import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import StudentDetailModal from './StudentDetailModal'

const STATUSES = ['applicant', 'enrolled', 'withdrawn', 'graduated', 'unassigned']

const statusStyle = (s) => ({
  enrolled: 'bg-green-100 text-green-700',
  applicant: 'bg-yellow-100 text-yellow-700',
  withdrawn: 'bg-red-100 text-red-700',
  graduated: 'bg-blue-100 text-blue-700',
  unassigned: 'bg-gray-100 text-gray-600',
}[s] || 'bg-gray-100 text-gray-600')

const RosterPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg('/api/sis/roster', orgId))
      .then((r) => setRoster(r.data?.roster || []))
      .catch(() => toast.error('Failed to load roster'))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const updateStatus = async (studentId, status) => {
    try {
      await api.patch(`/api/sis/enrollments/${studentId}`, {
        status: status === 'unassigned' ? 'enrolled' : status,
        organization_id: orgId,
      })
      toast.success('Enrollment updated')
      load()
    } catch {
      toast.error('Could not update enrollment')
    }
  }

  const exportCsv = async () => {
    try {
      const res = await api.get(withOrg('/api/sis/reports/roster.csv', orgId), { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'roster.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Export failed')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Roster</h1>
        <div className="flex items-center gap-3">
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!roster.length}>
            Export CSV
          </Button>
        </div>
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !roster.length && (
        <p className="text-neutral-500">No students found for this organization.</p>
      )}

      {!loading && roster.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Family</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">XP</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {roster.map((s) => (
                <tr key={s.student_id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{s.name}</div>
                    <div className="text-xs text-neutral-400">{s.email || s.username}</div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{s.household_name || '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={s.enrollment_status}
                      onChange={(e) => updateStatus(s.student_id, e.target.value)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium border-0 focus:ring-2 focus:ring-optio-purple ${statusStyle(s.enrollment_status)}`}
                    >
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{s.total_xp ?? 0}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelected(s)}
                      className="text-optio-purple font-medium hover:underline"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <StudentDetailModal
          student={selected}
          orgId={orgId}
          onClose={() => setSelected(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

export default RosterPage
