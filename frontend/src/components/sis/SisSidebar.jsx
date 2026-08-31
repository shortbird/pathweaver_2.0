import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { switchSurfaceInApp } from '../../utils/appSurface'
import { isSisAdmin, canSeeFinance, canSeeHr } from '../../pages/sis/sisRole'
import { getPreviewTeacher } from '../../pages/sis/teacherPreview'
import { isPathHidden, isCommunityEnabled, isPriorLearningEnabled } from '../../pages/sis/sisModules'
import { useSisOrg } from '../../pages/sis/useSisOrg'
import RoleViewSwitcher from './RoleViewSwitcher'

/**
 * SIS console sidebar. Distinct from the web platform's Sidebar — this is the
 * staff-facing microschool management nav. Items are grouped into labeled sections
 * (People, Academics, Operations, Settings); the carved-out admin surfaces
 * (Organization, Advisor, Credit Review, Enroll Students, People) are folded into
 * the section where they best fit rather than a separate "Management" block.
 */

const icon = (path) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
  </svg>
)

// Section-grouped nav. `end` forces exact matching (Dashboard). `superadmin: true`
// items render only for superadmins; `adminOnly: true` for org admins (and
// superadmins); `teacherOnly: true` only for advisors — the teacher portal;
// `financeOnly: true` for the money pages, which campus coordinators don't get.
// Carved-out admin surfaces keep their original paths (registered in SisRoutes).
const ICONS = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  users: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z',
  person: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  family: 'M13 7a4 4 0 11-8 0 4 4 0 018 0zM3 21v-1a6 6 0 0112 0v1M16 3.13a4 4 0 010 7.75M21 21v-1a6 6 0 00-4-5.659',
  classes: 'M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z',
  doc: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  clipboard: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  books: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  community: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a3 3 0 10-2.83-4M9 8a3 3 0 10-2.83 4',
  card: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  chat: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
  inbox: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  gear: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
}

const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { name: 'Dashboard', path: '/', end: true, d: ICONS.home },
      // People is the admin roster hub (Everyone / Staff / Families tabs);
      // Directory is the read-only staff phonebook teachers get in its place.
      // Both are top-level — no "People" section wrapping a "People" link.
      { name: 'People', path: '/people', adminOnly: true, d: ICONS.users },
      { name: 'Directory', path: '/directory', teacherOnly: true, d: ICONS.person },
      // Community Hub — opt-in per org (feature_flags.sis_settings.community_enabled).
      { name: 'Community', path: '/community', communityMode: true, d: ICONS.community },
    ],
  },
  {
    label: 'Academics',
    items: [
      { name: 'Classes', path: '/classes', adminOnly: true, d: ICONS.classes },
      { name: 'My Classes', path: '/my-classes', teacherOnly: true, d: ICONS.classes },
      { name: 'My Schedule', path: '/my-schedule', teacherOnly: true, d: ICONS.calendar },
      { name: 'CLP', path: '/clp', adminOnly: true, d: ICONS.doc },
      { name: 'Calendar', path: '/calendar', d: ICONS.calendar },
      { name: 'Attendance', path: '/attendance', adminOnly: true, d: ICONS.check },
      { name: 'Submissions', path: '/submissions', d: ICONS.clipboard },
      // Prior Learning — opt-in per org (Optio Academy today).
      { name: 'Prior Learning', path: '/prior-learning', adminOnly: true, priorLearningMode: true, d: ICONS.doc },
      { name: 'Goals', path: '/goals', goalsMode: true, d: ICONS.doc },
    ],
  },
  {
    // Things people owe, and the paperwork behind them. Forms and Onboarding
    // used to sit here as separate entries; both are now reached through My
    // Tasks (what I owe) and Task Center (what the office is asking of people).
    // Their own paths still work for deep links and old notifications.
    label: 'Tasks & Documents',
    items: [
      // hideInPreview: the inbox is always the CALLER's own (routes/sis/tasks.py
      // takes no ?teacher_id=), so under a teacher preview this link would put
      // the admin's own tasks behind the teacher's name.
      { name: 'My Tasks', path: '/my-tasks', hideInPreview: true, d: ICONS.check },
      { name: 'Task Center', path: '/tasks', adminOnly: true, d: ICONS.clipboard },
      { name: 'Secure Documents', path: '/secure-documents', adminOnly: true, hrOnly: true, d: ICONS.doc },
      // Every staff member has documents of their own -- a contract, a signed
      // policy -- and the page has always worked for admins and coordinators;
      // only this link was hidden from them, so they had no way to reach it
      // (iCreate, 2026-08-26: "None of the staff members (admin, campus
      // coordinator) have a My Documents section showing").
      { name: 'My Documents', path: '/my-documents', d: ICONS.doc },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Registration', path: '/registration', adminOnly: true, d: ICONS.clipboard },
      { name: 'Reports', path: '/reports', adminOnly: true, d: ICONS.doc },
      { name: 'Resources', path: '/resources', d: ICONS.books },
      { name: 'Curriculum', path: '/curriculum', adminOnly: true, d: ICONS.books },
      { name: 'Training', path: '/training', d: ICONS.check },
      // Messages + announcements in one place (2026-08-31; /messaging merged
      // in). Admins read the shared "{School Name}" inbox (backend:
      // ADMIN_ROLES); teachers read their own threads (/api/messages) — the
      // inbox they didn't have. The Announcements tab is the old Messaging
      // page; an advisor's send stays scoped to their own classes by the
      // backend, and it's their email path to a class's families — the class
      // chat is in-app only (2026-08-23).
      { name: 'Inbox', path: '/inbox', d: ICONS.inbox },
    ],
  },
  {
    // The money, plus the clock that feeds it. Grouped because it maps exactly
    // onto the finance tier (utils/sis_roles.FINANCE_ROLES): a teacher sees only
    // My Time here, and for a campus coordinator the whole section disappears
    // rather than leaving money links scattered through Operations.
    label: 'Time & Money',
    items: [
      { name: 'My Time', path: '/time', teacherOnly: true, d: ICONS.clock },
      { name: 'Timesheets', path: '/timesheets', adminOnly: true, financeOnly: true, d: ICONS.clock },
      { name: 'Tuition', path: '/tuition', adminOnly: true, financeOnly: true, d: ICONS.check },
      { name: 'Billing', path: '/billing', adminOnly: true, financeOnly: true, d: ICONS.card },
    ],
  },
  {
    label: 'Settings',
    items: [
      { name: 'Settings', path: '/settings', adminOnly: true, d: ICONS.gear },
      { name: 'My Profile', path: '/my-profile', teacherOnly: true, d: ICONS.person },
    ],
  },
]

