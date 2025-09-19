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
  const [retryCount, setRetryCount] = useState(0)
  const [manualRefreshAvailable, setManualRefreshAvailable] = useState(false)

  // Exponential backoff delays: 2s, 4s, 8s, 16s, 32s
  const retryDelays = [2000, 4000, 8000, 16000, 32000]
  const maxRetries = 5
  
  useEffect(() => {
    const verifySubscription = async () => {
      try {
        // Get session ID from URL params
        const sessionId = searchParams.get('session_id')
        
        if (sessionId) {
          // Verify the session and update subscription
          const verifyResponse = await api.post('/api/subscriptions/verify-session', { session_id: sessionId })
          console.log('Verification response:', verifyResponse.data)
          
          // Set subscription details from verify response
          if (verifyResponse.data.success) {
            setSubscriptionDetails({
              tier: verifyResponse.data.tier,
              status: verifyResponse.data.status,
              current_period_end: verifyResponse.data.period_end
            })
            
            // Track subscription conversion for Meta Pixel
            try {
              if (typeof fbq !== 'undefined') {
                // Get subscription value based on tier
                let subscriptionValue = 0;
                switch (verifyResponse.data.tier) {
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
                  content_name: `${verifyResponse.data.tier} subscription`,
                  value: subscriptionValue,
                  currency: 'USD'
                });
              }
            } catch (error) {
              console.error('Meta Pixel tracking error:', error);
            }
            
            // Update user data with new subscription tier if user is authenticated
            if (user && updateUser) {
              // First, immediately update with the verified tier from Stripe
              updateUser({
                ...user,
                subscription_tier: verifyResponse.data.tier,
                subscription_status: verifyResponse.data.status || 'active'
              })

              // Add a small delay to allow database propagation, then verify
              setTimeout(async () => {
                try {
                  // Use refreshUser to get fresh data from the backend
                  const refreshSuccess = await refreshUser()

                  if (refreshSuccess) {
                    // Get the updated user data to verify the tier
                    const userResponse = await api.get('/api/auth/me')
                    if (userResponse.data) {
                      // Check if the tier matches what we expect from verification
                      const expectedTier = verifyResponse.data.tier
                      const actualTier = userResponse.data.subscription_tier

                      if (actualTier === expectedTier) {
                        console.log(`✅ Tier update successful: ${actualTier}`)
                        // Success! The refreshUser call should have updated the header nav
                        return
                      } else if (actualTier === 'free' && retryCount < maxRetries) {
                        const delay = retryDelays[retryCount] || 32000
                        console.log(`Tier mismatch. Expected: ${expectedTier}, Got: ${actualTier}. Retrying in ${delay/1000}s (attempt ${retryCount + 1}/${maxRetries})`)
                        setTimeout(() => {
                          setRetryCount(prev => prev + 1)
                          setLoading(true)
                        }, delay)
                        return
                      } else if (retryCount >= maxRetries) {
                        // Max retries reached, show manual refresh option
                        console.log('Max retries reached, enabling manual refresh option')
                        setManualRefreshAvailable(true)
                      }
                    }
                  } else {
                    console.log('refreshUser failed, falling back to manual update')
                    // Fallback: try manual update if refreshUser fails
                    const userResponse = await api.get('/api/auth/me')
                    if (userResponse.data) {
                      updateUser(userResponse.data)
                    }
                  }
                } catch (error) {
                  console.log('Could not fetch fresh user data:', error)
                  // If we can't fetch user data, still show the verified tier from Stripe
                  console.log('Using verified tier from Stripe response:', verifyResponse.data.tier)
                }
              }, 1000) // 1 second delay to allow database sync
            }
            
            toast.success('Welcome to your new subscription plan!')
          }
        } else {
          // No session ID, try to fetch current status if authenticated
          if (user) {
            const response = await api.get('/api/subscriptions/status')
            setSubscriptionDetails(response.data)
          }
        }
        
      } catch (error) {
        console.error('Error verifying subscription:', error)
        
        // If authentication error, user might need to log in
        if (error.response?.status === 401) {
          toast.error('Please log in to complete your subscription setup.')
          setTimeout(() => navigate('/login'), 2000)
        } else {
          toast.error('There was an issue verifying your subscription. Please contact support.')
        }
      } finally {
        setLoading(false)
      }
    }
    
    verifySubscription()
  }, [searchParams, retryCount]) // Include retryCount to trigger re-verification
  
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
      console.error('Manual refresh failed:', error)
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
                  {retryCount === 0
                    ? 'Verifying your subscription...'
                    : `Confirming subscription update... (attempt ${retryCount}/${maxRetries})`
                  }
                </span>
              </div>
              {retryCount > 2 && (
                <p className="text-xs text-blue-600 mt-2 text-center">
                  This is taking longer than expected. We're working to sync your subscription status.
                </p>
              )}
            </div>
          )}

          {/* Manual Refresh Option */}
          {manualRefreshAvailable && !loading && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
              <h3 className="font-semibold text-yellow-900 mb-2">Subscription Update Pending</h3>
              <p className="text-sm text-yellow-700 mb-3">
                Your payment was successful, but we're having trouble updating your subscription status.
                This sometimes happens and will resolve automatically within a few minutes.
              </p>
              <button
                onClick={handleManualRefresh}
                className="w-full py-2 px-4 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700 transition-colors"
              >
                Try Again
              </button>
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