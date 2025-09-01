import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import api from '../services/api'
import toast from 'react-hot-toast'

const SubscriptionSuccess = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { updateUser, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [subscriptionDetails, setSubscriptionDetails] = useState(null)
  
  useEffect(() => {
    const verifySubscription = async () => {
      try {
        // Get session ID from URL params
        const sessionId = searchParams.get('session_id')
        
        if (sessionId) {
          // Verify the session and update subscription
          await api.post('/subscriptions/verify-session', { session_id: sessionId })
        }
        
        // Fetch updated subscription status
        const response = await api.get('/subscriptions/status')
        setSubscriptionDetails(response.data)
        
        // Update user data with new subscription tier
        if (response.data.tier) {
          updateUser({
            ...user,
            subscription_tier: response.data.tier,
            subscription_status: response.data.status || 'active'
          })
        }
        
        toast.success('Welcome to your new subscription plan!')
      } catch (error) {
        console.error('Error verifying subscription:', error)
        toast.error('There was an issue verifying your subscription. Please contact support.')
      } finally {
        setLoading(false)
      }
    }
    
    verifySubscription()
  }, [searchParams]) // Removed updateUser and user to prevent infinite loop
  
  const handleContinue = () => {
    navigate('/quest-hub')
  }
  
  const handleViewDashboard = () => {
    navigate('/dashboard')
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