const linkClass = ({ isActive }) => `
  flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium font-poppins transition-colors
  ${isActive
    ? 'bg-gradient-to-r from-[#F3EFF4] to-[#E7D5F2] text-optio-purple font-semibold'
    : 'text-neutral-700 hover:bg-[#F3EFF4]'}
`

const SisSidebar = ({ open = false, onNavigate = () => {} }) => {
  const { user } = useAuth()
  // activeOrg is the org currently in view — for a superadmin that's the one
  // picked in the org selector, so the nav mirrors that org's admin exactly.
  const { activeOrg } = useSisOrg()
  // Goals-mode orgs (e.g. Gryffin) set direction/subject goals after registration
  // instead of building a schedule; the Goals tab is meaningless for others.
  const isGoalsMode = activeOrg?.feature_flags?.sis_settings?.post_registration_flow === 'goals'
  const isSuperadmin = user?.role === 'superadmin'
  // While an admin previews a teacher's portal, render the teacher nav so the
  // preview is faithful (the banner in SisLayout is the way back).
  const previewing = Boolean(getPreviewTeacher())
  const isAdmin = isSisAdmin(user) && !previewing
  // Campus coordinators run the console but not the money (iCreate, 2026-08-01)
  // and not the HR store (contracts, background checks — iCreate, 2026-08-09).
  const seesFinance = canSeeFinance(user) && !previewing
  const seesHr = canSeeHr(user) && !previewing

  return (
    // Below lg the sidebar is a drawer: off-canvas until the header's menu
    // button opens it. It used to be permanently fixed at desktop width, which
    // simply pushed the whole console off the side of a tablet screen.
    <aside className={`fixed top-0 left-0 bottom-0 w-60 bg-white border-r border-gray-200 flex flex-col z-50
      transition-transform duration-200 lg:translate-x-0
      ${open ? 'translate-x-0 shadow-xl' : '-translate-x-full'}`}>
      <div className="h-16 flex items-center gap-2 px-5 border-b border-gray-100">
        <img
          src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png"
          alt="Optio"
          className="h-8 w-auto"
        />
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">SIS</span>
      </div>

      <div className="px-3 pt-3">
        <button
          onClick={() => switchSurfaceInApp('learning', '/dashboard')}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink px-3 py-2 text-sm font-semibold text-white"
        >
          {icon('M11 19l-7-7 7-7m-7 7h18')}
          Switch to Learning app
        </button>
      </div>

      <RoleViewSwitcher user={user} orgId={activeOrg?.id || null} />

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((it) => {
            if (it.superadmin && !isSuperadmin) return false
            if (it.adminOnly && !isAdmin) return false
            if (it.teacherOnly && isAdmin) return false
            // Pages that can only ever answer for the caller (see hideInPreview).
            if (it.hideInPreview && previewing) return false
            if (it.financeOnly && !seesFinance) return false
            if (it.hrOnly && !seesHr) return false
            // Org opted out of this module (feature_flags.sis_settings.hidden_modules).
            if (isPathHidden(it.path, activeOrg)) return false
            // Goals tab is only for goals-mode orgs (schedule-mode orgs never set goals).
            if (it.goalsMode && !isGoalsMode) return false
            // Community Hub is opt-in per org.
            if (it.communityMode && !isCommunityEnabled(activeOrg)) return false
            // Prior Learning is opt-in per org.
            if (it.priorLearningMode && !isPriorLearningEnabled(activeOrg)) return false
            return true
          })
          if (!items.length) return null
          return (
            <React.Fragment key={section.label || 'main'}>
              {section.label && (
                <div className="pt-4 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  {section.label}
                </div>
              )}
              {items.map((item) => (
                <NavLink key={item.path} to={item.path} end={item.end} className={linkClass}
                  onClick={onNavigate}>
                  <span className="text-neutral-500">{icon(item.d)}</span>
                  {item.name}
                </NavLink>
              ))}
            </React.Fragment>
          )
        })}
      </nav>
    </aside>
  )
}

export default SisSidebar
