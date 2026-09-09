import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useParentClassRegistrationGate } from '../hooks/useRegistrationGate'

// Route guard for the parent class-registration surface (Schedule Builder).
//
// A guardian — including staff whose primary role is a staff one (advisor,
// campus_coordinator, org_admin), who gain 'parent' alongside it when they
// register — must complete the registration funnel and pay its fee before enrolling
// their children in classes. This gates ONLY these routes, so staff keep their
// staff features reachable while their own family registration is
// still pending. Pure parents are already locked to the funnel globally by
// PrivateRoute; this catches the dual-role case the global gate skips.
const RequireParentRegistration = () => {
  const { user, isAuthenticated, loading } = useAuth()
  const gate = useParentClassRegistrationGate(user, isAuthenticated)

  if (loading || gate.checking) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }
  if (gate.mustRegister) {
    return <Navigate to="/enroll/resume" replace />
  }
  return <Outlet />
}

export default RequireParentRegistration
