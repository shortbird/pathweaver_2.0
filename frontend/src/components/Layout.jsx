import React, { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import Sidebar from './navigation/Sidebar'
import TopNavbar from './navigation/TopNavbar'

const Layout = () => {
  const { user, isAuthenticated } = useAuth()
  const location = useLocation()
  const [siteSettings, setSiteSettings] = React.useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  React.useEffect(() => {
    fetchSiteSettings()
  }, [])

  const fetchSiteSettings = async () => {
    try {
      const response = await api.get('/api/settings')
      if (response.data) {
        setSiteSettings(response.data)
      }
    } catch (error) {
      // Silent fail - use defaults
    }
  }

  // Hide sidebar on quest/badge hub pages
  const isHubPage = location.pathname.startsWith('/quests') || location.pathname.startsWith('/badges')
  const shouldShowSidebar = isAuthenticated && !isHubPage

  return (
    <div className="min-h-screen bg-neutral-50">
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
        />
      )}

      {/* Main Content Area */}
      <main className={`
        pt-16
        ${shouldShowSidebar ? 'lg:ml-64' : ''}
        min-h-[calc(100vh-4rem)]
      `}>
        <Outlet />
      </main>

      {/* Footer */}
      <footer className={`
        bg-white border-t border-gray-200 mt-auto
        ${shouldShowSidebar ? 'lg:ml-64' : ''}
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
