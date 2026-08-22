import React, { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useICreateRegistrationGate } from '../hooks/useICreateRegistrationGate'
import { useRequiredDocumentsGate } from '../hooks/useRequiredDocumentsGate'
import { usePhoneVerificationGate } from '../hooks/usePhoneVerificationGate'
import { roleHomePath } from '../utils/postLoginPath'

// A hold that can loop is a hold that can lock a school out.
//
// Each gate below sends a held user to a standalone page; that page asks the
// same endpoint again and, finding nothing to do, sends them back. If the gate
// and the page ever disagree — a stale cache, a flag flipped mid-session, two
// holds handing the user to each other — the two bounce forever, and because
// the hold pages render no app chrome there is no visible way out. That is
// exactly what happened on 2026-08-22, between /verify-phone and
// /family/required-documents.
//
// So: count the redirects, and give up rather than spin. Failing OPEN matches
// how the holds already treat a database hiccup (see phone_verification_hold),
// and the backend middleware still refuses the actual data either way — a user
// let through here still cannot read anything they should not.
const HOLD_REDIRECT_LIMIT = 4
let holdRedirects = 0

const holdRedirect = (to) => {
  holdRedirects += 1
  if (holdRedirects > HOLD_REDIRECT_LIMIT) {
    if (holdRedirects === HOLD_REDIRECT_LIMIT + 1) {
      console.warn(
        `[PrivateRoute] ${holdRedirects} hold redirects in one session; letting the ` +
        `user through rather than looping. Last target: ${to}`)
    }
    return null
  }
  return to
}

const PrivateRoute = ({ requiredRole, blockRoles }) => {
  const { isAuthenticated, user, effectiveRole, loading } = useAuth()
  const location = useLocation()
  // iCreate parents with an unfinished registration funnel are locked to it.
  const icreateGate = useICreateRegistrationGate(user, isAuthenticated, effectiveRole)
  // Families holding unsigned REQUIRED school paperwork are locked to signing it.
  const docsGate = useRequiredDocumentsGate(user, isAuthenticated)
  // Adults in orgs that require a verified phone number are locked to verifying it.
  const phoneGate = usePhoneVerificationGate(user, isAuthenticated)

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
    const to = holdRedirect('/family/required-documents')
    if (to) return <Navigate to={to} replace />
  }

  // Phone verification. Last of the three holds: a family still in the funnel
  // or holding unsigned paperwork finishes those first — the funnel collects
  // its own phone number, and two simultaneous gates would fight over the
  // redirect.
  if (phoneGate.checking) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }
  if (phoneGate.blocked) {
    const to = holdRedirect('/verify-phone')
    if (to) return <Navigate to={to} replace />
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