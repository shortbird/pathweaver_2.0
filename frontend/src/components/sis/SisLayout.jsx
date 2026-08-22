import React, { useEffect, useState } from 'react'
import { Outlet, Navigate, useNavigate, useLocation, Link } from 'react-router-dom'
import { Bars3Icon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { goToLearningSurface } from '../../utils/appSurface'
import api from '../../services/api'
import SisSidebar from './SisSidebar'
import { isSisAdmin, isSisStaff } from '../../pages/sis/sisRole'
import { usePhoneVerificationGate } from '../../hooks/usePhoneVerificationGate'
import { getPreviewTeacher, clearPreviewTeacher } from '../../pages/sis/teacherPreview'

const PreviewBanner = () => {
  const navigate = useNavigate()
  const preview = getPreviewTeacher()
  if (!preview) return null
  return (
    <div className="sticky top-0 z-30 bg-gradient-to-r from-optio-purple to-optio-pink text-white px-4 py-2 flex items-center gap-3 text-sm">
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

// Persistent nudge for a teacher who still has onboarding to finish. Onboarding
// is a checklist, not a gate — the teacher has full portal access; this just
// keeps "finish your setup" in front of them until every assignment is done.
const OnboardingNudge = () => {
  const [pending, setPending] = useState(null)
  useEffect(() => {
    let active = true
    api.get('/api/sis/onboarding')
      .then((r) => {
        if (!active) return
        const incomplete = (r.data?.assignments || []).filter((a) => a.status !== 'complete')
        if (!incomplete.length) return
        const done = incomplete.reduce((s, a) => s + (a.done_count || 0), 0)
        const total = incomplete.reduce((s, a) => s + (a.total_count || 0), 0)
        setPending({ done, total })
      })
      .catch(() => { /* non-fatal: no banner */ })
    return () => { active = false }
  }, [])
  if (!pending) return null
  return (
    <div className="sticky top-0 z-30 bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 flex items-center gap-3 text-sm">
      <span className="font-medium">Finish setting up your account</span>
      <span className="text-amber-700">{pending.done} of {pending.total} onboarding items complete</span>
      <Link to="/onboarding"
        className="ml-auto rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 font-semibold">
        Continue
      </Link>
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
        {/* Small-screen header. Without this the fixed sidebar simply ran off
            the edge of a tablet and there was no way back to the dashboard. */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-white border-b border-gray-200">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={navOpen}
            className="p-2 -ml-2 rounded-lg text-neutral-600 hover:bg-neutral-100"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>
          <Link to="/" className="font-semibold text-neutral-900">Optio <span className="text-xs uppercase tracking-wide text-neutral-400">SIS</span></Link>
        </header>
        {admin && <PreviewBanner />}
        {/* Teacher (non-admin, not previewing): nudge until onboarding is done. */}
        {!admin && !previewing && <OnboardingNudge />}
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
