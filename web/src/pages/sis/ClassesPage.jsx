import React, { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSisOrg } from './useSisOrg'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import { isSisAdmin } from './sisRole'
import { getPreviewTeacher } from './teacherPreview'
import { isPathHidden } from './sisModules'
import BackToDashboard from '../../components/sis/BackToDashboard'
import GlassTabBar from '../../components/ui/GlassTabBar'
import MyClassesPanel from './classesPage/MyClassesPanel'
import MySchedulePanel from './classesPage/MySchedulePanel'
import CatalogPanel, { ConflictBanner } from './classesPage/CatalogPanel'
import AttendancePanel from './classesPage/AttendancePanel'
import SubmissionsPanel from './classesPage/SubmissionsPanel'

// Re-exported: the conflict banner is tested and reused by name from here.
export { ConflictBanner }

/**
 * Classes -- one page, organized the way people think about their teaching:
 *
 *   My classes     the ones I teach (cards, or my week as a grid)
 *   My schedule    my week as a list: classes and duties, plus what is coming up
 *   Submissions    what my students have turned in
 *   All classes    the org's catalog                                   admins
 *   Optio courses  the courses the org can enroll students into        admins
 *   Attendance     taking roll                                         admins
 *
 * Until 2026-09-17 these were five pages under "Academics" (Classes, My
 * Classes, My Schedule, Attendance, Submissions). They are one noun seen from
 * different directions -- mine vs. the school's, this week vs. the catalog,
 * what students owe me vs. who was in the room -- and nothing was joined
 * across them; every admin endpoint is gated server-side, so showing the
 * office's tabs only to admins loses nothing. The class itself is still its
 * own page (/my-classes/:id, TeacherClassPage): roster, quests, curriculum,
 * progress and messages for one class.
 *
 * An admin lands on the catalog, the daily page for the office; a teacher on
 * their own classes. Old paths (/my-classes, /my-schedule, /attendance,
 * /submissions) redirect here with their query strings, so notification
 * links and the progress tab's "back to submissions" still land on the tab.
 */

const OWN_TABS = [
  ['mine', 'My classes'],
  ['schedule', 'My schedule'],
  ['submissions', 'Submissions', '/submissions'],
]

const officeTabsFor = (orgName) => [
  ['all', `${orgName} classes`],
  ['courses', 'Optio courses'],
  ['attendance', 'Attendance', '/attendance'],
]

const ClassesPage = () => {
  const { user } = useAuth()
  const { orgId, orgs, activeOrg } = useSisOrg()
  const { organization } = useOrganization()
  const orgName = organization?.name || orgs.find((o) => o.id === orgId)?.name || 'Org'
  const [searchParams, setSearchParams] = useSearchParams()
  const [preview] = useState(() => getPreviewTeacher())
  const admin = isSisAdmin(user)
  // A tab whose module the org turned off is not offered (sisModules): the
  // config is a promise already made.
  const TABS = [...OWN_TABS, ...(admin ? officeTabsFor(orgName) : [])]
    .filter(([, , modulePath]) => !modulePath || !isPathHidden(modulePath, activeOrg))
  // An admin's daily page is the catalog; a teacher's is their own classes.
  // An unknown ?tab= (a bookmark, an office tab reached by a teacher) lands
  // on that default. A preview lands on the teacher's classes, which the
  // teacher routes support.
  const fallback = admin && !preview ? 'all' : 'mine'
  const rawTab = searchParams.get('tab')
  const tab = TABS.some(([t]) => t === rawTab) ? rawTab : fallback
  const [counts, setCounts] = useState({})
  const onCounts = useCallback((next) => setCounts((p) => (
    p.all === next.all && p.courses === next.courses ? p : { ...p, ...next })), [])

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams)
    if (next === fallback) params.delete('tab')
    else params.set('tab', next)
    // Deep-link state belongs to its own tab.
    if (next !== 'all') params.delete('class')
    if (next !== 'submissions') { params.delete('class_id'); params.delete('completion_id'); params.delete('from') }
    setSearchParams(params, { replace: true })
  }

  return (
    <div>
      <BackToDashboard className="mb-1" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-neutral-900">Classes</h1>
      </div>

      <GlassTabBar
        align="start" size="md" className="mb-5" aria-label="Classes sections"
        tabs={TABS.map(([id, label]) => ({ id, label, badge: counts[id] || null }))}
        active={tab} onSelect={setTab}
      />

      {tab === 'mine' && <MyClassesPanel />}
      {tab === 'schedule' && <MySchedulePanel />}
      {tab === 'submissions' && <SubmissionsPanel />}
      {admin && (tab === 'all' || tab === 'courses') && (
        <CatalogPanel section={tab === 'courses' ? 'courses' : 'classes'} onCounts={onCounts} />
      )}
      {admin && tab === 'attendance' && <AttendancePanel />}
    </div>
  )
}

export default ClassesPage
