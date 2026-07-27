import React, { useEffect, useState } from 'react'
import { Outlet, Navigate, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { goToLearningSurface } from '../../utils/appSurface'
import api from '../../services/api'
import SisSidebar from './SisSidebar'
import SisFeedbackFab from './SisFeedbackFab'
import { isSisAdmin } from '../../pages/sis/sisRole'
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
 * Only staff (org_admin, advisor, superadmin) may use the SIS surface. Students
 * and parents who land here are bounced back to the Learning app. Unauthenticated
 * visitors are sent to the Learning login (the cookie session is shared across
 * subdomains, so logging in there authenticates the SIS host too).
 */
const SisLayout = () => {
  const { isAuthenticated, effectiveRole, user, loading } = useAuth()

  if (loading) return <Spinner />

  if (!isAuthenticated) {
    goToLearningSurface('/login')
    return <Spinner />
  }

  const isStaff = ['org_admin', 'advisor', 'superadmin'].includes(effectiveRole) || user?.is_org_admin
  if (!isStaff) {
    goToLearningSurface('/')
    return <Spinner />
  }

  const admin = isSisAdmin(user)
  const previewing = Boolean(getPreviewTeacher())

  return (
    <div className="min-h-screen bg-neutral-50">
      <SisSidebar />
      <main id="main-content" className="ml-60 min-h-screen">
        {admin && <PreviewBanner />}
        {/* Teacher (non-admin, not previewing): nudge until onboarding is done. */}
        {!admin && !previewing && <OnboardingNudge />}
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Outlet />
        </div>
      </main>
      {/* Beta feedback FAB (bug / idea / "I don't get this") — pilot support */}
      <SisFeedbackFab />
    </div>
  )
}

export default SisLayout
