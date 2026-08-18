import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import { useActingAs } from '../../contexts/ActingAsContext'
import { getSisFlagOverride, switchSurfaceInApp } from '../../utils/appSurface'
import ActingAsBanner from '../parent/ActingAsBanner'
import MasqueradeBanner from '../admin/MasqueradeBanner'
import { getMasqueradeState, exitMasquerade } from '../../services/masqueradeService'
import api from '../../services/api'
import { toast } from 'react-hot-toast'
import { getProgramNavItem } from '../../programs/registry'
import { parentHomePath } from '../../utils/postLoginPath'
import { ageFromDob, CLASS_MIN_AGE } from '../../utils/age'

const HOME_ICON = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
)

const FAMILY_ICON = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
)

const Sidebar = ({ isOpen, onClose, isCollapsed, isPinned, onTogglePin, isHovered, onHoverChange }) => {
  const location = useLocation()
  const { user, logout, isAuthenticated, effectiveRole } = useAuth()
  const { organization, school } = useOrganization()
  const { actingAsDependent, clearActingAs } = useActingAs()
  // SIS carve-out: when the user's org has sis_enabled (or the local dev override
  // is set), the school-management surfaces move to the SIS console — so hide them
  // here and surface a launcher instead. Reversible per-org; default off. Read the
  // flag straight off the loaded org (no extra hook) so it stays trivially mockable.
  const sisEnabled = Boolean(organization?.feature_flags?.sis_enabled) || getSisFlagOverride()
  const [actingAsBannerExpanded, setActingAsBannerExpanded] = useState(false)
  const [masqueradeBannerExpanded, setMasqueradeBannerExpanded] = useState(false)
  const [masqueradeState, setMasqueradeState] = useState(null)

  // Check for masquerade state on mount and periodically
  useEffect(() => {
    const checkMasquerade = () => {
      const state = getMasqueradeState()
      setMasqueradeState(state)
    }

    checkMasquerade()
    // Listen for storage changes (in case masquerade is exited from mobile banner)
    const handleStorageChange = () => checkMasquerade()
    window.addEventListener('storage', handleStorageChange)

    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  const handleExitMasquerade = async () => {
    try {
      const result = await exitMasquerade(api)
      if (result.success) {
        setMasqueradeState(null)
        toast.success('Exited masquerade session')
        window.location.href = '/admin/users'
      } else {
        toast.error(result.error || 'Failed to exit masquerade')
      }
    } catch (error) {
      console.error('Exit masquerade error:', error)
      toast.error('Failed to exit masquerade session')
    }
  }

  // Determine if sidebar should show expanded (full width with text)
  // Expanded when: pinned, or hovered while collapsed
  const isExpanded = isPinned || isHovered

  const isActiveRoute = (path) => {
    // Exact match for the path
    if (location.pathname === path) return true
    // Match child routes (e.g., /quests/123 matches /quests)
    if (location.pathname.startsWith(path + '/')) return true
    // Special case: /dashboard should not match /calendar, /communication, etc.
    return false
  }

  // Check if user has course enrollments (for conditional Courses nav item)
  const { data: coursesData } = useQuery({
    queryKey: ['courses-sidebar-check', user?.id],
    queryFn: async () => {
      const response = await api.get('/api/courses')
      const courses = response.data?.courses || []
      return courses.some(c => c.is_enrolled)
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false
  })

  const hasEnrolledCourses = coursesData === true

  // Check if user is enrolled in any classes (for conditional Classes nav item)
  const { data: classesData } = useQuery({
    queryKey: ['classes-sidebar-check', user?.id],
    queryFn: async () => {
      const response = await api.get('/api/student/classes')
      const classes = response.data?.classes || []
      return classes.length > 0
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false
  })

  const hasEnrolledClasses = classesData === true

  // Helper to check if user has a role (supports org_roles array)
  const userHasRole = (role) => {
    if (user?.role === role) return true
    // Check org_roles array (new format)
    if (user?.org_roles && Array.isArray(user.org_roles) && user.org_roles.includes(role)) return true
    // Check legacy org_role field
    if (user?.org_role === role) return true
    return false
  }

  // Effective role with a fallback derivation so the sidebar stays correct even
  // when rendered outside a fully-hydrated AuthContext (tests, early paint).
  const role = effectiveRole || (
    user?.role === 'org_managed'
      ? ((Array.isArray(user?.org_roles) && user.org_roles[0]) || user?.org_role)
      : user?.role
  )

  const isStudent = userHasRole('student')
  const isAdvisor = userHasRole('advisor') || user?.has_advisor_assignments
  const hasParentRelationships = user?.has_dependents || user?.has_linked_students || userHasRole('parent')
  const hasOrgAdminAccess = user?.is_org_admin || userHasRole('org_admin') || user?.role === 'superadmin'
  // Observer feed: for users who may watch students (superadmin, advisor,
  // parent, observer). The feed page handles empty states.
  const hasObserverAccess = user?.role === 'superadmin' ||
    userHasRole('observer') ||
    userHasRole('advisor') ||
    userHasRole('parent')

  // ── Navigation model ────────────────────────────────────────────────────────
  // One ordered list of sections with fixed slots. Conditional items (Courses,
  // Classes) appear in place when their queries resolve instead of appending to
  // the end, so the menu never reshuffles. Section titles render only when the
  // sidebar is expanded; collapsed mode shows a divider between sections.

  // "Home" is /dashboard for every role — RoleHome renders each role's own
  // home there (role-homes rewrite, 2026-08-10). Family and Organization are
  // separate management surfaces with their own nav items below; the path
  // dedupe no longer needs to absorb them into Home.
  //
  // The one exception: Optio Academy parents, whose home IS the family
  // dashboard (config/optioAcademy.js). The item takes the Family name too, so
  // they get one "Family" tab in the home slot rather than a Home and a Family
  // pointing at the same page — the dedupe below drops the second one.
  const isParent = role === 'parent'
  const parentHome = isParent ? parentHomePath(user, school) : '/dashboard'
  const homeIsFamily = parentHome === '/parent/dashboard'
  const homePath = isParent ? parentHome : '/dashboard'

  const primaryItems = [
    {
      name: homeIsFamily ? 'Family' : 'Home',
      path: homePath,
      icon: homeIsFamily ? FAMILY_ICON : HOME_ICON
    }
  ]

  // Dashboard: superadmin only. Their Home is the platform cockpit, so this is
  // the one way to look at the student dashboard from their own account.
  if (user?.role === 'superadmin') {
    primaryItems.push({
      name: 'Dashboard',
      path: '/student-dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h4l3 8 4-16 3 8h4" />
        </svg>
      )
    })
  }

  // Quests: the quest browser is a learning surface parents and org admins
  // don't work in (same rule the old top-navbar toggle used).
  if (role !== 'parent' && role !== 'org_admin') {
    primaryItems.push({
      name: 'Quests',
      path: '/quests',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      )
    })
  }

  const learningItems = []

  // Org admins reach bounties (view + create for their org's students) from a
  // tab inside /organization, so it's kept out of their sidebar.
  if (role !== 'org_admin') {
    learningItems.push({
      name: 'Bounties',
      path: '/bounties',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      )
    })
  }

  // Connections: peer-to-peer, so students only. The item is shown without
  // checking age, because the age screen lives on the page — deciding here
  // would mean the sidebar needed the student's date of birth, and a student
  // whose age we don't know yet (the largest group) would silently lose the
  // one entry point that can resolve it.
  if (role === 'student') {
    learningItems.push({
      name: 'Connections',
      path: '/connections',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      )
    })
  }

  // Journal: a student learning surface. Hidden from parents (they capture for
  // a child from the Family dashboard) and org admins (they manage their org,
  // not a personal journal).
  if (role !== 'parent' && role !== 'org_admin') {
    learningItems.push({
      name: 'Journal',
      path: '/learning-journal',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    })
  }

  // Custom Class: a student authors their own credit class (quest_type='class').
  // Classes are 13+, matching the mobile gate. A student whose age we don't know
  // still sees it — the page asks for the birthday — but a known under-13 doesn't,
  // so we never advertise something they can't have.
  const classAge = ageFromDob(user?.date_of_birth)
  if ((isStudent || user?.role === 'superadmin') && !(classAge !== null && classAge < CLASS_MIN_AGE)) {
    learningItems.push({
      name: 'Custom Class',
      path: '/my-classes',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0v7m0-7l6.16-3.422M6 11.5V16c0 1.105 2.686 2 6 2s6-.895 6-2v-4.5" />
        </svg>
      )
    })
  }

  // Courses: always for superadmin, only if enrolled for others (deliberate —
  // enrollment starts from links/orgs, not catalog browsing).
  const alwaysShowCourses = user?.role === 'superadmin'
  if (alwaysShowCourses || hasEnrolledCourses) {
    learningItems.push({
      name: 'Courses',
      path: '/courses',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
        </svg>
      )
    })
  }

  // Classes: for students enrolled in at least one org class
  if (hasEnrolledClasses) {
    learningItems.push({
      name: 'Classes',
      path: '/org-classes',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
        </svg>
      )
    })
  }

  // The student's evidence feed (invite observers, see reactions) — and, once
  // they have peer connections, their connected friends' work too. It was "My
  // Feed" while it only ever showed your own items; that name stopped being
  // true when the feed gained a second source. Still unambiguous against the
  // observer-side "Student Feed" below, which is a different surface.
  if (isStudent) {
    learningItems.push({
      name: 'Feed',
      path: '/feedback',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      )
    })
  }

  const communityItems = [
    {
      name: 'Messages',
      path: '/messages',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      )
    }
  ]

  // The school's own page — announcements and the community board — named after
  // the school itself. Gated on `school.homepage`, the per-org opt-in
  // (feature_flags.sis_settings.school_homepage) that makes /school a school's
  // front door: belonging to an org is not the same as that org running its
  // families through this page. Schools that front-door families elsewhere
  // (Hearthwood sends them to its own program page) would otherwise get a
  // second, near-empty school item they never asked for. Superadmins are in no
  // school but get the same door as "School Pages" — /school shows them an org
  // and role picker to preview each school's page.
  // (The school's sub-surfaces — schedule, billing, absences, etc. — are cards
  // on the school page itself since 2026-08-06, not sidebar items.)
  if (school?.homepage || user?.role === 'superadmin') {
    communityItems.push({
      name: school?.name || (user?.role === 'superadmin' ? 'School Pages' : 'My school'),
      path: '/school',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
        </svg>
      )
    })
  }

  // School-specific program tab for members of a partner organization. The
  // program registry (src/programs/registry.jsx) owns which slug maps to which
  // tab, its icon, and whether org admins see it — core stays program-agnostic.
  // An org-uploaded logo (branding_config.logo_url) overrides the built-in icon.
  const programTab = getProgramNavItem({
    slug: organization?.slug,
    effectiveRole,
    orgLogoUrl: organization?.branding_config?.logo_url,
  })
  if (programTab) communityItems.push(programTab)

  // Observer-side feed of students' work. Named "Student Feed" to distinguish
  // it from the student's own "My Feed" above.
  if (hasObserverAccess) {
    communityItems.push({
      name: 'Student Feed',
      path: '/observer/feed',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      )
    })
  }

  // Family dashboard: parents, plus org_admins/advisors/superadmin who also
  // have parent relationships (or superadmin, who can reach everything). Lives
  // in the primary section — for parents, whose Home IS /parent/dashboard, the
  // path dedupe below absorbs it; for hybrid users it's a second home link.
  // (It had its own "Family & Teaching" section until the Teacher item was
  // removed 2026-08-10 and a one-item section looked stranded.)
  if (hasParentRelationships || user?.role === 'superadmin') {
    primaryItems.push({
      name: 'Family',
      path: '/parent/dashboard',
      icon: FAMILY_ICON
    })

    // Peer connections the adult approves and manages. Reachable on its own
    // rather than only from a notification: a parent who wants to end a
    // connection weeks later has no notification left to click, and "find the
    // email we sent you in March" is not a way to withdraw consent.
    primaryItems.push({
      name: 'Student connections',
      path: '/connections/approvals',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      )
    })
  }

  const adminItems = []

  // Organization console for org admins or platform admins with an organization
  if (hasOrgAdminAccess && user?.organization_id) {
    adminItems.push({
      name: 'Organization',
      path: '/organization',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      )
    })
  }

  // Credit Review — superadmins use it as part of the Optio review step.
  // Org admins reach the same dashboard as a tab inside /organization instead.
  if (user?.role === 'superadmin') {
    adminItems.push({
      name: 'Credit Review',
      path: '/credit-dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    })
    adminItems.push({
      name: 'Admin',
      path: '/admin',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    })
  }

  let navSections = [
    { key: 'primary', title: null, items: primaryItems },
    { key: 'learning', title: 'Learning', items: learningItems },
    { key: 'community', title: 'Community', items: communityItems },
    { key: 'admin', title: 'Admin', items: adminItems },
  ]

  // Carve-out: when SIS is enabled for this org, the school-management items live
  // in the SIS console (sis.optioeducation.com), not the learning sidebar. Remove
  // them here. The global platform "Admin" panel (mixed LMS content) is intentionally
  // NOT removed. A "School Admin" launcher (below) links staff to the SIS surface.
  const SIS_MOVED_ITEMS = new Set(['Organization', 'Credit Review'])
  if (sisEnabled) {
    navSections = navSections.map((section) => ({
      ...section,
      items: section.items.filter((item) => !SIS_MOVED_ITEMS.has(item.name)),
    }))
  }

  // Dedupe by path, keeping the first occurrence. This is what lets "Home"
  // absorb Family (parents), Organization (org admins) or Teacher (advisors)
  // instead of listing the same destination twice.
  const seenPaths = new Set()
  navSections = navSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (seenPaths.has(item.path)) return false
      seenPaths.add(item.path)
      return true
    }),
  }))
  const visibleSections = navSections.filter((section) => section.items.length > 0)

  // Superadmin always gets a way into the SIS console; org staff get it once their
  // org is flagged into the SIS beta. Campus coordinators run the console (minus
  // finance), so they count as staff here.
  const isCampusCoordinator = userHasRole('campus_coordinator')
  const showSisLauncher = user?.role === 'superadmin' || (sisEnabled && (hasOrgAdminAccess || isAdvisor || isCampusCoordinator))

  const handleNavClick = () => {
    if (onClose) {
      onClose()
    }
  }

  const handleLogout = async () => {
    await logout()
    if (onClose) {
      onClose()
    }
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
          aria-label="Close sidebar"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-16 left-0 bottom-0 bg-white border-r border-gray-200 z-50
          transform transition-all duration-200 ease-in-out
          flex flex-col
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          ${isExpanded ? 'w-64' : 'w-16'}
        `}
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
      >
        {/* overflow-y-auto (not hidden): on short windows the nav must scroll or
            the items below the fold become unreachable. The 8px inset matches on
            all four sides (pt-2/px-2) so the rail reads as one evenly-padded
            column under the navbar instead of a panel with a deep top gap. */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden pt-2 px-2">
          <nav className="space-y-2">
            {/* SIS launcher — hops staff to the School Admin console (sis. host).
                First item so it's always visible, even on short windows. */}
            {showSisLauncher && (
              <button
                onClick={() => { switchSurfaceInApp('sis', '/'); handleNavClick() }}
                title={!isExpanded ? 'School Admin' : undefined}
                className="w-full flex items-center rounded-lg relative font-poppins font-medium transition-colors duration-200 min-h-[44px] touch-manipulation px-3 py-3 text-white bg-gradient-primary hover:opacity-90"
              >
                <span className="w-5 flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </span>
                <span className={`ml-3 whitespace-nowrap overflow-hidden transition-all duration-200 ${isExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>
                  School Admin
                </span>
              </button>
            )}

            {visibleSections.map((section, sectionIndex) => (
              <div key={section.key}>
                {/* Section separators: a titled header when expanded, a thin
                    divider when collapsed. The first section gets neither. */}
                {sectionIndex > 0 && (
                  isExpanded && section.title ? (
                    <div className="px-3 pt-4 pb-1 text-[11px] font-poppins font-semibold uppercase tracking-wider text-neutral-400 whitespace-nowrap overflow-hidden">
                      {section.title}
                    </div>
                  ) : (
                    <div className="mx-3 my-3 border-t border-gray-200" aria-hidden="true" />
                  )
                )}

                <div className="space-y-2">
                  {section.items.map((item) => {
                    const isActive = isActiveRoute(item.path)

                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={handleNavClick}
                        title={!isExpanded ? item.name : undefined}
                        className={`
                          flex items-center rounded-lg relative
                          font-poppins transition-colors duration-200
                          min-h-[44px] touch-manipulation
                          px-3 py-3
                          ${isActive
                            ? 'bg-optio-purple/10 text-optio-purple font-semibold'
                            : 'text-neutral-700 font-medium hover:bg-neutral-50'
                          }
                        `}
                      >
                        <span className={`w-5 flex-shrink-0 relative ${isActive ? 'text-optio-purple' : 'text-neutral-500'}`}>
                          {item.icon}
                          {/* Badge for collapsed sidebar */}
                          {item.badge && !isExpanded && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-optio-pink rounded-full">
                              {item.badge > 99 ? '99+' : item.badge}
                            </span>
                          )}
                        </span>
                        <span className={`ml-3 whitespace-nowrap overflow-hidden transition-all duration-200 flex items-center gap-2 ${isExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>
                          {item.name}
                          {/* Badge for expanded sidebar */}
                          {item.badge && isExpanded && (
                            <span className="min-w-[20px] h-5 flex items-center justify-center px-1.5 text-xs font-bold text-white bg-optio-pink rounded-full">
                              {item.badge > 99 ? '99+' : item.badge}
                            </span>
                          )}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}

          </nav>
        </div>

        {/* Acting As Banner (when parent is viewing as child) */}
        {actingAsDependent && (
          <div className="border-t border-gray-200 py-2 px-2 flex justify-center">
            {isExpanded ? (
              <ActingAsBanner
                dependent={actingAsDependent}
                onSwitchBack={async () => {
                  await clearActingAs()
                  window.location.href = '/parent/dashboard'
                }}
                inline={true}
                isExpanded={actingAsBannerExpanded}
                onToggleExpand={() => setActingAsBannerExpanded(prev => !prev)}
              />
            ) : (
              <button
                onClick={() => {
                  // When collapsed, expand sidebar and show banner
                  onHoverChange?.(true)
                  setActingAsBannerExpanded(true)
                }}
                title="Acting as child - click to expand"
                className="w-full flex items-center justify-center rounded-lg bg-gradient-primary text-white min-h-[44px] touch-manipulation px-3 py-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Masquerade Banner (when admin is viewing as another user) */}
        {masqueradeState && (
          <div className="border-t border-gray-200 py-2 px-2 flex justify-center">
            {isExpanded ? (
              <MasqueradeBanner
                targetUser={masqueradeState.target_user}
                onExit={handleExitMasquerade}
                inline={true}
                isExpanded={masqueradeBannerExpanded}
                onToggleExpand={() => setMasqueradeBannerExpanded(prev => !prev)}
              />
            ) : (
              <button
                onClick={() => {
                  // When collapsed, expand sidebar and show banner
                  onHoverChange?.(true)
                  setMasqueradeBannerExpanded(true)
                }}
                title="Masquerading - click to expand"
                className="w-full flex items-center justify-center rounded-lg bg-gradient-primary text-white min-h-[44px] touch-manipulation px-3 py-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Pin Toggle Button (Desktop Only) */}
        <div className="hidden lg:block border-t border-gray-200 py-2 px-2">
          <button
            onClick={onTogglePin}
            title={isPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
            className="w-full flex items-center rounded-lg font-poppins font-medium text-neutral-600 hover:bg-neutral-100 transition-colors duration-200 min-h-[44px] touch-manipulation px-3 py-3"
          >
            {isPinned ? (
              // Pinned icon (pushpin filled/active)
              <svg className="w-5 h-5 flex-shrink-0 text-optio-purple" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 4v7l2 3v2h-6v5l-1 1-1-1v-5H5v-2l2-3V4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2z"/>
              </svg>
            ) : (
              // Unpinned icon (pushpin outline with slash)
              <svg className="w-5 h-5 flex-shrink-0 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 4v7l2 3v2h-6v5l-1 1-1-1v-5H5v-2l2-3V4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
              </svg>
            )}
            <span className={`ml-3 whitespace-nowrap overflow-hidden transition-all duration-200 ${isExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>
              {isPinned ? 'Unpin sidebar' : 'Pin sidebar'}
            </span>
          </button>
        </div>

        {/* Logout Button (Bottom of Sidebar - Mobile Only) */}
        {isAuthenticated && (
          <div className="lg:hidden border-t border-gray-200 p-4">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center p-3 rounded-lg text-neutral-700 hover:bg-neutral-100 transition-colors duration-200 min-h-[44px] min-w-[44px] touch-manipulation"
              aria-label="Logout"
              title="Logout"
            >
              <svg className="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

export default Sidebar
