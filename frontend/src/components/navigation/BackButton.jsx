import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Pages where a back button doesn't make sense — the top-level destinations
// users reach from the sidebar / topbar tabs, plus auth and marketing landings.
// Adding a new sub-page (e.g. /quests/:id) doesn't require updating this list;
// only add entries here when introducing a new top-level route.
const TAB_ROOTS = new Set([
  '/',
  '/dashboard',
  '/quests',
  '/courses',
  '/overview',
  '/observer/feed',
  '/learning-journal',
  '/credits',
  '/transcript',
  '/my-classes',
  '/classes',
  '/org-classes',
  '/messages',
  '/bounties',
  '/notifications',
  '/invitations',
  '/feedback',
  '/evidence-reports',
  '/admin',
  '/advisor',
  '/advisor/dashboard',
  '/parent',
  '/parent/dashboard',
  '/organization',
  '/credit-dashboard',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/email-verification',
  '/parental-consent',
  '/for-students',
  '/for-families',
  '/for-schools',
  '/how-it-works',
  '/philosophy',
  '/terms',
  '/privacy',
  '/academy-agreement',
  '/academy-handbook',
  '/demo',
  '/catalog',
])

const BackButton = ({ className = '' }) => {
  const location = useLocation()
  const navigate = useNavigate()

  if (TAB_ROOTS.has(location.pathname)) {
    return null
  }

  const handleBack = () => {
    // React Router 6 stamps an `idx` onto history.state for in-app navigations.
    // idx > 0 means we have an in-app entry to pop back to. idx === 0 (or
    // undefined) means we landed here from a deep link / external referrer —
    // popping would take the user out of the app, so we step up one URL
    // segment instead (e.g. /quests/:id -> /quests).
    const idx = window.history.state?.idx ?? 0
    if (idx > 0) {
      navigate(-1)
      return
    }
    const segments = location.pathname.split('/').filter(Boolean)
    if (segments.length > 1) {
      navigate('/' + segments.slice(0, -1).join('/'))
    } else {
      navigate('/')
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Go back"
      className={`lg:hidden p-2 rounded-md text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation transition-colors ${className}`}
    >
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}

export default BackButton
