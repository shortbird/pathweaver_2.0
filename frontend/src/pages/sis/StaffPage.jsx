import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import Button from '../../components/ui/Button'
import { RolePill } from '../../components/ui/RolePill'
import TeacherModal from '../../components/sis/TeacherModal'
import LinkStaffAccountModal from '../../components/sis/LinkStaffAccountModal'

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
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [linking, setLinking] = useState(null)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg('/api/sis/staff', orgId))
      .then((r) => setStaff(r.data?.staff || []))
      .catch(() => toast.error('Failed to load staff'))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const closeModals = () => { setAdding(false); setEditing(null) }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Staff</h1>
        <div className="flex items-center gap-3">
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
          <Button size="sm" onClick={() => setAdding(true)} disabled={!orgId}>Add teacher</Button>
        </div>
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !staff.length && (
        <p className="text-neutral-500">No org admins or teachers in this organization yet.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {staff.map((s) => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
            {/* Avatar hero */}
            <div className="h-24 bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 flex items-center justify-center">
              {s.avatar_url ? (
                <img src={s.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-white shadow" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center text-xl font-semibold">
                  {initials(s.name)}
                </div>
              )}
            </div>

            {/* Body */}
            <div className="p-4 flex flex-col flex-1 text-center">
              <h3 className="font-semibold text-neutral-900 truncate">{s.name}</h3>
              {s.email && !s.is_placeholder && (
                <p className="text-sm text-neutral-500 truncate">{s.email}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5 justify-center">
                {(s.roles || []).map((r) => <RolePill key={r} role={r} />)}
                {s.is_placeholder && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                    No login yet
                  </span>
                )}
              </div>
              {s.is_placeholder && (
                <button
                  onClick={() => setLinking(s)}
                  className="mt-2 text-sm text-optio-purple font-medium hover:underline"
                >
                  Link their account
                </button>
              )}
              {s.bio && <p className="mt-2 text-sm text-neutral-600 line-clamp-3">{s.bio}</p>}
              <div className="mt-auto pt-3 flex items-center justify-between">
                {fmtDate(s.last_active)
                  ? <span className="text-xs text-neutral-400">Active {fmtDate(s.last_active)}</span>
                  : <span />}
                <button onClick={() => setEditing(s)} className="text-sm text-optio-purple font-medium hover:underline">
                  Edit
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loading && staff.length > 0 && (
        <p className="text-sm text-neutral-400 mt-3">{staff.length} staff member{staff.length === 1 ? '' : 's'}</p>
      )}

      {(adding || editing) && (
        <TeacherModal
          orgId={orgId}
          initial={editing}
          onClose={closeModals}
          onSaved={() => { closeModals(); load() }}
        />
      )}

      {linking && (
        <LinkStaffAccountModal
          orgId={orgId}
          staff={linking}
          onClose={() => setLinking(null)}
          onLinked={() => { setLinking(null); load() }}
        />
      )}
    </div>
  )
}

export default StaffPage
