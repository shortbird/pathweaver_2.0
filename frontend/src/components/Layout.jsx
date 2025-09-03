import React, { useState } from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'

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
    console.log('Layout useEffect - user:', user)
    console.log('Layout useEffect - isAuthenticated:', isAuthenticated)
    if (user?.id && isAuthenticated) {
      fetchPortfolioSlug()
    }
    fetchSiteSettings()
  }, [user, isAuthenticated])

  const fetchPortfolioSlug = async () => {
    try {
      console.log('Fetching portfolio for user ID:', user.id)
      console.log('Full user object:', user)
      const response = await api.get(`/portfolio/user/${user.id}`)
      console.log('Portfolio API response:', response.data)
      
      if (response.data?.diploma?.portfolio_slug) {
        setPortfolioSlug(response.data.diploma.portfolio_slug)
        console.log('Portfolio slug set to:', response.data.diploma.portfolio_slug)
      } else if (response.data?.portfolio_url) {
        // Extract slug from URL if diploma object not present
        const match = response.data.portfolio_url.match(/\/portfolio\/(.+)$/)
        if (match) {
          setPortfolioSlug(match[1])
          console.log('Portfolio slug extracted:', match[1])
        }
      } else {
        console.log('No portfolio slug found in response')
        // Generate a fallback slug based on user ID
        const fallbackSlug = `user${user.id.slice(0, 8)}`
        setPortfolioSlug(fallbackSlug)
        console.log('Using fallback slug:', fallbackSlug)
      }
    } catch (error) {
      console.error('Failed to fetch portfolio slug:', error)
      console.error('Error response data:', error.response?.data)
      console.error('Error status:', error.response?.status)
      if (error.response?.data?.error) {
        console.error('Backend error message:', error.response.data.error)
      }
      // Even on error, set a fallback slug
      if (user?.id) {
        const fallbackSlug = `user${user.id.slice(0, 8)}`
        setPortfolioSlug(fallbackSlug)
        console.log('Using fallback slug on error:', fallbackSlug)
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
      console.error('Failed to fetch site settings:', error)
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
                  className="sm:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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
                    className={`text-xs px-3 py-1 rounded-full font-semibold uppercase tracking-wider transition-all hover:scale-105 ${
                      user?.subscription_tier === 'academy' 
                        ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white shadow-md' 
                        : user?.subscription_tier === 'supported'
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title="Manage subscription"
                  >
                    {user?.subscription_tier === 'free' ? 'Free' : 
                     user?.subscription_tier === 'supported' ? 'Supported' :
                     user?.subscription_tier === 'academy' ? 'Academy' :
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
          <div className="sm:hidden border-t border-gray-200">
            <div className="pt-2 pb-3 space-y-1">
              <Link
                to="/dashboard"
                className="block px-4 py-2 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                to="/quests"
                className="block px-4 py-2 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                Quests
              </Link>
              <Link
                to="/friends"
                className="block px-4 py-2 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                Friends
              </Link>
              <Link
                to="/diploma"
                className="block px-4 py-2 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                My Diploma
              </Link>
              {user?.role === 'admin' && (
                <Link
                  to="/admin"
                  className="block px-4 py-2 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Admin
                </Link>
              )}
              <div className="border-t border-gray-200 mt-2 pt-2">
                <Link
                  to="/subscription"
                  className="block px-4 py-2 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold uppercase ${
                    user?.subscription_tier === 'academy' 
                      ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white' 
                      : user?.subscription_tier === 'supported'
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {user?.subscription_tier === 'free' ? 'Free' : 
                     user?.subscription_tier === 'supported' ? 'Supported' :
                     user?.subscription_tier === 'academy' ? 'Academy' :
                     user?.subscription_tier?.toUpperCase() || 'Free'} Tier
                  </span>
                </Link>
                <Link
                  to="/profile"
                  className="block px-4 py-2 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {user?.first_name} {user?.last_name}
                </Link>
                <button
                  onClick={() => {
                    handleLogout()
                    setMobileMenuOpen(false)
                  }}
                  className="block w-full text-left px-4 py-2 text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
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
    </div>
  )
}

export default Layout