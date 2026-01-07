import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const PrivateRoute = ({ requiredRole }) => {
  const { isAuthenticated, user, loading } = useAuth()

  // Show loading spinner while auth is still loading
  if (loading) {
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
    // Users with is_org_admin flag get access to org_admin routes
    const hasAccess =
      allowedRoles.includes(user?.role) ||
      user?.role === 'superadmin' ||
      (user?.is_org_admin && allowedRoles.includes('org_admin'))

    if (!hasAccess) {
      // Redirect to role-appropriate dashboard
      const redirectPath = user?.role === 'parent' ? '/parent/dashboard'
        : user?.role === 'observer' ? '/observer/feed'
        : '/dashboard'
      return <Navigate to={redirectPath} replace />
    }
  }

  return <Outlet />
}

export default PrivateRoute