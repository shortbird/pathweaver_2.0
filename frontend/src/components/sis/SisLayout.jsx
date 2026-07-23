import React from 'react'
import { Outlet, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { goToLearningSurface } from '../../utils/appSurface'
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

  return (
    <div className="min-h-screen bg-neutral-50">
      <SisSidebar />
      <main id="main-content" className="ml-60 min-h-screen">
        {isSisAdmin(user) && <PreviewBanner />}
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
