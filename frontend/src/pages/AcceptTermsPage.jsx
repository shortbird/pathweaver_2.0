import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'

const AcceptTermsPage = () => {
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tosStatus, setTosStatus] = useState(null)
  const { user, logout, checkTosAcceptance } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    // Check current ToS acceptance status
    checkTosStatus()
  }, [])

  const checkTosStatus = async () => {
    try {
      const response = await api.get('/api/auth/check-tos-acceptance')
      setTosStatus(response.data)
      
      // If they don't need to accept, redirect them
      if (!response.data.needs_acceptance) {
        navigate('/dashboard')
      }
    } catch (error) {
      console.error('Error checking ToS status:', error)
    }
  }

  const handleAccept = async () => {
    if (!acceptedTerms || !acceptedPrivacy) {
      toast.error('You must accept both the Terms of Service and Privacy Policy')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/auth/accept-tos', {
        acceptedTerms,
        acceptedPrivacy
      })
      
      toast.success('Thank you for accepting our terms!')
      
      // Update the ToS acceptance status in AuthContext
      await checkTosAcceptance()
      
      // Redirect to dashboard or wherever they were trying to go
      navigate('/dashboard')
    } catch (error) {
      console.error('Error accepting terms:', error)
      toast.error(error.response?.data?.error || 'Failed to accept terms')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  if (!tosStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Updated Terms
            </h1>
            
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">Action Required</h3>
                  <div className="mt-2 text-sm text-blue-700">
                    {tosStatus.needs_tos && tosStatus.needs_privacy ? (
                      <p>Our Terms of Service and Privacy Policy have been updated. Please review and accept them to continue using Optio Quest.</p>
                    ) : tosStatus.needs_tos ? (
                      <p>Our Terms of Service have been updated. Please review and accept them to continue using Optio Quest.</p>
                    ) : (
                      <p>Our Privacy Policy has been updated. Please review and accept it to continue using Optio Quest.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {user && (
              <p className="text-gray-600 mb-4">
                Logged in as: <span className="font-medium">
                  {user.email || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User'}
                </span>
              </p>
            )}
          </div>

          <div className="space-y-6 mb-8">
            {/* Terms of Service Section */}
            {tosStatus.needs_tos && (
              <div className="border rounded-lg p-6 bg-gray-50">
                <h2 className="text-xl font-semibold mb-4">Terms of Service</h2>
                <p className="text-gray-600 mb-4">
                  Version {tosStatus.current_tos_version} - Please review our updated Terms of Service
                </p>
                <div className="mb-4">
                  <Link 
                    to="/terms" 
                    target="_blank" 
                    className="inline-flex items-center text-primary hover:text-purple-600 font-medium"
                  >
                    Read Full Terms of Service
                    <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </Link>
                </div>
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="acceptTerms"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label htmlFor="acceptTerms" className="ml-2 text-sm text-gray-700">
                    I have read and agree to the Terms of Service (Version {tosStatus.current_tos_version})
                  </label>
                </div>
              </div>
            )}

            {/* Privacy Policy Section */}
            {tosStatus.needs_privacy && (
              <div className="border rounded-lg p-6 bg-gray-50">
                <h2 className="text-xl font-semibold mb-4">Privacy Policy</h2>
                <p className="text-gray-600 mb-4">
                  Version {tosStatus.current_privacy_version} - Please review our updated Privacy Policy
                </p>
                <div className="mb-4">
                  <Link 
                    to="/privacy" 
                    target="_blank" 
                    className="inline-flex items-center text-primary hover:text-purple-600 font-medium"
                  >
                    Read Full Privacy Policy
                    <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </Link>
                </div>
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="acceptPrivacy"
                    checked={acceptedPrivacy}
                    onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                    className="mt-1 h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label htmlFor="acceptPrivacy" className="ml-2 text-sm text-gray-700">
                    I have read and agree to the Privacy Policy (Version {tosStatus.current_privacy_version})
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* What happens if you don't accept */}
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-8">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">Note</h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>If you choose not to accept the updated terms, you will not be able to access Optio Quest features. You can log out and return when you're ready to accept the terms.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-between">
            <button
              onClick={handleLogout}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Log Out
            </button>
            
            <button
              onClick={handleAccept}
              disabled={loading || (!acceptedTerms && tosStatus.needs_tos) || (!acceptedPrivacy && tosStatus.needs_privacy)}
              className="px-6 py-2 bg-primary text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Processing...' : 'Accept and Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AcceptTermsPage