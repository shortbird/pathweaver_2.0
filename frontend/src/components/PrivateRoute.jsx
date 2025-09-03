import React, { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const PrivateRoute = ({ requiredRole }) => {
  const { isAuthenticated, user, loading, needsTosAcceptance, tosCheckLoading, checkTosAcceptance } = useAuth()
  const [tosChecked, setTosChecked] = useState(false)
  const location = useLocation()

  useEffect(() => {
    // Check ToS acceptance when user is authenticated and not on the accept-terms page
    if (isAuthenticated && user && user.role !== 'admin' && location.pathname !== '/accept-terms') {
      checkTosAcceptance().then(() => {
        setTosChecked(true)
      })
    } else {
      setTosChecked(true)
    }
  }, [isAuthenticated, user, location.pathname, checkTosAcceptance])

  if (loading || (tosCheckLoading && !tosChecked)) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Check if user needs to accept ToS (but not if they're already on the accept-terms page)
  if (needsTosAcceptance && user?.role !== 'admin' && location.pathname !== '/accept-terms') {
    return <Navigate to="/accept-terms" replace />
  }

  if (requiredRole && user?.role !== requiredRole && user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

export default PrivateRoute