import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import Sidebar from './navigation/Sidebar'
import TopNavbar from './navigation/TopNavbar'

const Layout = () => {
  const { user, isAuthenticated } = useAuth()
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

  return (
    <div className="min-h-screen bg-[#F3EFF4]">
      {/* Top Navbar */}
      <TopNavbar
        onMenuClick={() => setSidebarOpen(true)}
        siteSettings={siteSettings}
      />

      {/* Sidebar (authenticated users only) */}
      {isAuthenticated && (
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main className={`
        pt-16
        ${isAuthenticated ? 'lg:ml-64' : ''}
        min-h-[calc(100vh-4rem)]
      `}>
        <Outlet />
      </main>

      {/* Footer */}
      <footer className={`
        bg-white border-t border-gray-200 mt-auto
        ${isAuthenticated ? 'lg:ml-64' : ''}
      `}>
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-[#605C61] font-poppins font-medium">
            © 2025 Optio. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default Layout
