import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { PageLoader } from '../../components/ui/Spinner'
import DashboardPage from '../DashboardPage'
import FamilyHome from './FamilyHome'
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
export default function RoleHome() {
  const { user, effectiveRole, loading } = useAuth()

  if (loading && !user) return <PageLoader className="min-h-[60vh]" />

  switch (effectiveRole) {
    case 'parent':
      return <FamilyHome />
    case 'advisor':
      return <TeacherHome />
    case 'org_admin':
      return <SchoolAdminHome />
    case 'superadmin':
      return <SuperadminHome />
    case 'observer':
      return <Navigate to="/observer/feed" replace />
    case 'campus_coordinator':
      return <Navigate to="/sis-launch" replace />
    case 'student':
    default:
      return <DashboardPage />
  }
}
