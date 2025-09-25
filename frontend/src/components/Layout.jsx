import React, { useState } from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import { hasFeatureAccess } from '../utils/tierMapping'
import TutorWidget from './tutor/TutorWidget'

const Layout = () => {
  const { user, logout, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [portfolioSlug, setPortfolioSlug] = React.useState(null)
  const [siteSettings, setSiteSettings] = React.useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
  }

  React.useEffect(() => {
    if (user?.id && isAuthenticated && hasFeatureAccess(user?.subscription_tier, 'supported')) {
      fetchPortfolioSlug()
    }
    fetchSiteSettings()
  }, [user, isAuthenticated])

  const fetchPortfolioSlug = async () => {
    try {
      const response = await api.get(`/api/portfolio/user/${user.id}`)
      
      if (response.data?.diploma?.portfolio_slug) {
        setPortfolioSlug(response.data.diploma.portfolio_slug)
      } else if (response.data?.portfolio_url) {
        // Extract slug from URL if diploma object not present
        const match = response.data.portfolio_url.match(/\/portfolio\/(.+)$/)
        if (match) {
          setPortfolioSlug(match[1])
        }
      } else {
        // Generate a fallback slug based on user ID
        const fallbackSlug = `user${user.id.slice(0, 8)}`
        setPortfolioSlug(fallbackSlug)
      }
    } catch (error) {
      // Even on error, set a fallback slug
      if (user?.id) {
        const fallbackSlug = `user${user.id.slice(0, 8)}`
        setPortfolioSlug(fallbackSlug)
      }
    }
  }

  const fetchSiteSettings = async () => {
    try {
      const response = await api.get('/api/settings')
      if (response.data) {
        setSiteSettings(response.data)
      }
    } catch (error) {
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <Link to="/" className="flex items-center">
                {siteSettings?.logo_url ? (
                  <img 
                    src={siteSettings.logo_url} 
                    alt={siteSettings.site_name || "Optio"}
                    className="h-8 w-auto"
                  />
                ) : (
                  <span className="text-2xl font-bold bg-gradient-to-r from-coral to-primary bg-clip-text text-transparent">{siteSettings?.site_name || "Optio"}</span>
                )}
              </Link>
              
              {isAuthenticated && (
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center px-1 pt-1 text-sm font-medium text-text-secondary hover:text-primary transition-colors"
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/quests"
                    className="inline-flex items-center px-1 pt-1 text-sm font-medium text-text-secondary hover:text-primary transition-colors"
                  >
                    Quests
                  </Link>
                  <Link
                    to="/friends"
                    className="inline-flex items-center px-1 pt-1 text-sm font-medium text-text-secondary hover:text-primary transition-colors"
                  >
                    Friends
                  </Link>
                  <Link
                    to="/diploma"
                    className="inline-flex items-center px-1 pt-1 text-sm font-medium text-text-secondary hover:text-primary transition-colors"
                  >
                    My Diploma
                  </Link>
                  {user?.role === 'admin' && (
                    <Link
                      to="/admin"
                      className="inline-flex items-center px-1 pt-1 text-sm font-medium text-text-secondary hover:text-primary transition-colors"
                    >
                      Admin
                    </Link>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center">
              {/* Mobile menu button */}
              {isAuthenticated && (
                <button
                  className="sm:hidden p-3 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation transition-colors"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label={mobileMenuOpen ? "Close mobile menu" : "Open mobile menu"}
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {mobileMenuOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              )}
              
              {isAuthenticated ? (
                <div className="hidden sm:flex items-center space-x-4">
                  <Link
                    to="/profile"
                    className="text-sm font-medium text-text-secondary hover:text-primary transition-colors"
                  >
                    {user?.first_name} {user?.last_name}
                  </Link>
                  <Link
                    to="/subscription"
                    className={`text-xs px-3 py-1 rounded-full font-semibold uppercase tracking-wider cursor-pointer hover:opacity-80 transition-opacity ${
                      user?.subscription_tier === 'academy' || user?.subscription_tier === 'enterprise'
                        ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white shadow-md'
                        : user?.subscription_tier === 'supported' || user?.subscription_tier === 'creator' || user?.subscription_tier === 'premium'
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                    title="Click to manage subscription"
                  >
                    {user?.subscription_tier === 'free' || user?.subscription_tier === 'explorer' ? 'Free' :
                     user?.subscription_tier === 'supported' || user?.subscription_tier === 'creator' || user?.subscription_tier === 'premium' ? 'Supported' :
                     user?.subscription_tier === 'academy' || user?.subscription_tier === 'enterprise' ? 'Academy' :
                     user?.subscription_tier?.toUpperCase() || 'Free'}
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="text-sm font-medium text-text-secondary hover:text-primary transition-colors"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-4">
                  <Link
                    to="/login"
                    className="text-sm font-medium text-text-secondary hover:text-primary transition-colors"
                  >
                    Login
                  </Link>
                  <Link
                    to="/register"
                    className="bg-gradient-primary text-white px-6 py-2 rounded-[30px] text-sm font-semibold shadow-[0_2px_10px_rgba(239,89,123,0.15)] hover:shadow-[0_4px_15px_rgba(239,89,123,0.25)] hover:-translate-y-0.5 transition-all duration-300"
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Mobile menu dropdown */}
        {isAuthenticated && mobileMenuOpen && (
          <div className="sm:hidden border-t border-gray-200 animate-fade-in">
            <div className="pt-2 pb-3 space-y-1">
              <Link
                to="/dashboard"
                className="block px-6 py-4 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 min-h-[44px] flex items-center touch-manipulation transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                to="/quests"
                className="block px-6 py-4 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 min-h-[44px] flex items-center touch-manipulation transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Quests
              </Link>
              <Link
                to="/friends"
                className="block px-6 py-4 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 min-h-[44px] flex items-center touch-manipulation transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Friends
              </Link>
              <Link
                to="/diploma"
                className="block px-6 py-4 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 min-h-[44px] flex items-center touch-manipulation transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                My Diploma
              </Link>
              {user?.role === 'admin' && (
                <Link
                  to="/admin"
                  className="block px-6 py-4 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 min-h-[44px] flex items-center touch-manipulation transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Admin
                </Link>
              )}
              <div className="border-t border-gray-200 mt-2 pt-2">
                <Link
                  to="/subscription"
                  className="block px-6 py-4 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 min-h-[44px] flex items-center touch-manipulation transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold uppercase ${
                    user?.subscription_tier === 'academy' || user?.subscription_tier === 'enterprise'
                      ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white'
                      : user?.subscription_tier === 'supported' || user?.subscription_tier === 'creator' || user?.subscription_tier === 'premium'
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {user?.subscription_tier === 'free' || user?.subscription_tier === 'explorer' ? 'Free' :
                     user?.subscription_tier === 'supported' || user?.subscription_tier === 'creator' || user?.subscription_tier === 'premium' ? 'Supported' :
                     user?.subscription_tier === 'academy' || user?.subscription_tier === 'enterprise' ? 'Academy' :
                     user?.subscription_tier?.toUpperCase() || 'Free'} Tier
                  </span>
                </Link>
                <Link
                  to="/profile"
                  className="block px-6 py-4 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 min-h-[44px] flex items-center touch-manipulation transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {user?.first_name} {user?.last_name}
                </Link>
                <button
                  onClick={() => {
                    handleLogout()
                    setMobileMenuOpen(false)
                  }}
                  className="block w-full text-left px-6 py-4 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 min-h-[44px] flex items-center touch-manipulation transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>
      
      <main className="flex-1">
        <Outlet />
      </main>
      
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-text-muted">
            © 2025 Optio. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Global OptioBot - Float over all authenticated pages */}
      {isAuthenticated && (
        <TutorWidget
          position="bottom-right"
        />
      )}
    </div>
  )
}

export default Layout