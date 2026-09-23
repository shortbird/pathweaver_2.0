import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useFamilyScope } from '../../contexts/FamilyScopeContext'
import { PageLoader } from '../../components/ui/Spinner'
import DashboardPage from '../DashboardPage'
import TeacherHome from './TeacherHome'
import SchoolAdminHome from './SchoolAdminHome'
import SuperadminHome from './SuperadminHome'

/**
 * The /dashboard route: one home per role (docs/design/DESIGN_SYSTEM.md-era
 * role-homes rewrite, 2026-08-10). getPostLoginPath sends every in-app role
 * here; this switch renders the right Home. Roles whose home is another
 * SURFACE (observers' feed, SIS staff's console) are redirected — they only
 * reach this route via stale links.
 *
 * Shared shape across homes: greeting -> "needs your attention" -> the role's
 * working set -> discovery/ambient. Keep the skeletons aligned so the app
 * feels like one product.
 */
/**
 * Which home a campus coordinator gets on the learning app.
 *
 * Their own role has no learning-app surface — every tile on the admin home
 * and the teacher home reads from an endpoint a coordinator is refused
 * (/api/admin/organizations, /api/advisor/*), so sending them to either would
 * trade a redirect loop for a page of empty boxes. Their second role is the
 * one with something to show.
 */
function CoordinatorOffDutyHome({ user }) {
  const roles = Array.isArray(user?.org_roles) ? user.org_roles : []
  if (roles.includes('parent')) return <ParentHome />
  if (roles.includes('advisor')) return <TeacherHome />
  // Staff and nothing else: the ordinary dashboard, the same as any user with
  // no special home. Not much, but it is theirs and it does not bounce.
  return <DashboardPage />
}

/**
 * A parent's /dashboard is their CHILD's dashboard -- the one they picked on
 * the Family page (contexts/FamilyScopeContext). With no child picked there
 * is nothing of their own to show here, so they go to /family, which is the
 * parent's real home (family dashboard, 2026-09-15). This used to render the
 * FamilyHome digest in place; the digest now lives at /family and the child's
 * own dashboard renders here, pointed at the child.
 */
function ParentHome() {
  const { isScoped, isLoading } = useFamilyScope()
  if (isLoading) return <PageLoader className="min-h-[60vh]" />
  if (!isScoped) return <Navigate to="/family" replace />
  return <DashboardPage />
}

export default function RoleHome() {
  const { user, effectiveRole, loading } = useAuth()
  const { isScoped } = useFamilyScope()

  if (loading && !user) return <PageLoader className="min-h-[60vh]" />

  // A picked child wins over the role, for every role. Family scope is only
  // ever entered by the user (FamilyScopeContext), so a scoped /dashboard
  // means "I am working with this child" -- Open on a Family card, or the
  // profile switcher. Only the parent branch honoured it, so an org admin
  // who is also a parent clicked Open on Brady's card and got her own admin
  // home with the scope silently set to Brady; the quest cards on it then
  // opened her quests as Brady (iCreate, Molly, tickets 376cb2ce / bec3639e,
  // 2026-09-23). "Just me" clears the scope and the role switch applies.
  if (isScoped) return <DashboardPage />

  switch (effectiveRole) {
    case 'parent':
      return <ParentHome />
    case 'advisor':
      return <TeacherHome />
    case 'org_admin':
      return <SchoolAdminHome />
    case 'superadmin':
      return <SuperadminHome />
    case 'observer':
      return <Navigate to="/observer/feed" replace />
    case 'campus_coordinator':
      // NOT a redirect to /sis-launch. That made the SIS sidebar's "Switch to
      // Learning app" button a loop: it lands on /dashboard, which bounced the
      // coordinator straight back to the console they were trying to leave.
      // Coordinators are the only staff role this happened to — advisors and
      // org admins both render a home here.
      //
      // A coordinator's learning-app home is whatever they are when they are
      // not on duty. They usually hold a second org role (iCreate's
      // coordinators are parents of enrolled students), and the staff role
      // wins the effectiveRole coin-toss only because it sorts first.
      return <CoordinatorOffDutyHome user={user} />
    case 'student':
    default:
      return <DashboardPage />
  }
}
