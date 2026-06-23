import React from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { goToLearningSurface } from '../../utils/appSurface'
import SisSidebar from './SisSidebar'

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
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default SisLayout
