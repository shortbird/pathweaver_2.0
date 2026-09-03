import React, { useEffect, useState } from 'react'
import { Outlet, Navigate, useNavigate, useLocation, Link } from 'react-router-dom'
import { Bars3Icon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { goToLearningSurface } from '../../utils/appSurface'
import SisSidebar from './SisSidebar'
import NotificationBell from '../notifications/NotificationBell'
import { isSisAdmin, isSisStaff } from '../../pages/sis/sisRole'
import { usePhoneVerificationGate } from '../../hooks/usePhoneVerificationGate'
import { getPreviewTeacher, clearPreviewTeacher } from '../../pages/sis/teacherPreview'

const PreviewBanner = () => {
  const navigate = useNavigate()
  const preview = getPreviewTeacher()
  if (!preview) return null
  return (
    // top-14, not top-0: the header above it is sticky at every width now, so
    // a banner pinned to 0 scrolls up underneath it and disappears.
    <div className="sticky top-14 z-20 bg-gradient-to-r from-optio-purple to-optio-pink text-white px-4 py-2 flex items-center gap-3 text-sm">
      <span className="font-medium">
        Previewing the teacher portal as {preview.name} (read-only)
      </span>
      <button
        onClick={() => { clearPreviewTeacher(); navigate('/people?tab=staff'); window.location.reload() }}
        className="ml-auto rounded-lg bg-white/20 hover:bg-white/30 px-3 py-1 font-semibold"
      >
        Exit preview
      </button>
    </div>
  )
}


const Spinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
  </div>
)

/**
 * Gate + chrome for the SIS console.
 *
 * Only staff (org_admin, campus_coordinator, advisor, superadmin) may use the
 * SIS surface. Students and parents who land here are bounced back to the
 * Learning app. Unauthenticated visitors are sent to the Learning login (the
 * cookie session is shared across subdomains, so logging in there authenticates
 * the SIS host too).
 */
const SisLayout = () => {
  const { isAuthenticated, user, loading } = useAuth()
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()
  // Staff in orgs that require a verified phone number are locked to verifying
  // it. The SIS host never runs PrivateRoute, so the check lives here too —
  // same hook, same backend answer, mirrored on both surfaces.
  const phoneGate = usePhoneVerificationGate(user, isAuthenticated)

  // Close the drawer on navigation — otherwise it stays over the page you just
  // opened. (Hooks run before the auth guards below, which is why they're here.)
  useEffect(() => { setNavOpen(false) }, [location.pathname])

  if (loading) return <Spinner />

  if (!isAuthenticated) {
    goToLearningSurface('/login')
    return <Spinner />
  }

  if (phoneGate.checking) return <Spinner />
  if (phoneGate.blocked) {
    return <Navigate to="/verify-phone" replace />
  }

  // isSisStaff weighs every role the user holds, not the primary one alone: a
  // teacher who is also a parent of a student here is stored as ['parent',
  // 'advisor'] as often as the other way round, and the leading entry is an
  // accident of what was written first. Checking effectiveRole alone bounced
  // those teachers out of the console the sidebar had just offered them.
  const isStaff = isSisStaff(user)
  if (!isStaff) {
    goToLearningSurface('/')
    return <Spinner />
  }

  const admin = isSisAdmin(user)
  const previewing = Boolean(getPreviewTeacher())

  return (
    <div className="min-h-screen bg-neutral-50">
      <SisSidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      {/* Scrim behind the drawer on small screens */}
      {navOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
        />
      )}
      <main id="main-content" className="lg:ml-60 min-h-screen">
        {/* Header. The menu button and wordmark are small-screen only (without
            them the fixed sidebar ran off the edge of a tablet with no way back
            to the dashboard); the bell is at every width.

            The console had no notification surface at all until now — no bell,
            no unread count anywhere in the chrome — so a teacher in an
            SIS-enabled org only discovered a student's message by opening each
            class in turn ("I don't think I see it unless I look at specific
            students individually" — Gryffin, Perch d7300f59). The notifications
            themselves were already being written; nothing on this surface read
            them. Same component the learning app mounts in TopNavbar, over the
            same /api/notifications. Its links point at learning-app paths,
            which SisRoutes already hands over via LEARNING_SURFACE_PATHS
            (/notifications and /messages are both listed). */}
        <header className="sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-white border-b border-gray-200">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={navOpen}
            className="lg:hidden p-2 -ml-2 rounded-lg text-neutral-600 hover:bg-neutral-100"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>
          <Link to="/" className="lg:hidden font-semibold text-neutral-900">Optio <span className="text-xs uppercase tracking-wide text-neutral-400">SIS</span></Link>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>
        {admin && <PreviewBanner />}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <Outlet />
        </div>
      </main>
      {/* Staff issue reporting is the Perch FAB, mounted app-wide in App.jsx
          (PerchReporter) — it replaced the beta FeedbackFab here. */}
    </div>
  )
}

export default SisLayout
