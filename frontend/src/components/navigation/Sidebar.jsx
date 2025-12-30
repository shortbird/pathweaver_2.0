import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useActingAs } from '../../contexts/ActingAsContext'
import ActingAsBanner from '../parent/ActingAsBanner'

const Sidebar = ({ isOpen, onClose, isCollapsed, isPinned, onTogglePin, isHovered, onHoverChange }) => {
  const location = useLocation()
  const { user, logout, isAuthenticated } = useAuth()
  const { actingAsDependent, clearActingAs } = useActingAs()
  const [actingAsBannerExpanded, setActingAsBannerExpanded] = useState(false)

  // Determine if sidebar should show expanded (full width with text)
  // Expanded when: pinned, or hovered while collapsed
  const isExpanded = isPinned || isHovered

  const isActiveRoute = (path) => {
    // Exact match for the path
    if (location.pathname === path) return true
    // Match child routes (e.g., /quests/123 matches /quests)
    if (location.pathname.startsWith(path + '/')) return true
    // Special case: /dashboard should not match /calendar, /communication, etc.
    return false
  }

  // Base navigation items for all users
  const baseNavItems = [
    {
      name: 'Quests',
      path: '/dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      )
    },
    {
      name: 'Courses',
      path: '/courses',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
        </svg>
      )
    },
    {
      name: 'Calendar',
      path: '/calendar',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      name: 'Communication',
      path: '/communication',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      )
    },
    {
      name: 'Connections',
      path: '/connections',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )
    },
    {
      name: 'Profile',
      path: '/profile',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    }
  ]

  // Start with base navigation items, filtering out Connections for parents
  const navItems = user?.role === 'parent'
    ? baseNavItems.filter(item => item.path !== '/connections')
    : [...baseNavItems]

  // Add Parent link if user is a parent
  if (user?.role === 'parent') {
    navItems.push({
      name: 'Parent',
      path: '/parent/dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    })
  }

  // Add Advisor link if user is advisor
  if (user?.role === 'advisor') {
    navItems.push({
      name: 'Advisor',
      path: '/advisor/dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    })
  }

  // Add Parent/Advisor links for admins and superadmins
  if (user?.role === 'admin' || user?.role === 'superadmin') {
    navItems.push({
      name: 'Parent',
      path: '/parent/dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    })
    navItems.push({
      name: 'Advisor',
      path: '/advisor/dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    })
  }

  // Add global Admin panel link ONLY for superadmins
  if (user?.role === 'superadmin') {
    navItems.push({
      name: 'Admin',
      path: '/admin',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    })
  }

  // Add Organization link for org admins or platform admins with an organization
  if ((user?.is_org_admin || user?.role === 'admin' || user?.role === 'superadmin') && user?.organization_id) {
    navItems.push({
      name: 'Organization',
      path: '/organization',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      )
    })
  }

  const handleNavClick = () => {
    if (onClose) {
      onClose()
    }
  }

  const handleLogout = async () => {
    await logout()
    if (onClose) {
      onClose()
    }
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
          aria-label="Close sidebar"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-16 left-0 bottom-0 bg-white shadow-md z-50
          transform transition-all duration-200 ease-in-out
          flex flex-col
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          ${isExpanded ? 'w-64' : 'w-16'}
        `}
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
      >
        <div className="flex-1 overflow-hidden pt-6 px-2">
          <nav className="space-y-2">
            {navItems.map((item) => {
              const isActive = isActiveRoute(item.path)

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={handleNavClick}
                  title={!isExpanded ? item.name : undefined}
                  className={`
                    flex items-center rounded-lg
                    font-poppins transition-colors duration-200
                    min-h-[44px] touch-manipulation
                    px-3 py-3
                    ${isActive
                      ? 'bg-gradient-to-r from-[#F3EFF4] to-[#E7D5F2] text-optio-purple font-semibold'
                      : 'text-neutral-700 font-medium hover:bg-[#F3EFF4]'
                    }
                  `}
                >
                  <span className={`w-5 flex-shrink-0 ${isActive ? 'text-optio-purple' : 'text-neutral-500'}`}>
                    {item.icon}
                  </span>
                  <span className={`ml-3 whitespace-nowrap overflow-hidden transition-all duration-200 ${isExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>
                    {item.name}
                  </span>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Acting As Banner (when parent is viewing as child) */}
        {actingAsDependent && (
          <div className="border-t border-gray-200 py-2 px-2 flex justify-center">
            {isExpanded ? (
              <ActingAsBanner
                dependent={actingAsDependent}
                onSwitchBack={async () => {
                  await clearActingAs()
                  window.location.href = '/parent/dashboard'
                }}
                inline={true}
                isExpanded={actingAsBannerExpanded}
                onToggleExpand={() => setActingAsBannerExpanded(prev => !prev)}
              />
            ) : (
              <button
                onClick={() => {
                  // When collapsed, expand sidebar and show banner
                  onHoverChange?.(true)
                  setActingAsBannerExpanded(true)
                }}
                title="Acting as child - click to expand"
                className="w-full flex items-center justify-center rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white min-h-[44px] touch-manipulation px-3 py-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Pin Toggle Button (Desktop Only) */}
        <div className="hidden lg:block border-t border-gray-200 py-2 px-2">
          <button
            onClick={onTogglePin}
            title={isPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
            className="w-full flex items-center rounded-lg font-poppins font-medium text-neutral-600 hover:bg-neutral-100 transition-colors duration-200 min-h-[44px] touch-manipulation px-3 py-3"
          >
            {isPinned ? (
              // Pinned icon (pushpin filled/active)
              <svg className="w-5 h-5 flex-shrink-0 text-optio-purple" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 4v7l2 3v2h-6v5l-1 1-1-1v-5H5v-2l2-3V4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2z"/>
              </svg>
            ) : (
              // Unpinned icon (pushpin outline with slash)
              <svg className="w-5 h-5 flex-shrink-0 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 4v7l2 3v2h-6v5l-1 1-1-1v-5H5v-2l2-3V4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
              </svg>
            )}
            <span className={`ml-3 whitespace-nowrap overflow-hidden transition-all duration-200 ${isExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>
              {isPinned ? 'Unpin sidebar' : 'Pin sidebar'}
            </span>
          </button>
        </div>

        {/* Logout Button (Bottom of Sidebar - Mobile Only) */}
        {isAuthenticated && (
          <div className="lg:hidden border-t border-gray-200 p-4">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center px-4 py-3 rounded-lg font-poppins font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors duration-200 min-h-[44px] touch-manipulation"
            >
              <svg className="w-5 h-5 mr-3 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Logout</span>
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

export default Sidebar
