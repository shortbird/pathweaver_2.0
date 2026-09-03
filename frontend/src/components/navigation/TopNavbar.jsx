import React, { useRef, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import { useActingAs } from '../../contexts/ActingAsContext'
import NotificationBell from '../notifications/NotificationBell'
import BackButton from './BackButton'
import { getPostLoginPath } from '../../utils/postLoginPath'
import { exitRoleView } from '../sis/RoleViewSwitcher'

const TopNavbar = ({ onMenuClick, siteSettings }) => {
  const navRef = useRef(null)
  const menuRef = useRef(null)
  const location = useLocation()
  const { user, logout, isAuthenticated, effectiveRole } = useAuth()
  const { organization } = useOrganization()
  const { actingAsDependent, parentName } = useActingAs()
  const [menuOpen, setMenuOpen] = useState(false)

  // Set CSS variable for navbar height so Layout can use dynamic padding
  useEffect(() => {
    const updateNavbarHeight = () => {
      if (navRef.current) {
        const height = navRef.current.offsetHeight
        document.documentElement.style.setProperty('--navbar-height', `${height}px`)
      }
    }

    updateNavbarHeight()
    window.addEventListener('resize', updateNavbarHeight)
    return () => window.removeEventListener('resize', updateNavbarHeight)
  }, [isAuthenticated]) // Re-measure when auth state changes

  const handleLogout = async () => {
    setMenuOpen(false)
    await logout()
  }

  // Close the account menu on outside click, Escape, or navigation
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  // Display name, avatar and initials; when a parent acts as a child, show the child.
  const displayName = actingAsDependent
    ? (`${actingAsDependent.first_name || ''} ${actingAsDependent.last_name || ''}`.trim() || actingAsDependent.display_name)
    : `${user?.first_name || ''} ${user?.last_name || ''}`.trim()
  const avatarUrl = actingAsDependent ? actingAsDependent.avatar_url : user?.avatar_url
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?'

  // The "who am I" menu destination per role. /overview is the student
  // portfolio; parents go to their family dashboard instead (acting-as sessions
  // carry the child's role, so they still resolve to /overview).
  const profileItem = effectiveRole === 'observer'
    ? { label: 'My Feed', path: '/observer/feed' }
    : effectiveRole === 'parent'
      ? { label: 'Family Dashboard', path: '/parent/dashboard' }
      : { label: 'Profile', path: '/overview' }

  // Parents have no /overview, so "where do I change my name" had no answer in
  // this menu — the one place people look for it. Deep-link straight into the
  // Family Settings "You" tab rather than leaving them to find the modal.
  const accountItem = effectiveRole === 'parent'
    ? { label: 'Your account', path: '/parent/dashboard?settings=you' }
    : null

  return (
    <nav ref={navRef} className="fixed top-0 left-0 right-0 bg-white shadow-sm border-b border-gray-200 z-30">
      {/* lg:pl-5 = 20px, the sidebar's icon column (rail px-2 + item px-3). The
          logo and the nav icons below it sit on one vertical line instead of the
          logo being indented 12px further than everything under it. */}
      <div className="h-16 px-4 sm:px-6 lg:pl-5 lg:pr-8">
        <div className="flex justify-between items-center h-full">
          {/* Left Section: Logo + Toggle.
              gap-3, not space-x-3: space-x's `~ :not([hidden])` selector still
              matches siblings hidden with `lg:hidden` (display:none is not the
              hidden attribute), so on desktop the logo was inheriting a phantom
              12px margin from the mobile menu button — the real source of the
              corner's off-by-a-bit indent. gap ignores display:none children. */}
          <div className="flex items-center gap-3">
            {/* Mobile Menu Button */}
            {isAuthenticated && (
              <button
                className="lg:hidden p-2 rounded-md text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation transition-colors"
                onClick={onMenuClick}
                aria-label="Open navigation menu"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}

            {/* Back Button — hidden on tab-root pages, visible on every leaf
                route. Helps iOS users who don't have Safari chrome (PWA) and
                find edge-swipe unintuitive. */}
            <BackButton />

            {/* Logo - Shows both Organization and Optio. Logged-in users go to
                their role's dashboard, not the marketing homepage. */}
            <Link to={isAuthenticated ? getPostLoginPath(user) : '/'} className="flex items-center gap-3">
              {/* Organization Logo (if authenticated and org has custom branding) - LEFT of Optio.
                  An org whose brand IS the Optio mark (Optio Academy) sets
                  branding_config.hide_nav_logo so the navbar doesn't show the
                  same logo twice. */}
              {isAuthenticated && organization && organization.branding_config?.logo_url
                && !organization.branding_config?.hide_nav_logo && (
                <>
                  <img
                    src={organization.branding_config.logo_url}
                    alt={organization.name}
                    className="h-9 w-auto max-w-[140px] hidden sm:block"
                  />
                  <div className="h-7 w-px bg-gray-300 hidden sm:block" aria-hidden="true"></div>
                </>
              )}

              {/* Optio Logo - Use favicon when org logo is present, full logo otherwise */}
              {isAuthenticated && organization && organization.branding_config?.logo_url
                && !organization.branding_config?.hide_nav_logo ? (
                <img
                  src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg"
                  alt="Optio"
                  className="h-9 w-9"
                />
              ) : siteSettings?.logo_url ? (
                /* h-10 in a 64px bar: the old h-8 left the mark floating in a
                   band of dead space above and below it. */
                <img
                  src={siteSettings.logo_url}
                  alt={siteSettings.site_name || "Optio"}
                  className="h-10 w-auto"
                />
              ) : (
                <span className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent font-poppins">
                  {siteSettings?.site_name || "Optio"}
                </span>
              )}
            </Link>

          </div>

          {/* Right Section: User Info */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                {/* Acting As Indicator - Show when parent is acting as child */}
                {actingAsDependent && parentName && (
                  <div className="hidden sm:flex items-center gap-1 text-xs font-poppins bg-gradient-primary text-white px-2 py-1 rounded-full">
                    <span className="font-medium">{parentName}</span>
                    <span className="opacity-80">as</span>
                    <span className="font-semibold">{`${actingAsDependent.first_name || ''} ${actingAsDependent.last_name || ''}`.trim() || actingAsDependent.display_name}</span>
                  </div>
                )}

                {/* Notification Bell */}
                <NotificationBell />

                {/* Account menu: avatar + name opening Profile / Logout */}
                <div className="relative hidden sm:block" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen((open) => !open)}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label="Account menu"
                    className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-neutral-100 transition-colors"
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-gradient-primary text-white text-xs font-poppins font-semibold flex items-center justify-center">
                        {initials}
                      </span>
                    )}
                    <span className="text-sm font-poppins font-medium text-neutral-700 max-w-[160px] truncate">
                      {displayName}
                    </span>
                    <svg className={`w-4 h-4 text-neutral-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {menuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1"
                    >
                      <Link
                        role="menuitem"
                        to={profileItem.path}
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-2 text-sm font-poppins text-neutral-700 hover:bg-neutral-50 hover:text-optio-purple transition-colors"
                      >
                        {profileItem.label}
                      </Link>
                      {accountItem && (
                        <Link
                          role="menuitem"
                          to={accountItem.path}
                          onClick={() => setMenuOpen(false)}
                          className="block px-4 py-2 text-sm font-poppins text-neutral-700 hover:bg-neutral-50 hover:text-optio-purple transition-colors"
                        >
                          {accountItem.label}
                        </Link>
                      )}
                      {/* Way back from "view as parent/student": that view
                          lands here on the learning app, where the SIS
                          sidebar's switcher isn't visible. */}
                      {user?.role_view?.active_role && (
                        <button
                          role="menuitem"
                          onClick={async () => {
                            setMenuOpen(false)
                            try { await exitRoleView() } catch { /* reload anyway */ }
                          }}
                          className="w-full text-left px-4 py-2 text-sm font-poppins text-optio-purple hover:bg-neutral-50 transition-colors"
                        >
                          Exit “{user.role_view.active_role === 'advisor' ? 'teacher' : user.role_view.active_role.replace('_', ' ')}” view
                        </button>
                      )}
                      <button
                        role="menuitem"
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm font-poppins text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 transition-colors"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Login/Register for non-authenticated */}
                <Link
                  to="/login"
                  className="text-sm font-poppins font-medium text-neutral-700 hover:text-optio-purple transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="bg-gradient-primary text-white px-6 py-2 rounded-full text-sm font-poppins font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

    </nav>
  )
}

export default TopNavbar
