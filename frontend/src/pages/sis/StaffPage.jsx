import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

const ROLE_STYLE = {
  'Org Admin': 'bg-optio-purple/10 text-optio-purple',
  Teacher: 'bg-blue-100 text-blue-700',
}

const initials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('')

const fmtDate = (d) => {
  if (!d) return null
  try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return null }
}

const StaffPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg('/api/sis/staff', orgId))
      .then((r) => setStaff(r.data?.staff || []))
      .catch(() => toast.error('Failed to load staff'))
      .finally(() => setLoading(false))
  }, [orgId])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Staff</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !staff.length && (
        <p className="text-neutral-500">No org admins or advisors in this organization yet.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {staff.map((s) => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
            {/* Avatar hero */}
            <div className="h-24 bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center text-xl font-semibold">
                {initials(s.name)}
              </div>
            </div>

            {/* Body */}
            <div className="p-4 flex flex-col flex-1 text-center">
              <h3 className="font-semibold text-neutral-900 truncate">{s.name}</h3>
              {s.email && <p className="text-sm text-neutral-500 truncate">{s.email}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5 justify-center">
                {(s.role_labels || []).map((r) => (
                  <span key={r} className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${ROLE_STYLE[r] || 'bg-neutral-100 text-neutral-600'}`}>{r}</span>
                ))}
              </div>
              {fmtDate(s.last_active) && (
                <p className="mt-auto pt-3 text-xs text-neutral-400">Active {fmtDate(s.last_active)}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {!loading && staff.length > 0 && (
        <p className="text-sm text-neutral-400 mt-3">{staff.length} staff member{staff.length === 1 ? '' : 's'}</p>
      )}
    </div>
  )
}

export default StaffPage
