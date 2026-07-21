import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useParentClassRegistrationGate } from '../hooks/useICreateRegistrationGate'

// Route guard for the parent class-registration surface (Schedule Builder).
//
// A guardian — including parent+teacher staff whose primary role is advisor —
// must complete the iCreate registration funnel and pay its fee before enrolling
// their children in classes. This gates ONLY these routes, so staff keep their
// teacher/advisor features reachable while their own family registration is
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
    return <Navigate to="/register/icreate/resume" replace />
  }
  return <Outlet />
}

export default RequireParentRegistration
