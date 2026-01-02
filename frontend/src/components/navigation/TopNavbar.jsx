import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import { useActingAs } from '../../contexts/ActingAsContext'
import NotificationBell from '../notifications/NotificationBell'
// import { getTierDisplayName, getTierBadgeColor } from '../../utils/tierMapping' // REMOVED - Phase 3 refactoring (January 2025)

const TopNavbar = ({ onMenuClick, siteSettings }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, isAuthenticated } = useAuth()
  const { organization } = useOrganization()
  const { actingAsDependent, parentName } = useActingAs()

  const handleLogout = async () => {
    await logout()
  }

  const isActiveToggle = (path) => {
    // Dashboard toggle should be active for: /dashboard, /connections, /diploma, /profile, /badges, /admin, /communication, /calendar, /organization
    if (path === '/dashboard') {
      return ['/dashboard', '/connections', '/diploma', '/profile', '/badges', '/admin', '/communication', '/calendar', '/organization'].some(route =>
        location.pathname === route || location.pathname.startsWith(route + '/')
      )
    }
    // Explore toggle should be active only for /quests
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  const getToggleButtonClasses = (path) => {
    const isActive = isActiveToggle(path)
    return `
      px-6 py-2 rounded-lg font-poppins font-semibold text-sm
      transition-all duration-200
      ${isActive
        ? 'bg-gradient-primary text-white shadow-md'
        : 'text-neutral-700 hover:bg-neutral-100'
      }
    `
  }

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white shadow-sm border-b border-gray-200 z-30">
      <div className="h-16 px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-full">
          {/* Left Section: Logo + Toggle */}
          <div className="flex items-center space-x-6">
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

            {/* Logo - Shows both Organization and Optio */}
            <Link to={isAuthenticated ? "/dashboard" : "/"} className="flex items-center gap-3">
              {/* Organization Logo (if authenticated and org has custom branding) - LEFT of Optio */}
              {isAuthenticated && organization && organization.branding_config?.logo_url && (
                <>
                  <img
                    src={organization.branding_config.logo_url}
                    alt={organization.name}
                    className="h-8 w-auto max-w-[140px] hidden sm:block"
                  />
                  <div className="h-6 w-px bg-gray-300 hidden sm:block" aria-hidden="true"></div>
                </>
              )}

              {/* Optio Logo */}
              {siteSettings?.logo_url ? (
                <img
                  src={siteSettings.logo_url}
                  alt={siteSettings.site_name || "Optio"}
                  className="h-8 w-auto"
                />
              ) : (
                <span className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent font-poppins">
                  {siteSettings?.site_name || "Optio"}
                </span>
              )}
            </Link>

            {/* Dashboard/Explore Toggle (authenticated only) */}
            {isAuthenticated && (
              <div className="hidden sm:flex items-center space-x-2 bg-neutral-50 rounded-lg p-1">
                <button
                  onClick={() => navigate('/dashboard')}
                  className={getToggleButtonClasses('/dashboard')}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => navigate('/quests')}
                  className={getToggleButtonClasses('/quests')}
                >
                  Quests
                </button>
              </div>
            )}
          </div>

          {/* Right Section: User Info */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                {/* Acting As Indicator - Show when parent is acting as child */}
                {actingAsDependent && parentName && (
                  <div className="hidden sm:flex items-center gap-1 text-xs font-poppins bg-gradient-to-r from-optio-purple to-optio-pink text-white px-2 py-1 rounded-full">
                    <span className="font-medium">{parentName}</span>
                    <span className="opacity-80">as</span>
                    <span className="font-semibold">{actingAsDependent.display_name}</span>
                  </div>
                )}

                {/* User Name - Show dependent's name when acting as them */}
                <Link
                  to="/profile"
                  className="hidden sm:block text-sm font-poppins font-medium text-neutral-700 hover:text-optio-purple transition-colors"
                >
                  {actingAsDependent ? actingAsDependent.display_name : `${user?.first_name} ${user?.last_name}`}
                </Link>

                {/* Notification Bell */}
                <NotificationBell />

                {/* Subscription Tier Badge - REMOVED Phase 3 refactoring (January 2025) */}

                {/* Logout */}
                <button
                  onClick={handleLogout}
                  className="hidden sm:block text-sm font-poppins font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
                >
                  Logout
                </button>
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

      {/* Mobile Toggle Buttons (below logo on mobile) */}
      {isAuthenticated && (
        <div className="sm:hidden border-t border-gray-200 px-4 py-2 flex space-x-2 bg-neutral-50">
          <button
            onClick={() => navigate('/dashboard')}
            className={getToggleButtonClasses('/dashboard')}
          >
            Dashboard
          </button>
          <button
            onClick={() => navigate('/quests')}
            className={getToggleButtonClasses('/quests')}
          >
            Quests
          </button>
        </div>
      )}
    </nav>
  )
}

export default TopNavbar
