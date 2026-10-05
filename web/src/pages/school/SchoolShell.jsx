import React from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useOrganization } from '../../contexts/OrganizationContext'
import { useAuth } from '../../contexts/AuthContext'
import { useFamilyScope } from '../../contexts/FamilyScopeContext'
import { useSchoolContext, useFamilyOrgSelection } from '../../hooks/api/useSchoolContext'
import { GlassTabBar } from '../../components/ui'
import SchoolLetterhead from '../../components/school/SchoolLetterhead'
import { familyNavItemsFor } from './schoolCards'
import { isFamilyFirstHubOrg } from '../../config/optioAcademy'
import useFamilyVolunteerHours from '../../hooks/api/useFamilyVolunteerHours'

/**
 * The school, as one page. The letterhead, then a glass tab rail — Feed,
 * Calendar, Schedule (or Goal Setting), Absences, Billing, To do, Prior
 * Learning — then the tab's own content. Each tab keeps the URL it always had
 * (/school, /school-calendar, /schedule-builder, /absences, /family/billing,
 * /family/forms, /family/prior-learning), so every emailed link, notification
 * and mobile hand-off still lands on the right tab, and the sidebar needs one
 * item for the school instead of eight.
 *
 * Until 2026-09-16 these were eight separate pages, each with its own title,
 * its own width, its own "Back to school" link, and in five cases its own
 * student picker in its own style. A parent with three children re-picked
 * the child on every page. The tabs are the family catalog the sidebar
 * section read (schoolCards.familyNavItemsFor); a viewer with no family
 * doors — a student, a teacher who guards nobody — gets the letterhead and
 * the feed, no rail (GlassTabBar hides itself below two tabs).
 *
 * The per-child tabs share ONE student picker, and it is family scope
 * (FamilyScopeContext.enterScope), so the child chosen here is the child the
 * rest of the app is scoped to. Absences keeps its own multi-select: there,
 * several children at once is the normal case.
 *
 * A superadmin belongs to no school; the school page keeps its own preview
 * chrome (org and role pickers) and renders its own letterhead for the org
 * being previewed, so the shell stays out of the way.
 */

// Tabs whose content is one child's: the shell's student picker shows here.
const PER_CHILD_TABS = new Set(['/schedule-builder', '/family/goals', '/courses-and-credits'])

// Older links: /announcements has always landed on the school page.
const ALIASES = { '/announcements': '/school' }

export default function SchoolShell() {
  const { school } = useOrganization()
  const { user, effectiveRole } = useAuth()
  const { orgs } = useSchoolContext({ enabled: Boolean(user?.id && school) })
  const schoolOrg = orgs?.[0] || null
  const { students, scopedStudentId } = useFamilyOrgSelection()
  const { enterScope } = useFamilyScope()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  // This family's own volunteer hours (iCreate 01082b30), asked only by a
  // guardian. Hooks run before the early return below.
  const volunteer = useFamilyVolunteerHours(schoolOrg?.organization_id, {
    enabled: Boolean(schoolOrg?.is_guardian),
  })

  if (effectiveRole === 'superadmin' && !school) return <Outlet />

  const items = familyNavItemsFor(schoolOrg, { homepage: Boolean(school?.homepage) })
  const tabs = items.map((item) => ({ id: item.path, label: item.tab || item.name }))
  const current = ALIASES[pathname] || pathname
  const active = tabs.some((t) => t.id === current) ? current : null

  // A family-first school has no Feed tab, so /school (old links, a typed
  // URL) opens its first real tab rather than an empty feed.
  if (current === '/school' && isFamilyFirstHubOrg(schoolOrg) && tabs.length && !active) {
    return <Navigate to={tabs[0].id} replace />
  }

  const showStudents = PER_CHILD_TABS.has(current) && students.length > 1
  const activeStudent = students.some((s) => s.student_id === scopedStudentId)
    ? scopedStudentId
    : students[0]?.student_id

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <SchoolLetterhead
        name={school?.name || schoolOrg?.organization_name}
        logoUrl={schoolOrg?.logo_url}
        logoSubtitle={schoolOrg?.logo_subtitle}
      />
      {volunteer.shown && <VolunteerHoursLine hours={volunteer.hours} updatedAt={volunteer.updatedAt} />}
      {tabs.length > 1 && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <GlassTabBar
            tabs={tabs}
            active={active}
            onSelect={(path) => navigate(path)}
            size="md"
            sticky
            aria-label="School"
          />
          {showStudents && (
            <GlassTabBar
              tabs={students.map((s) => ({ id: s.student_id, label: s.name }))}
              active={activeStudent}
              onSelect={enterScope}
              aria-label="Students"
            />
          )}
        </div>
      )}
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  )
}

/**
 * "Volunteer hours: 12.5" under the letterhead, on every school tab, for this
 * family alone. iCreate 01082b30: "Could we make a way for parents to be able
 * to see how many volunteer hours they have completed? ... keep it private so
 * not everyone sees everyone elses." The school keeps the number; the family
 * only reads it here.
 */
export function VolunteerHoursLine({ hours, updatedAt }) {
  const value = Number(hours || 0)
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '')
  const updated = updatedAt ? new Date(updatedAt).toLocaleDateString() : null
  return (
    <div className="mt-4 flex justify-center">
      <div className="inline-flex items-baseline gap-2 rounded-full border border-optio-purple/20 bg-optio-purple/5 px-4 py-1.5"
        data-testid="family-volunteer-hours">
        <span className="text-sm text-neutral-600">Volunteer hours</span>
        <span className="text-sm font-semibold text-optio-purple">{shown}</span>
        {updated && <span className="text-xs text-neutral-400">as of {updated}</span>}
      </div>
    </div>
  )
}
