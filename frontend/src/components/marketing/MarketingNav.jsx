import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { captureEvent } from '../../services/posthog'
import { useAuth } from '../../contexts/AuthContext'
import { getPostLoginPath } from '../../utils/postLoginPath'
import { hasLocalSessionHint } from '../../utils/sessionHint'

const LOGO_URL = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png'

const NAV_LINKS = [
  { label: 'Classes', path: '/classes' },
  { label: 'Courses', path: '/catalog' },
  { label: 'Academy', path: '/academy' },
  { label: 'For Families', path: '/for-families' },
  { label: 'For Schools', path: '/for-schools' },
  { label: 'How It Works', path: '/how-it-works' },
  // { label: 'Philosophy', path: '/philosophy' },
]

const MarketingNav = () => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  // Signed-in users browsing marketing pages get a single way back into the
  // app; offering them "Login" made them believe their session was gone. While
  // the session check is still resolving, the session_sync hint decides whether
  // to hold the CTA slot empty (probable session) or show the anonymous CTAs
  // immediately (no hint — the anonymous majority and every crawler).
  const { isAuthenticated, user, loading } = useAuth()
  const dashboardPath = isAuthenticated && user ? getPostLoginPath(user) : null
  const hideAuthCtas = !dashboardPath && loading && hasLocalSessionHint()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const isActive = (path) => location.pathname === path

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 backdrop-blur-md shadow-sm'
          : 'bg-white/80 backdrop-blur-sm'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            to="/"
            className="flex-shrink-0"
            onClick={() => captureEvent('marketing_nav_logo_click')}
          >
            <img src={LOGO_URL} alt="Optio" className="h-8 sm:h-9" />
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => captureEvent('marketing_nav_link_click', { link: link.label, path: link.path })}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isActive(link.path)
                    ? 'text-optio-purple bg-optio-purple/10'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA buttons */}
          <div className="hidden md:flex items-center gap-3">
            {dashboardPath ? (
              <Link
                to={dashboardPath}
                onClick={() => captureEvent('marketing_nav_dashboard_click')}
                className="bg-gradient-to-r from-optio-purple to-optio-pink text-white px-6 py-2.5 rounded-full text-sm font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                Go to my dashboard
              </Link>
            ) : hideAuthCtas ? null : (
              <>
                <Link
                  to="/login"
                  onClick={() => captureEvent('marketing_nav_login_click')}
                  className="text-sm font-semibold text-gray-700 hover:text-optio-purple transition-colors px-4 py-2"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  onClick={() => captureEvent('marketing_nav_signup_click')}
                  className="bg-gradient-to-r from-optio-purple to-optio-pink text-white px-6 py-2.5 rounded-full text-sm font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                >
                  Create Free Account
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          mobileOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="bg-white border-t border-gray-100 px-4 py-3 space-y-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => captureEvent('marketing_nav_link_click', { link: link.label, path: link.path, mobile: true })}
              className={`block px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${
                isActive(link.path)
                  ? 'text-optio-purple bg-optio-purple/10'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
            {dashboardPath ? (
              <Link
                to={dashboardPath}
                onClick={() => captureEvent('marketing_nav_dashboard_click', { mobile: true })}
                className="block text-center bg-gradient-to-r from-optio-purple to-optio-pink text-white px-6 py-3 rounded-full text-sm font-semibold shadow-md"
              >
                Go to my dashboard
              </Link>
            ) : hideAuthCtas ? null : (
              <>
                <Link
                  to="/login"
                  onClick={() => captureEvent('marketing_nav_login_click', { mobile: true })}
                  className="block text-center px-4 py-3 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  onClick={() => captureEvent('marketing_nav_signup_click', { mobile: true })}
                  className="block text-center bg-gradient-to-r from-optio-purple to-optio-pink text-white px-6 py-3 rounded-full text-sm font-semibold shadow-md"
                >
                  Create Free Account
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

export default MarketingNav
