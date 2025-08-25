import React from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const Layout = () => {
  const { user, logout, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-white shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <Link to="/" className="flex items-center">
                <span className="text-2xl font-bold text-primary">Optio Quest</span>
              </Link>
              
              {isAuthenticated && (
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-primary"
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/quests"
                    className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-primary"
                  >
                    Quests
                  </Link>
                  <Link
                    to="/friends"
                    className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-primary"
                  >
                    Friends
                  </Link>
                  {user?.role === 'admin' && (
                    <Link
                      to="/admin"
                      className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-primary"
                    >
                      Admin
                    </Link>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center">
              {isAuthenticated ? (
                <div className="flex items-center space-x-4">
                  <Link
                    to="/profile"
                    className="text-sm font-medium text-gray-900 hover:text-primary"
                  >
                    {user?.first_name} {user?.last_name}
                  </Link>
                  <span className="text-xs bg-secondary text-text px-2 py-1 rounded-full">
                    {user?.subscription_tier?.toUpperCase()}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="text-sm font-medium text-gray-900 hover:text-primary"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-4">
                  <Link
                    to="/login"
                    className="text-sm font-medium text-gray-900 hover:text-primary"
                  >
                    Login
                  </Link>
                  <Link
                    to="/register"
                    className="btn-primary text-sm"
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
      
      <main className="flex-1">
        <Outlet />
      </main>
      
      <footer className="bg-white border-t border-border mt-auto">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500">
            © 2025 Optio Quest. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default Layout