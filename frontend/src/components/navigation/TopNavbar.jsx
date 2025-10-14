import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const TopNavbar = ({ onMenuClick, siteSettings }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, isAuthenticated } = useAuth()

  const handleLogout = async () => {
    await logout()
  }

  const isActiveToggle = (path) => {
    // Dashboard toggle should be active for: /dashboard, /friends, /diploma, /profile, /badges, /admin, /communication, /calendar
    if (path === '/dashboard') {
      return ['/dashboard', '/friends', '/diploma', '/profile', '/badges', '/admin', '/communication', '/calendar'].some(route =>
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
        ? 'bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white shadow-md'
        : 'text-[#3B383C] hover:bg-[#EEEBEF]'
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
                className="lg:hidden p-2 rounded-md text-[#605C61] hover:text-[#3B383C] hover:bg-[#EEEBEF] min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation transition-colors"
                onClick={onMenuClick}
                aria-label="Open navigation menu"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}

            {/* Logo */}
            <Link to={isAuthenticated ? "/dashboard" : "/"} className="flex items-center">
              {siteSettings?.logo_url ? (
                <img
                  src={siteSettings.logo_url}
                  alt={siteSettings.site_name || "Optio"}
                  className="h-8 w-auto"
                />
              ) : (
                <span className="text-2xl font-bold bg-gradient-to-r from-[#6D469B] to-[#EF597B] bg-clip-text text-transparent font-poppins">
                  {siteSettings?.site_name || "Optio"}
                </span>
              )}
            </Link>

            {/* Dashboard/Explore Toggle (authenticated only) */}
            {isAuthenticated && (
              <div className="hidden sm:flex items-center space-x-2 bg-[#F3EFF4] rounded-lg p-1">
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
                  Explore New Quests
                </button>
              </div>
            )}
          </div>

          {/* Right Section: User Info */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                {/* User Name */}
                <Link
                  to="/profile"
                  className="hidden sm:block text-sm font-poppins font-medium text-[#3B383C] hover:text-[#6D469B] transition-colors"
                >
                  {user?.first_name} {user?.last_name}
                </Link>

                {/* Subscription Tier Badge */}
                <Link
                  to="/subscription"
                  className={`
                    hidden sm:block text-xs px-3 py-1 rounded-full font-poppins font-semibold
                    uppercase tracking-wider cursor-pointer hover:opacity-80 transition-opacity
                    ${
                      user?.subscription_tier === 'academy' || user?.subscription_tier === 'enterprise'
                        ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white shadow-md'
                        : user?.subscription_tier === 'supported' || user?.subscription_tier === 'creator' || user?.subscription_tier === 'premium'
                        ? 'bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white shadow-md'
                        : 'bg-[#EEEBEF] text-[#605C61]'
                    }
                  `}
                  title="Click to manage subscription"
                >
                  {user?.subscription_tier === 'free' || user?.subscription_tier === 'explorer' ? 'Free' :
                   user?.subscription_tier === 'supported' || user?.subscription_tier === 'creator' || user?.subscription_tier === 'premium' ? 'Supported' :
                   user?.subscription_tier === 'academy' || user?.subscription_tier === 'enterprise' ? 'Academy' :
                   user?.subscription_tier?.toUpperCase() || 'Free'}
                </Link>

                {/* Logout */}
                <button
                  onClick={handleLogout}
                  className="hidden sm:block text-sm font-poppins font-medium text-[#605C61] hover:text-[#3B383C] transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                {/* Login/Register for non-authenticated */}
                <Link
                  to="/login"
                  className="text-sm font-poppins font-medium text-[#3B383C] hover:text-[#6D469B] transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white px-6 py-2 rounded-full text-sm font-poppins font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
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
        <div className="sm:hidden border-t border-gray-200 px-4 py-2 flex space-x-2 bg-[#F3EFF4]">
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
            Explore
          </button>
        </div>
      )}
    </nav>
  )
}

export default TopNavbar
