import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { RolePill } from '../../components/ui/RolePill'

/**
 * DirectoryPage — the staff directory teachers can browse: name, photo,
 * position, role, bio, and work email. Read-only; admin employment fields
 * never leave the backend (/api/sis/teacher/directory).
 */

const initials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('')

const DirectoryPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withOrg('/api/sis/teacher/directory', orgId))
      .then((r) => setStaff(r.data?.staff || []))
      .catch(() => toast.error('Failed to load the directory'))
      .finally(() => setLoading(false))
  }, [orgId])

  const visible = staff.filter((s) =>
    !q.trim() || `${s.name} ${s.position || ''}`.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Staff Directory</h1>
        <div className="flex items-center gap-3">
          <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff…"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !visible.length && <p className="text-neutral-500">No staff found.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map((s) => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4">
            {s.avatar_url ? (
              <img src={s.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center font-semibold shrink-0">
                {initials(s.name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-neutral-900 truncate">{s.name}</p>
              {s.position && <p className="text-sm text-neutral-600">{s.position}</p>}
              <div className="flex flex-wrap gap-1 mt-1">
                {(s.roles || []).map((r) => <RolePill key={r} role={r} />)}
              </div>
              {s.email && (
                <a href={`mailto:${s.email}`} className="block text-sm text-optio-purple hover:underline truncate mt-1">
                  {s.email}
                </a>
              )}
              {s.work_schedule && <p className="text-xs text-neutral-400 mt-1">{s.work_schedule}</p>}
              {s.bio && <p className="text-sm text-neutral-500 mt-1 line-clamp-2">{s.bio}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DirectoryPage
