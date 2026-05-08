import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * Gate for /showcase. Allows superadmin OR users with can_view_showcase=true.
 * Mirrors PrivateRoute's loading/auth handling.
 */
const ShowcaseRoute = () => {
  const { isAuthenticated, user, effectiveRole, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  const hasAccess = effectiveRole === 'superadmin' || user?.can_view_showcase === true
  if (!hasAccess) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

export default ShowcaseRoute
