import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import { 
  TIER_FEATURES, 
  getTierDisplayName, 
  getTierBadgeColor,
  convertLegacyTier 
} from '../utils/tierMapping'

const SubscriptionPage = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [subscriptionStatus, setSubscriptionStatus] = useState(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [billingPeriod, setBillingPeriod] = useState('monthly')

  const currentTier = convertLegacyTier(user?.subscription_tier) || 'free'

  useEffect(() => {
    fetchSubscriptionStatus()
  }, [])

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await api.get('/subscriptions/status')
      setSubscriptionStatus(response.data)
    } catch (error) {
      console.error('Failed to fetch subscription status:', error)
    } finally {
      setLoadingStatus(false)
    }
  }

  const handleUpgrade = async (tier, period = billingPeriod) => {
    setLoading(true)
    try {
      const response = await api.post('/subscriptions/create-checkout', { 
        tier,
        billing_period: period 
      })
      window.location.href = response.data.checkout_url
    } catch (error) {
      // Check if it's a profile missing error
      if (error.response?.status === 404 && error.response?.data?.error?.includes('profile')) {
        toast.error('User profile not found. Please contact support.')
        console.error('User profile missing:', error.response?.data)
      } else {
        toast.error('Failed to create checkout session. Please try again.')
        console.error('Checkout error:', error)
      }
      setLoading(false)
    }
  }
  

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription? You will retain access until the end of your billing period.')) {
      return
    }

    setCanceling(true)
    try {
      await api.post('/subscriptions/cancel')
      toast.success('Subscription will be cancelled at the end of the billing period')
      await fetchSubscriptionStatus()
    } catch (error) {
      toast.error('Failed to cancel subscription')
    } finally {
      setCanceling(false)
    }
  }

  const handleBillingPortal = async () => {
    setLoading(true)
    try {
      const response = await api.post('/subscriptions/billing-portal')
      window.location.href = response.data.portal_url
    } catch (error) {
      toast.error('Failed to access billing portal')
      setLoading(false)
    }
  }

  return (
    <div className="py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Choose Your Learning Rhythm</h2>
          <p className="text-lg text-gray-700 max-w-3xl mx-auto">
            Start with a diploma. Make it valuable through real work.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Free Plan */}
          <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 hover:shadow-lg transition-shadow flex flex-col">
            <h3 className="text-2xl font-bold mb-2">Free</h3>
            <p className="text-3xl font-bold mb-1">$0</p>
            <p className="text-gray-600 mb-6">Perfect for exploring the platform</p>
            <ul className="space-y-3 mb-8 flex-grow">
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Access quest library</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Track ongoing quests</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Mark tasks complete (no evidence submission)</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-500 line-through">XP earned</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-500 line-through">Optio Portfolio Diploma</span>
              </li>
            </ul>
            {currentTier === 'free' ? (
              <button 
                className="block w-full bg-gray-100 text-gray-700 py-3 px-6 rounded-lg font-semibold cursor-not-allowed text-center"
                disabled
              >
                Current Plan
              </button>
            ) : (
              <Link 
                to="/register" 
                className="block w-full bg-gray-100 text-gray-700 hover:bg-gray-200 py-3 px-6 rounded-lg font-semibold transition-colors text-center"
              >
                Start Free
              </Link>
            )}
          </div>

          {/* Supported Plan */}
          <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 hover:shadow-xl transition-shadow border-2 border-[#ef597b] relative transform scale-105 flex flex-col">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white text-xs px-4 py-1 rounded-full inline-block font-bold">
                RECOMMENDED
              </span>
            </div>
            <h3 className="text-2xl font-bold mb-2">Supported</h3>
            <p className="text-3xl font-bold mb-1">$39.99<span className="text-lg font-normal text-gray-600">/mo</span></p>
            <p className="text-gray-600 mb-6">For dedicated learners ready to grow</p>
            <div className="text-sm font-semibold text-[#ef597b] mb-3">Everything in Free, plus:</div>
            <ul className="space-y-3 mb-8 flex-grow">
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Access to a support team of Optio educators</span>
              </li>
              <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">Unlimited access to all Optio quest features</span>
                </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Team up with other Supported learners for XP bonuses</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700 font-semibold">Optio Portfolio Diploma</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-500 line-through">Traditionally-accredited Diploma</span>
              </li>
            </ul>
            {currentTier === 'supported' ? (
              <div className="space-y-3">
                <button
                  onClick={handleBillingPortal}
                  disabled={loading}
                  className="block w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-3 px-6 rounded-lg font-bold transition-all text-center transform hover:scale-105"
                >
                  {loading ? 'Loading...' : 'Manage Subscription'}
                </button>
                {!subscriptionStatus?.cancel_at_period_end && (
                  <button
                    onClick={handleCancel}
                    disabled={canceling}
                    className="block w-full text-red-600 hover:bg-red-50 py-2 px-6 rounded-lg font-medium transition-all text-center"
                  >
                    {canceling ? 'Canceling...' : 'Cancel Plan'}
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => handleUpgrade('supported', 'monthly')}
                disabled={loading}
                className="block w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-3 px-6 rounded-lg font-bold transition-all text-center transform hover:scale-105"
              >
                {loading ? 'Processing...' : 'Get Supported'}
              </button>
            )}
          </div>

          {/* Academy Plan */}
          <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 hover:shadow-lg transition-shadow relative flex flex-col">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="bg-green-500 text-white text-xs px-4 py-1 rounded-full inline-block font-bold">
                ACCREDITED
              </span>
            </div>
            <h3 className="text-2xl font-bold mb-2">Academy</h3>
            <p className="text-3xl font-bold mb-1">$499.99<span className="text-lg font-normal text-gray-600">/mo</span></p>
            <p className="text-gray-600 mb-6">A personalized private school experience</p>
            <div className="text-sm font-semibold text-[#6d469b] mb-3">Everything in Supported, plus:</div>
            <ul className="space-y-3 mb-8 flex-grow">
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700 font-semibold">TWO diplomas: Optio Portfolio + Accredited HS Diploma</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Personal learning guide & 1-on-1 teacher support</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Regular check-ins with licensed educators</span>
              </li>
              <li className="flex items-start">
                <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Connect with Optio's network of business leaders and mentors</span>
              </li>
            </ul>
            {currentTier === 'academy' ? (
              <div className="space-y-3">
                <button
                  onClick={handleBillingPortal}
                  disabled={loading}
                  className="block w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-3 px-6 rounded-lg font-bold transition-colors text-center"
                >
                  {loading ? 'Loading...' : 'Manage Subscription'}
                </button>
                {!subscriptionStatus?.cancel_at_period_end && (
                  <button
                    onClick={handleCancel}
                    disabled={canceling}
                    className="block w-full text-red-600 hover:bg-red-50 py-2 px-6 rounded-lg font-medium transition-all text-center"
                  >
                    {canceling ? 'Canceling...' : 'Cancel Plan'}
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => handleUpgrade('academy', 'monthly')}
                disabled={loading}
                className="block w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-3 px-6 rounded-lg font-bold transition-colors text-center"
              >
                {loading ? 'Processing...' : 'Join Academy'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SubscriptionPage