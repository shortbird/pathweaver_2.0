import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import { useFamilyScope, userHasFamily, worksThroughFamily } from '../../contexts/FamilyScopeContext'
import ProfileSwitcher from '../parent/ProfileSwitcher'
import { getSisFlagOverride, switchSurfaceInApp } from '../../utils/appSurface'
import MasqueradeBanner from '../admin/MasqueradeBanner'
import { getMasqueradeState, exitMasquerade } from '../../services/masqueradeService'
import api from '../../services/api'
import { toast } from 'react-hot-toast'
import { getProgramNavItem } from '../../programs/registry'
import { parentHomePath } from '../../utils/postLoginPath'
import { useUnreadCount } from '../../hooks/api/useDirectMessages'
import { ageFromDob, CLASS_MIN_AGE } from '../../utils/age'
import { moduleEnabled } from '../../modules/moduleEnabled'
import { useSchoolContext } from '../../hooks/api/useSchoolContext'
import { familyNavItemsFor } from '../../pages/school/schoolCards'
import { OPTIO_ACADEMY_ENROLL_PATH } from '../../config/optioAcademy'

const HOME_ICON = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
)

// The Optio mark, desaturated: a student's own class is Optio's, not a school's,
// so it carries the brand rather than a generic grad cap (which the org "Classes"
// and "My school" items already use).
const OPTIO_MARK_ICON = (
  <img
    src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg"
    alt=""
    className="w-5 h-5 object-contain grayscale opacity-70"
  />
)

const FAMILY_ICON = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
)

const Sidebar = ({ isOpen, onClose, isCollapsed, isPinned, onTogglePin, isHovered, onHoverChange }) => {
  const location = useLocation()
  const { user, logout, isAuthenticated, effectiveRole } = useAuth()
  const { data: unreadData } = useUnreadCount(user?.id)
  const unreadMessages = unreadData?.unread_count || 0
  const { organization, school } = useOrganization()
  // Which of the school's surfaces this person may reach, and whether they
  // are a guardian there (one shared fetch; /school reads the same).
  const { orgs: schoolOrgs } = useSchoolContext({ enabled: Boolean(user?.id && school) })
  const schoolOrg = schoolOrgs?.[0] || null
  // Family scope: which child a parent is working for. In scope the student
  // surfaces (Home, Quests, Journal, Portfolio) point at that child.
  const { isScoped: inFamilyScope, selectedChild } = useFamilyScope()
  // SIS carve-out: when the user's org has the sis module (or the local dev
  // override is set), the school-management surfaces move to the SIS console — so
  // hide them here and surface a launcher instead. Reversible per-org; default
  // off. moduleEnabled is a pure function over the loaded org (no extra hook),
  // so this stays trivially mockable; it prefers the server-computed
  // effective_modules and falls back to legacy flags (sis_enabled).
  const sisEnabled = (organization ? moduleEnabled(organization, 'sis') : false) || getSisFlagOverride()
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
        // Org admins viewing their own members have no /admin/users.
        window.location.href = result.adminUser?.role === 'superadmin' ? '/admin/users' : '/'
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
  // One predicate for "has a family" (contexts/FamilyScopeContext); this was
  // a private copy until 2026-09-15.
  const hasParentRelationships = userHasFamily(user)
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
  // A parent's home is the family dashboard (/family, 2026-09-15). Once they
  // have picked a child there, /dashboard is that CHILD's home and it appears
  // here under the child's name, followed by the child's own surfaces.
  // A guardian with no student surface of their own: a parent, or a parent
  // who is also an observer or a campus coordinator. A teacher-parent is NOT
  // one -- their Home is the teaching home, and Family is a second item.
  const isParent = worksThroughFamily(user)
  const homePath = isParent ? parentHomePath(user, school) : '/dashboard'

  const primaryItems = [
    {
      name: isParent ? 'Family' : 'Home',
      path: homePath,
      icon: isParent ? FAMILY_ICON : HOME_ICON
    }
  ]

  if (isParent && inFamilyScope) {
    primaryItems.push({
      name: `${selectedChild?.firstName || 'Child'}'s home`,
      path: '/dashboard',
      icon: HOME_ICON
    })
  }

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

  // Quests: a learning surface. Org admins don't work in it; a parent does,
  // but only pointed at a child (family scope), never as themselves.
  if (role !== 'org_admin' && (!isParent || inFamilyScope)) {
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
      name: 'Friends',
      path: '/connections',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      )
    })
  }

  // Journal: a student learning surface. Hidden from org admins (they manage
  // their org, not a personal journal) and from a parent with no child picked;
  // in family scope it is the child's journal.
  if (role !== 'org_admin' && (!isParent || inFamilyScope)) {
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

  // Portfolio: the child's overview (diploma, skills, journal), which a
  // student reaches from their own dashboard. A scoped parent gets it as a
  // nav item because their dashboard header is the child's, not a profile.
  if (isParent && inFamilyScope) {
    learningItems.push({
      name: 'Portfolio',
      path: '/overview',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    })
  }

  // Custom Class: a student authors their own credit class (quest_type='class').
  // Classes are 13+, matching the mobile gate. A student whose age we don't know
  // still sees it — the page asks for the birthday — but a known under-13 doesn't,
  // so we never advertise something they can't have.
  // Not offered to a parent in family scope: the child's own home links to it,
  // and the parent sidebar is long enough with the school section below.
  const classAge = ageFromDob(user?.date_of_birth)
  if ((isStudent || user?.role === 'superadmin') && !(classAge !== null && classAge < CLASS_MIN_AGE)) {
    learningItems.push({
      name: 'Custom Class',
      path: '/my-classes',
      icon: OPTIO_MARK_ICON
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

  // The sidebar has rendered item.badge since it was written, and nothing ever
  // set one -- so a message arrived, a notification row was written, and the nav
  // looked identical (Gryffin, 2026-08-27: "messages doesn't have any
  // notifications, so you dont know if you have received messages").
  const communityItems = [
    {
      name: 'Messages',
      path: '/messages',
      badge: unreadMessages > 0 ? unreadMessages : undefined,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      )
    }
  ]

  // The school, named after itself: one door. Behind it, since 2026-09-16,
  // is one page with tabs (pages/school/SchoolShell) -- the feed, the
  // calendar, and for a guardian the family doors (schedule or goals,
  // absences, billing, forms, prior learning). Between 2026-09-15 and then
  // those doors were a sidebar section of their own under the school's name;
  // eight items for once-a-term pages is a list nobody reads.
  //
  // Where the door lands: the school's own page when the org front-doors its
  // families through it (`school.homepage`, feature_flags.sis_settings.
  // school_homepage -- belonging to an org is not the same as that org
  // running its families through the page; Hearthwood sends them to its own
  // program page), else a guardian's first family tab. Superadmins are in no
  // school but get the same door as "School Pages" -- /school shows them an
  // org and role picker to preview each school's page.
  const schoolTabs = familyNavItemsFor(schoolOrg, { homepage: Boolean(school?.homepage) })
  const schoolDoor = schoolTabs[0]?.path
    || ((school?.homepage || user?.role === 'superadmin') ? '/school' : null)
  if (schoolDoor) {
    communityItems.push({
      name: school?.name || (user?.role === 'superadmin' ? 'School Pages' : 'My school'),
      path: schoolDoor,
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
      path: '/family',
      icon: FAMILY_ICON
    })

    // Peer-connection approvals live on each child's card on /family
    // (components/parent/ChildConnections) since 2026-09-15; the "Student
    // connections" item that pointed at /connections/approvals went with the
    // page. A parent ending a connection weeks later finds it on the card.
  }

  // Teaching (blocks P2): the LMS-only teacher's daily surfaces, so an advisor
  // is not dependent on TeacherHome tiles to reach their own tools. On SIS orgs
  // class work lives in the console (the launcher below), so the review queue
  // item hops to the console's Submissions tab. The LMS verification page never
  // listed an org-managed student's work, so it was an empty page for them.
  //
  // An org admin holds every capability a teacher holds, so the section is
  // theirs too. At a microschool the admin is the teacher (Horizon, 2026-09-11):
  // the director created her own classes and then had no nav into them, because
  // the teaching section read the advisor role alone. Superadmins are left out
  // on purpose: these pages need an organization to answer for.
  const teachingItems = []
  const isTeachingAdmin = hasOrgAdminAccess && user?.role !== 'superadmin' && Boolean(user?.organization_id)
  if (userHasRole('advisor') || isTeachingAdmin) {
    if (!sisEnabled) {
      teachingItems.push({
        name: 'My Classes',
        path: '/org-classes',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
          </svg>
        )
      })
    }
    teachingItems.push({
      name: sisEnabled ? 'Submissions' : 'Verifications',
      path: '/advisor/verification',
      sisPath: sisEnabled ? '/classes?tab=submissions' : null,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      )
    })
    if (!sisEnabled) {
      teachingItems.push({
        name: 'Quest Invitations',
        path: '/advisor/invitations',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        )
      })
    }
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
    { key: 'teaching', title: 'Teaching', items: teachingItems },
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

  // Optio Academy invitation for platform students: no school, so their quests
  // earn XP but no transcript credit. Dependents are left out -- they are under
  // 13 and their parent already runs the account. The funnel is parent-only,
  // so the copy says a parent does the registering.
  const showAcademyBanner = user?.role === 'student' && !user?.organization_id && !user?.is_dependent

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

            {/* Family scope switcher: which child a parent is working for.
                Renders nothing for accounts with no children. Compact in the
                collapsed rail (avatar only). */}
            {hasParentRelationships && (
              <ProfileSwitcher compact={!isExpanded} className="mb-1" />
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
                        onClick={item.sisPath
                          ? (e) => { e.preventDefault(); switchSurfaceInApp('sis', item.sisPath); handleNavClick() }
                          : handleNavClick}
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
                          {item.badge > 0 && !isExpanded && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-optio-pink rounded-full">
                              {item.badge > 99 ? '99+' : item.badge}
                            </span>
                          )}
                        </span>
                        <span className={`ml-3 whitespace-nowrap overflow-hidden transition-all duration-200 flex items-center gap-2 ${isExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>
                          {item.name}
                          {/* Badge for expanded sidebar */}
                          {item.badge > 0 && isExpanded && (
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

        {showAcademyBanner && (
          <div className="border-t border-gray-200 p-2">
            {isExpanded ? (
              <Link
                to={OPTIO_ACADEMY_ENROLL_PATH}
                onClick={handleNavClick}
                data-testid="academy-banner"
                className="block rounded-lg bg-gradient-primary text-white p-3 font-poppins hover:opacity-90 transition-opacity"
              >
                <span className="block text-sm font-semibold">Want an official high school diploma?</span>
                <span className="block mt-1 text-xs leading-snug text-white/90">
                  Have a parent register you for Optio Academy and turn your quests into real high school credit.
                </span>
                <span className="block mt-2 text-xs font-semibold underline underline-offset-2">Register for Optio Academy</span>
              </Link>
            ) : (
              <Link
                to={OPTIO_ACADEMY_ENROLL_PATH}
                onClick={handleNavClick}
                title="Register for Optio Academy"
                aria-label="Register for Optio Academy"
                className="w-full flex items-center justify-center rounded-lg bg-gradient-primary text-white min-h-[44px] touch-manipulation px-3 py-3 hover:opacity-90"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                </svg>
              </Link>
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
