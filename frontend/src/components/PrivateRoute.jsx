import React, { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useICreateRegistrationGate } from '../hooks/useICreateRegistrationGate'
import { useRequiredDocumentsGate } from '../hooks/useRequiredDocumentsGate'
import { roleHomePath } from '../utils/postLoginPath'

const PrivateRoute = ({ requiredRole, blockRoles }) => {
  const { isAuthenticated, user, effectiveRole, loading } = useAuth()
  const location = useLocation()
  // iCreate parents with an unfinished registration funnel are locked to it.
  const icreateGate = useICreateRegistrationGate(user, isAuthenticated, effectiveRole)
  // Families holding unsigned REQUIRED school paperwork are locked to signing it.
  const docsGate = useRequiredDocumentsGate(user, isAuthenticated)

  // Initialize graceLoading synchronously to prevent flash on first render
  const [graceLoading, setGraceLoading] = useState(() => {
    const authJustCompleted = sessionStorage.getItem('authJustCompleted')
    if (authJustCompleted) {
      const timestamp = parseInt(authJustCompleted, 10)
      const elapsed = Date.now() - timestamp
      // Give a 5 second grace period after OAuth redirect
      if (elapsed < 5000) {
        return true
      } else {
        sessionStorage.removeItem('authJustCompleted')
      }
    }
    return false
  })

  // Set up timer to clear grace loading after remaining time
  useEffect(() => {
    const authJustCompleted = sessionStorage.getItem('authJustCompleted')
    if (authJustCompleted && graceLoading) {
      const timestamp = parseInt(authJustCompleted, 10)
      const elapsed = Date.now() - timestamp
      const remaining = Math.max(0, 5000 - elapsed)
      const timer = setTimeout(() => {
        setGraceLoading(false)
        sessionStorage.removeItem('authJustCompleted')
      }, remaining)
      return () => clearTimeout(timer)
    }
  }, [graceLoading])

  // Clear grace loading once authenticated
  useEffect(() => {
    if (isAuthenticated && graceLoading) {
      setGraceLoading(false)
      sessionStorage.removeItem('authJustCompleted')
    }
  }, [isAuthenticated, graceLoading])

  // Show loading spinner while auth is still loading or in grace period
  if (loading || graceLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  // iCreate parents must finish the registration funnel before using Optio.
  if (icreateGate.checking) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }
  if (icreateGate.mustRegister) {
    return <Navigate to="/enroll/resume" replace />
  }

  // Required school paperwork. Checked AFTER registration because a family
  // still in the funnel belongs in the funnel — it collects its own paperwork,
  // and bouncing them between two gates would leave neither finishable.
  if (docsGate.checking) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }
  if (docsGate.blocked) {
    return <Navigate to="/family/required-documents" replace />
  }

  // blockRoles: deny these effective roles and bounce them to their own home.
  // Used to keep parents/observers out of student-only surfaces (quests,
  // student dashboard, personal journal) without changing access for students,
  // advisors, org_admins, or superadmin. Superadmin is never blocked.
  if (blockRoles && effectiveRole !== 'superadmin' && blockRoles.includes(effectiveRole)) {
    return <Navigate to={roleHomePath(effectiveRole)} replace />
  }

  if (requiredRole) {
    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    // Superadmin has universal access
    // Use effectiveRole to handle org_managed users correctly
    // For org_managed users, effectiveRole = org_role; for platform users, effectiveRole = role

    // Special case: users with parent relationships can access parent routes
    // This allows org_admins/advisors who are also parents to access the parent dashboard
    const hasParentRelationships = user?.has_dependents || user?.has_linked_students
    const canAccessParentRoutes = allowedRoles.includes('parent') && hasParentRelationships

    const hasAccess =
      allowedRoles.includes(effectiveRole) ||
      effectiveRole === 'superadmin' ||
      (user?.is_org_admin && allowedRoles.includes('org_admin')) ||
      canAccessParentRoutes

    if (!hasAccess) {
      // Redirect to role-appropriate dashboard
      return <Navigate to={roleHomePath(effectiveRole)} replace />
    }
  }

  return <Outlet />
}

export default PrivateRoute