import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import api from '../services/api'
import toast from 'react-hot-toast'

const SubscriptionSuccess = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { updateUser, refreshUser, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [subscriptionDetails, setSubscriptionDetails] = useState(null)
  const [manualRefreshAvailable, setManualRefreshAvailable] = useState(false)
  
  useEffect(() => {
    const verifySubscription = async () => {
      try {
        // Get session ID from URL params
        const sessionId = searchParams.get('session_id')

        if (sessionId) {
          // Verify the session and update subscription
          const verifyResponse = await api.post('/api/subscriptions/verify-session', { session_id: sessionId })

          // Set subscription details from verify response
          if (verifyResponse.data.success) {
            const newTier = verifyResponse.data.tier

            setSubscriptionDetails({
              tier: newTier,
              status: verifyResponse.data.status,
              current_period_end: verifyResponse.data.period_end
            })

            // Track subscription conversion for Meta Pixel
            try {
              if (typeof fbq !== 'undefined') {
                // Get subscription value based on tier
                let subscriptionValue = 0;
                switch (newTier) {
                  case 'supported':
                    subscriptionValue = 39.99;
                    break;
                  case 'academy':
                    subscriptionValue = 499.99;
                    break;
                  // Legacy tier mappings
                  case 'creator':
                    subscriptionValue = 39.99; // Maps to supported
                    break;
                  case 'visionary':
                    subscriptionValue = 499.99; // Maps to academy
                    break;
                  default:
                    subscriptionValue = 0;
                }

                fbq('track', 'Subscribe', {
                  content_name: `${newTier} subscription`,
                  value: subscriptionValue,
                  currency: 'USD'
                });
              }
            } catch (error) {
              // Silently fail on tracking errors
            }

            // Poll for subscription tier update instead of optimistic update
            // This avoids race condition where refreshUser fetches stale data
            if (user) {
              let attempts = 0
              const maxAttempts = 10 // 10 attempts over 20 seconds

              const pollForUpdate = async () => {
                try {
                  const success = await refreshUser()

                  if (success) {
                    // Check if the user's tier has been updated
                    const currentUserResponse = await api.get('/api/auth/me')
                    const currentTier = currentUserResponse.data?.subscription_tier

                    if (currentTier === newTier) {
                      // Success! Tier is updated
                      toast.success('Welcome to your new subscription plan!')
                      return
                    }
                  }

                  attempts++
                  if (attempts < maxAttempts) {
                    // Retry after 2 seconds
                    setTimeout(pollForUpdate, 2000)
                  } else {
                    // Max attempts reached, show manual refresh option
                    setManualRefreshAvailable(true)
                  }
                } catch (error) {
                  attempts++
                  if (attempts < maxAttempts) {
                    setTimeout(pollForUpdate, 2000)
                  } else {
                    setManualRefreshAvailable(true)
                  }
                }
              }

              // Start polling
              pollForUpdate()
            }
          }
        } else {
          // No session ID, try to fetch current status if authenticated
          if (user) {
            const response = await api.get('/api/subscriptions/status')
            setSubscriptionDetails(response.data)
          }
        }

      } catch (error) {
        // If authentication error, don't immediately log out - the payment may have succeeded
        if (error.response?.status === 401) {
          // Show a different message that doesn't panic the user
          toast.error('Your payment was processed, but we need you to log in to complete setup.')

          // Set a flag to show manual refresh option instead of auto-redirecting
          setManualRefreshAvailable(true)

          // Don't force navigate to login - let user stay on this page
        } else {
          toast.error('There was an issue verifying your subscription. Please contact support.')
        }
      } finally {
        setLoading(false)
      }
    }

    verifySubscription()
  }, [searchParams, user, refreshUser]) // Run when page loads or URL params change
  
  const handleContinue = () => {
    navigate('/quests')
  }
  
  const handleViewDashboard = () => {
    navigate('/dashboard')
  }

  const handleManualRefresh = async () => {
    setLoading(true)
    setManualRefreshAvailable(false)
    try {
      // Call the force refresh endpoint
      await api.post('/api/subscriptions/refresh-subscription')

      // Use refreshUser to update the AuthContext state
      const refreshSuccess = await refreshUser()

      if (refreshSuccess) {
        // Verify the updated user data
        const userResponse = await api.get('/api/auth/me')
        if (userResponse.data && userResponse.data.subscription_tier !== 'free') {
          toast.success('Subscription status updated successfully!')
        } else {
          toast.error('Unable to update subscription status. Please contact support.')
          setManualRefreshAvailable(true)
        }
      } else {
        toast.error('Failed to refresh user data. Please try again.')
        setManualRefreshAvailable(true)
      }
    } catch (error) {
      toast.error('Failed to refresh subscription status. Please try again.')
      setManualRefreshAvailable(true)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f8b3c5] to-[#b794d6] p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center">
          {/* Success Icon */}
          <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-green-100 mb-6">
            <CheckCircleIcon className="h-12 w-12 text-green-600" />
          </div>
          
          {/* Success Message */}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Payment Successful!
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Your subscription has been activated successfully.
          </p>
          
          {/* Loading State */}
          {loading && (
            <div className="bg-blue-50 rounded-lg p-4 mb-8">
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                <span className="text-blue-700">
                  Verifying your subscription and updating your account...
                </span>
              </div>
            </div>
          )}

          {/* Manual Refresh Option */}
          {manualRefreshAvailable && !loading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
              <h3 className="font-semibold text-blue-900 mb-2">Complete Your Subscription Setup</h3>
              <p className="text-sm text-blue-700 mb-3">
                Your payment was processed successfully! To finish setting up your subscription and access your new features, please log in to your account.
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => navigate('/login')}
                  className="w-full py-2 px-4 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                >
                  Log In to Complete Setup
                </button>
                <button
                  onClick={handleManualRefresh}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* Subscription Details */}
          {!loading && subscriptionDetails && (
            <div className="bg-gray-50 rounded-lg p-4 mb-8">
              <h2 className="font-semibold text-gray-900 mb-2">Subscription Details</h2>
              <div className="text-sm text-gray-600 space-y-1">
                <p>Plan: <span className="font-medium text-gray-900">{subscriptionDetails.tier}</span></p>
                <p>Status: <span className="font-medium text-green-600">Active</span></p>
                {subscriptionDetails.current_period_end && (
                  <p>
                    Next billing date: <span className="font-medium text-gray-900">
                      {new Date(subscriptionDetails.current_period_end * 1000).toLocaleDateString()}
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}
          
          {/* What's Next Section */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
            <h3 className="font-semibold text-blue-900 mb-2">What's Next?</h3>
            <ul className="text-sm text-blue-700 space-y-2 text-left">
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Explore unlimited quests in the Quest Hub</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Submit custom quest ideas for approval</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Track your progress with advanced analytics</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Access priority support when you need help</span>
              </li>
            </ul>
          </div>
          
          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleContinue}
              className="w-full py-3 px-4 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Go to Quest Hub
            </button>
            <button
              onClick={handleViewDashboard}
              className="w-full py-3 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              View Dashboard
            </button>
          </div>
          
          {/* Support Link */}
          <p className="mt-6 text-sm text-gray-500">
            Need help? <a href="mailto:support@optioed.org" className="text-[#ef597b] hover:underline">Contact support</a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default SubscriptionSuccess