import React, { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from './navigation/Sidebar'
import TopNavbar from './navigation/TopNavbar'

const SIDEBAR_PINNED_KEY = 'optio-sidebar-pinned'

const Layout = () => {
  const { isAuthenticated } = useAuth()
  const [siteSettings, setSiteSettings] = React.useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Initialize pinned state from localStorage (defaults to true for first-time users)
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_PINNED_KEY)
    return stored === null ? true : stored === 'true'
  })

  // Persist pinned state to localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_PINNED_KEY, sidebarPinned.toString())
  }, [sidebarPinned])

  // Track hover state for sidebar
  const [sidebarHovered, setSidebarHovered] = useState(false)

  const handleTogglePin = () => {
    setSidebarPinned(prev => !prev)
  }

  // Determine if sidebar is visually expanded (for layout calculations)
  const isSidebarExpanded = sidebarPinned || sidebarHovered

  React.useEffect(() => {
    fetchSiteSettings()
  }, [])

  const fetchSiteSettings = async () => {
    try {
      // Use fetch instead of api client to avoid auth interceptors for public endpoint
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
      const response = await fetch(`${apiUrl}/api/settings`)
      if (response.ok) {
        const data = await response.json()
        setSiteSettings(data)
      }
    } catch (error) {
      // Silent fail - use defaults
    }
  }

  // Show sidebar for all authenticated users (removed hub page restriction)
  const shouldShowSidebar = isAuthenticated

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Skip Navigation Link - Accessibility (WCAG 2.1) */}
      <a
        href="#main-content"
        className="skip-link sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-optio-purple focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-optio-pink"
      >
        Skip to main content
      </a>

      {/* Top Navbar */}
      <TopNavbar
        onMenuClick={() => setSidebarOpen(true)}
        siteSettings={siteSettings}
      />

      {/* Sidebar (authenticated users only, hidden on hub pages) */}
      {shouldShowSidebar && (
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isCollapsed={!sidebarPinned}
          isPinned={sidebarPinned}
          onTogglePin={handleTogglePin}
          isHovered={sidebarHovered}
          onHoverChange={setSidebarHovered}
        />
      )}

      {/* Main Content Area */}
      <main
        id="main-content"
        className={`
        pt-28 sm:pt-16
        transition-all duration-200
        ${shouldShowSidebar ? (isSidebarExpanded ? 'lg:ml-64' : 'lg:ml-16') : ''}
        min-h-[calc(100vh-4rem)]
      `}>
        <Outlet />
      </main>

      {/* Footer */}
      <footer className={`
        bg-white border-t border-gray-200 mt-auto transition-all duration-200
        ${shouldShowSidebar ? (isSidebarExpanded ? 'lg:ml-64' : 'lg:ml-16') : ''}
      `}>
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-neutral-500 font-poppins font-medium">
            © 2025 Optio. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default Layout
