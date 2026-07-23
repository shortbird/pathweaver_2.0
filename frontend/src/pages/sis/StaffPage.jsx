import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import Button from '../../components/ui/Button'
import { RolePill } from '../../components/ui/RolePill'
import TeacherModal from '../../components/sis/TeacherModal'
import LinkStaffAccountModal from '../../components/sis/LinkStaffAccountModal'
import StaffProfileModal from '../../components/sis/StaffProfileModal'
import StaffDetailModal from '../../components/sis/StaffDetailModal'
import { setPreviewTeacher } from './teacherPreview'

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
  // Clicking a card opens the detail modal; its footer actions hand off to the
  // edit / employment / link modals (same clickable-card pattern as Users and
  // Families).
  const [viewing, setViewing] = useState(null)
  const [editing, setEditing] = useState(null)
  const [linking, setLinking] = useState(null)
  const [managing, setManaging] = useState(null)
  const navigate = useNavigate()

  const openPortalPreview = (s) => {
    setPreviewTeacher(s)
    navigate('/')
    // Sidebar + layout read the preview at render time; a reload guarantees
    // every piece of chrome picks it up.
    window.location.reload()
  }

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
          <button
            key={s.id}
            type="button"
            onClick={() => setViewing(s)}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col text-left hover:border-optio-purple/50 hover:shadow-sm transition-all cursor-pointer"
          >
            {/* Avatar hero */}
            <div className="h-24 w-full bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 flex items-center justify-center">
              {s.avatar_url ? (
                <img src={s.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-white shadow" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center text-xl font-semibold">
                  {initials(s.name)}
                </div>
              )}
            </div>

            {/* Body */}
            <div className="p-4 flex flex-col flex-1 text-center w-full">
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
                {s.login_pending && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Invite pending
                  </span>
                )}
              </div>
              {s.bio && <p className="mt-2 text-sm text-neutral-600 line-clamp-3">{s.bio}</p>}
              {fmtDate(s.last_active) && (
                <p className="mt-auto pt-3 text-xs text-neutral-400">Active {fmtDate(s.last_active)}</p>
              )}
            </div>
          </button>
        ))}
      </div>

      {!loading && staff.length > 0 && (
        <p className="text-sm text-neutral-400 mt-3">{staff.length} staff member{staff.length === 1 ? '' : 's'}</p>
      )}

      {viewing && (
        <StaffDetailModal
          orgId={orgId}
          staff={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null) }}
          onEmployment={() => { setManaging(viewing); setViewing(null) }}
          onLink={() => { setLinking(viewing); setViewing(null) }}
          onViewPortal={() => openPortalPreview(viewing)}
        />
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

      {managing && (
        <StaffProfileModal
          orgId={orgId}
          staff={managing}
          onClose={() => setManaging(null)}
          onSaved={() => { setManaging(null); load() }}
        />
      )}
    </div>
  )
}

export default StaffPage
