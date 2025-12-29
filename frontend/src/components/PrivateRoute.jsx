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
    // Superadmin has universal access, org admins only get access to explicitly allowed routes
    const hasAccess = allowedRoles.includes(user?.role) || user?.role === 'superadmin'

    if (!hasAccess) {
      // Redirect parents to their parent dashboard instead of the regular dashboard
      const redirectPath = user?.role === 'parent' ? '/parent/dashboard' : '/dashboard'
      return <Navigate to={redirectPath} replace />
    }
  }

  return <Outlet />
}

export default PrivateRoute