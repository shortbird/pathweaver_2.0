import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const PrivateRoute = ({ requiredRole }) => {
  const { isAuthenticated, user, loading } = useAuth()
  const location = useLocation()

  // ✅ SSO FIX: Detect if user is in SSO authentication flow
  const searchParams = new URLSearchParams(location.search)
  const isSSOPending = searchParams.has('sso_pending') || searchParams.has('code')

  console.log('[SPARK SSO] PrivateRoute check:', {
    path: location.pathname,
    loading,
    isAuthenticated,
    userId: user?.id,
    isSSOPending,
    hasCodeParam: searchParams.has('code'),
    hasSSOPendingParam: searchParams.has('sso_pending')
  })

  // Show loading spinner if:
  // 1. Auth is still loading, OR
  // 2. SSO authentication is in progress (to prevent premature redirect to /login)
  if (loading || isSSOPending) {
    if (isSSOPending) {
      console.log('[SPARK SSO] SSO flow in progress - showing loading spinner')
    } else {
      console.log('[SPARK SSO] Auth loading - showing spinner')
    }
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    console.log('[SPARK SSO] Not authenticated - redirecting to /login')
    console.log('[SPARK SSO] Auth state at redirect:', { loading, user: !!user, isSSOPending })
    return <Navigate to="/login" replace />
  }


  if (requiredRole) {
    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    const hasAccess = allowedRoles.includes(user?.role) || user?.role === 'admin'

    if (!hasAccess) {
      // Redirect parents to their parent dashboard instead of the regular dashboard
      const redirectPath = user?.role === 'parent' ? '/parent/dashboard' : '/dashboard'
      return <Navigate to={redirectPath} replace />
    }
  }

  return <Outlet />
}

export default PrivateRoute