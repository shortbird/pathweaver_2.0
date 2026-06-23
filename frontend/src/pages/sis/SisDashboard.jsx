import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

const StatCard = ({ label, value, accent }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5">
    <div className="text-3xl font-bold text-neutral-900">{value}</div>
    <div className={`text-sm mt-1 ${accent || 'text-neutral-500'}`}>{label}</div>
  </div>
)

const STATUS_LABELS = {
  enrolled: 'Enrolled',
  applicant: 'Applicants',
  withdrawn: 'Withdrawn',
  graduated: 'Graduated',
  unassigned: 'No status',
}

const SisDashboard = () => {
  const { orgId, setOrgId, orgs, isSuperadmin, loading: orgLoading } = useSisOrg()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg('/api/sis/dashboard', orgId))
      .then((r) => { setData(r.data?.data); setError(null) })
      .catch((e) => setError(e.response?.data?.error || 'Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [orgId])

  const counts = data?.enrollment_status || {}

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">School Dashboard</h1>
          {data?.organization?.name && (
            <p className="text-neutral-500 mt-1">{data.organization.name}</p>
          )}
        </div>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {(loading || orgLoading) && <p className="text-neutral-500">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!orgId && !orgLoading && (
        <p className="text-neutral-500">Select an organization to view its dashboard.</p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total students" value={data.total_students} />
            <StatCard label="Active (last 7 days)" value={data.active_last_7_days} accent="text-green-600" />
            <StatCard label="Families" value={data.households} />
            <StatCard label="Enrolled" value={counts.enrolled || 0} accent="text-optio-purple" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="font-semibold text-neutral-900 mb-4">Enrollment status</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <div key={key} className="text-center">
                  <div className="text-2xl font-bold text-neutral-900">{counts[key] || 0}</div>
                  <div className="text-xs text-neutral-500 mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Link to="/roster" className="text-sm font-semibold text-optio-purple hover:underline">
              View roster →
            </Link>
            <Link to="/households" className="text-sm font-semibold text-optio-purple hover:underline">
              Manage families →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

export default SisDashboard
