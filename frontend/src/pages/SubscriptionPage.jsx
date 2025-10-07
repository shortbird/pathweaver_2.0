import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'

const SubscriptionPage = () => {
  const { user } = useAuth()
  const [loadingTier, setLoadingTier] = useState(null)
  const [canceling, setCanceling] = useState(false)
  const [subscriptionStatus, setSubscriptionStatus] = useState(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [loading, setLoading] = useState(false)
  const [billingPeriod, setBillingPeriod] = useState('monthly')

  const currentTier = user?.subscription_tier || 'Explore'

  useEffect(() => {
    fetchSubscriptionStatus()
  }, [])

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await api.get('/api/subscriptions/status')
      setSubscriptionStatus(response.data)
    } catch (error) {
      console.error('Failed to fetch subscription status:', error)
    } finally {
      setLoadingStatus(false)
    }
  }

  const handleUpgrade = async (tier, period = billingPeriod) => {
    setLoadingTier(tier)
    try {
      const response = await api.post('/api/subscriptions/create-checkout', {
        tier,
        billing_period: period
      })
      window.location.href = response.data.checkout_url
    } catch (error) {
      if (error.response?.status === 404 && error.response?.data?.error?.includes('profile')) {
        toast.error('User profile not found. Please contact support.')
        console.error('User profile missing:', error.response?.data)
      } else {
        toast.error('Failed to create checkout session. Please try again.')
        console.error('Checkout error:', error)
      }
      setLoadingTier(null)
    }
  }

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription? You will retain access until the end of your billing period.')) {
      return
    }

    setCanceling(true)
    try {
      await api.post('/api/subscriptions/cancel', {})
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
      const response = await api.post('/api/subscriptions/billing-portal')
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

          {/* Billing Period Toggle */}
          <div className="flex justify-center mt-8 mb-6">
            <div className="bg-gray-100 p-1 rounded-lg flex">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-6 py-2 rounded-md transition-colors ${
                  billingPeriod === 'monthly'
                    ? 'bg-white text-gray-900 shadow-sm font-medium'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod('yearly')}
                className={`px-6 py-2 rounded-md transition-colors ${
                  billingPeriod === 'yearly'
                    ? 'bg-white text-gray-900 shadow-sm font-medium'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Yearly
                <span className="ml-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  Save 17%
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          {/* Explore (Free) Plan */}
          <div className="bg-white rounded-xl shadow-sm p-6 hover:shadow-lg transition-shadow flex flex-col">
            <h3 className="text-2xl font-bold mb-2">Explore</h3>
            <p className="text-3xl font-bold mb-1">$0</p>
            <p className="text-gray-600 mb-6 text-sm">Perfect for exploring</p>
            <ul className="space-y-2 mb-8 flex-grow text-sm">
              <li className="flex items-start">
                <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Quest library access</span>
              </li>
              <li className="flex items-start">
                <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Track quests</span>
              </li>
              <li className="flex items-start">
                <svg className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-500 line-through text-xs">Earn XP</span>
              </li>
            </ul>
            {currentTier === 'Explore' ? (
              <button className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg font-semibold cursor-not-allowed text-sm" disabled>
                Current Plan
              </button>
            ) : (
              <Link to="/register" className="w-full bg-gray-100 text-gray-700 hover:bg-gray-200 py-2 px-4 rounded-lg font-semibold transition-colors text-center text-sm">
                Start Free
              </Link>
            )}
          </div>

          {/* Accelerate Plan */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow border-2 border-[#ef597b] relative flex flex-col">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white text-xs px-3 py-1 rounded-full font-bold">
                POPULAR
              </span>
            </div>
            <h3 className="text-2xl font-bold mb-2">Accelerate</h3>
            <div className="mb-1">
              {billingPeriod === 'monthly' ? (
                <p className="text-3xl font-bold">$39.99<span className="text-base font-normal text-gray-600">/mo</span></p>
              ) : (
                <div>
                  <p className="text-3xl font-bold">$449.99<span className="text-base font-normal text-gray-600">/yr</span></p>
                  <p className="text-xs text-green-600 font-medium">$37.50/mo • Save $30/yr</p>
                </div>
              )}
            </div>
            <p className="text-gray-600 mb-6 text-sm">For dedicated learners</p>
            <ul className="space-y-2 mb-8 flex-grow text-sm">
              <li className="flex items-start">
                <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Educator support</span>
              </li>
              <li className="flex items-start">
                <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700 font-semibold">Portfolio Diploma</span>
              </li>
              <li className="flex items-start">
                <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Team collaboration</span>
              </li>
            </ul>
            {currentTier === 'Accelerate' ? (
              <div className="space-y-2">
                <button onClick={handleBillingPortal} disabled={loading} className="w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-2 px-4 rounded-lg font-bold transition-all text-sm">
                  {loading ? 'Loading...' : 'Manage'}
                </button>
                {subscriptionStatus?.status !== 'canceling' && (
                  <button onClick={handleCancel} disabled={canceling} className="w-full text-red-600 hover:bg-red-50 py-2 px-4 rounded-lg font-medium transition-all text-xs">
                    {canceling ? 'Canceling...' : 'Cancel'}
                  </button>
                )}
              </div>
            ) : (
              <button onClick={() => handleUpgrade('Accelerate', billingPeriod)} disabled={loadingTier !== null} className="w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-2 px-4 rounded-lg font-bold transition-all text-sm disabled:opacity-75">
                {loadingTier === 'Accelerate' ? 'Processing...' : 'Get Accelerate'}
              </button>
            )}
          </div>

          {/* Achieve Plan */}
          <div className="bg-white rounded-xl shadow-sm p-6 hover:shadow-lg transition-shadow flex flex-col">
            <h3 className="text-2xl font-bold mb-2">Achieve</h3>
            <div className="mb-1">
              {billingPeriod === 'monthly' ? (
                <p className="text-3xl font-bold">$199.99<span className="text-base font-normal text-gray-600">/mo</span></p>
              ) : (
                <div>
                  <p className="text-3xl font-bold">$2,199.99<span className="text-base font-normal text-gray-600">/yr</span></p>
                  <p className="text-xs text-green-600 font-medium">$183.33/mo • Save $200/yr</p>
                </div>
              )}
            </div>
            <p className="text-gray-600 mb-6 text-sm">Advanced learning</p>
            <ul className="space-y-2 mb-8 flex-grow text-sm">
              <li className="flex items-start">
                <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Advanced AI tutor</span>
              </li>
              <li className="flex items-start">
                <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Priority support</span>
              </li>
              <li className="flex items-start">
                <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Custom paths</span>
              </li>
            </ul>
            {currentTier === 'Achieve' ? (
              <div className="space-y-2">
                <button onClick={handleBillingPortal} disabled={loading} className="w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-2 px-4 rounded-lg font-bold transition-all text-sm">
                  {loading ? 'Loading...' : 'Manage'}
                </button>
                {subscriptionStatus?.status !== 'canceling' && (
                  <button onClick={handleCancel} disabled={canceling} className="w-full text-red-600 hover:bg-red-50 py-2 px-4 rounded-lg font-medium transition-all text-xs">
                    {canceling ? 'Canceling...' : 'Cancel'}
                  </button>
                )}
              </div>
            ) : (
              <button onClick={() => handleUpgrade('Achieve', billingPeriod)} disabled={loadingTier !== null} className="w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-2 px-4 rounded-lg font-bold transition-all text-sm disabled:opacity-75">
                {loadingTier === 'Achieve' ? 'Processing...' : 'Get Achieve'}
              </button>
            )}
          </div>

          {/* Excel Plan */}
          <div className="bg-white rounded-xl shadow-sm p-6 hover:shadow-lg transition-shadow relative flex flex-col">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="bg-green-500 text-white text-xs px-3 py-1 rounded-full font-bold">
                ACCREDITED
              </span>
            </div>
            <h3 className="text-2xl font-bold mb-2">Excel</h3>
            <div className="mb-1">
              {billingPeriod === 'monthly' ? (
                <p className="text-3xl font-bold">$499.99<span className="text-base font-normal text-gray-600">/mo</span></p>
              ) : (
                <div>
                  <p className="text-3xl font-bold">$5,499.99<span className="text-base font-normal text-gray-600">/yr</span></p>
                  <p className="text-xs text-green-600 font-medium">$458.33/mo • Save $500/yr</p>
                </div>
              )}
            </div>
            <p className="text-gray-600 mb-6 text-sm">Private school experience</p>
            <ul className="space-y-2 mb-8 flex-grow text-sm">
              <li className="flex items-start">
                <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700 font-semibold">TWO diplomas</span>
              </li>
              <li className="flex items-start">
                <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">1-on-1 mentorship</span>
              </li>
              <li className="flex items-start">
                <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700">Business network</span>
              </li>
            </ul>
            {currentTier === 'Excel' ? (
              <div className="space-y-2">
                <button onClick={handleBillingPortal} disabled={loading} className="w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-2 px-4 rounded-lg font-bold transition-all text-sm">
                  {loading ? 'Loading...' : 'Manage'}
                </button>
                {subscriptionStatus?.status !== 'canceling' && (
                  <button onClick={handleCancel} disabled={canceling} className="w-full text-red-600 hover:bg-red-50 py-2 px-4 rounded-lg font-medium transition-all text-xs">
                    {canceling ? 'Canceling...' : 'Cancel'}
                  </button>
                )}
              </div>
            ) : (
              <button onClick={() => handleUpgrade('Excel', billingPeriod)} disabled={loadingTier !== null} className="w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-2 px-4 rounded-lg font-bold transition-all text-sm disabled:opacity-75">
                {loadingTier === 'Excel' ? 'Processing...' : 'Join Excel'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SubscriptionPage
