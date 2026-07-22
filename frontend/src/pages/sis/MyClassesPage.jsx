import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { getPreviewTeacher, withPreview } from './teacherPreview'

/**
 * MyClassesPage — the teacher's classes with meeting times and roster counts.
 * Data comes pre-scoped from /api/sis/teacher/classes.
 */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const fmtTime = (hhmm) => {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}

const meetingLabel = (m) => {
  const when = m.specific_date ? m.specific_date : DAY_LABELS[m.day_of_week] || ''
  return `${when} ${fmtTime(m.start_time)}–${fmtTime(m.end_time)}`
}

const MyClassesPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(withPreview(withOrg('/api/sis/teacher/classes', orgId), getPreviewTeacher()))
      .then((r) => setClasses(r.data?.classes || []))
      .catch(() => toast.error('Failed to load your classes'))
      .finally(() => setLoading(false))
  }, [orgId])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">My Classes</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !classes.length && (
        <p className="text-neutral-500">No classes assigned to you yet — talk to your administrator.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {classes.map((c) => (
          <Link key={c.id} to={`/my-classes/${c.id}`}
            className="bg-white rounded-xl border border-gray-200 p-4 hover:border-optio-purple/50 transition-colors flex flex-col">
            <h3 className="font-semibold text-neutral-900 truncate">{c.name}</h3>
            <p className="text-sm text-neutral-500 mb-2">
              {c.enrolled_count} student{c.enrolled_count === 1 ? '' : 's'}
              {c.location ? ` · ${c.location}` : ''}
            </p>
            <div className="mt-auto space-y-0.5">
              {(c.meetings || []).slice(0, 4).map((m) => (
                <p key={m.id} className="text-xs text-neutral-500">{meetingLabel(m)}</p>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default MyClassesPage
