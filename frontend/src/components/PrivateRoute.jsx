import React, { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const PrivateRoute = ({ requiredRole }) => {
  const { isAuthenticated, user, effectiveRole, loading } = useAuth()

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
    return <Navigate to="/login" replace />
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
      const redirectPath = effectiveRole === 'parent' ? '/parent/dashboard'
        : effectiveRole === 'observer' ? '/observer/feed'
        : '/dashboard'
      return <Navigate to={redirectPath} replace />
    }
  }

  return <Outlet />
}

export default PrivateRoute