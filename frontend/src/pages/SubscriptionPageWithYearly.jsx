import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import { 
  TIER_FEATURES, 
  getTierDisplayName, 
  formatPrice,
  getTierBadgeColor,
  convertLegacyTier 
} from '../utils/tierMapping'
import { CheckIcon, XIcon } from '@heroicons/react/solid'
import { StarIcon, SparklesIcon } from '@heroicons/react/outline'

const SubscriptionPageWithYearly = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [subscriptionStatus, setSubscriptionStatus] = useState(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [billingPeriod, setBillingPeriod] = useState('monthly') // 'monthly' or 'yearly'

  // Convert legacy tier to new tier for comparison
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
      toast.error('Failed to create checkout session')
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
      await fetchSubscriptionStatus() // Refresh status
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

  // Calculate prices based on billing period
  const getPriceForPeriod = (tier) => {
    if (billingPeriod === 'yearly') {
      return {
        price: tier.yearlyPrice || tier.monthlyPrice * 12,
        period: 'year',
        savings: tier.monthlyPrice * 12 - (tier.yearlyPrice || tier.monthlyPrice * 12)
      }
    }
    return {
      price: tier.monthlyPrice,
      period: 'month',
      savings: 0
    }
  }

  const plans = [
    {
      ...TIER_FEATURES.free,
      tier: 'free',
      current: currentTier === 'free'
    },
    {
      ...TIER_FEATURES.supported,
      tier: 'supported',
      current: currentTier === 'supported'
    },
    {
      ...TIER_FEATURES.academy,
      tier: 'academy',
      current: currentTier === 'academy'
    }
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent mb-4">
          Choose Your Learning Path
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Unlock your full potential with the right subscription. Start free, upgrade anytime.
        </p>
        
        {/* Current Status Badge */}
        {!loadingStatus && subscriptionStatus && (
          <div className="mt-6 inline-flex items-center">
            <span className="text-sm text-gray-500 mr-2">Current Plan:</span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getTierBadgeColor(currentTier)}`}>
              {getTierDisplayName(currentTier)}
            </span>
            {subscriptionStatus.cancel_at_period_end && (
              <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                Cancels at period end
              </span>
            )}
          </div>
        )}
      </div>

      {/* Billing Period Toggle */}
      <div className="flex justify-center mb-8">
        <div className="bg-gray-100 p-1 rounded-lg inline-flex">
          <button
            onClick={() => setBillingPeriod('monthly')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
              billingPeriod === 'monthly'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingPeriod('yearly')}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
              billingPeriod === 'yearly'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className="flex items-center">
              Yearly
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Save 17%
              </span>
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        {plans.map(plan => {
          const pricing = getPriceForPeriod(plan)
          
          return (
            <div
              key={plan.tier}
              className={`relative bg-white rounded-2xl shadow-lg overflow-hidden transform transition-all hover:scale-105 ${
                plan.popular ? 'ring-2 ring-blue-500' : ''
              } ${plan.current ? 'ring-2 ring-green-500' : ''}`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute top-0 right-0 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-1 rounded-bl-lg">
                  <div className="flex items-center space-x-1">
                    <StarIcon className="w-4 h-4" />
                    <span className="text-xs font-semibold">RECOMMENDED</span>
                  </div>
                </div>
              )}

              {/* Current Plan Badge */}
              {plan.current && (
                <div className="absolute top-0 left-0 bg-green-500 text-white px-4 py-1 rounded-br-lg">
                  <span className="text-xs font-semibold">CURRENT PLAN</span>
                </div>
              )}

              {/* Savings Badge for Yearly */}
              {billingPeriod === 'yearly' && pricing.savings > 0 && (
                <div className="absolute top-12 right-4">
                  <div className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center">
                    <SparklesIcon className="w-3 h-3 mr-1" />
                    Save ${pricing.savings.toFixed(0)}
                  </div>
                </div>
              )}

              <div className="p-8">
                {/* Plan Header */}
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h2>
                  <div className="mb-4">
                    <span className="text-4xl font-bold text-gray-900">
                      {plan.price === 0 ? 'Free' : `$${pricing.price.toFixed(2)}`}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-gray-500">/{pricing.period}</span>
                    )}
                  </div>
                  {plan.price > 0 && billingPeriod === 'monthly' && plan.yearlyPrice && (
                    <button
                      onClick={() => setBillingPeriod('yearly')}
                      className="text-sm text-blue-600 hover:text-blue-700 underline"
                    >
                      Save ${(plan.monthlyPrice * 12 - plan.yearlyPrice).toFixed(0)} with yearly billing
                    </button>
                  )}
                  {plan.price > 0 && billingPeriod === 'yearly' && (
                    <p className="text-sm text-green-600 font-medium">
                      {((pricing.savings / (plan.monthlyPrice * 12)) * 100).toFixed(0)}% discount applied
                    </p>
                  )}
                </div>

                {/* Features List */}
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <CheckIcon className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </li>
                  ))}
                  {plan.limitations && plan.limitations.map((limitation, index) => (
                    <li key={`limit-${index}`} className="flex items-start opacity-60">
                      <XIcon className="w-5 h-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600">{limitation}</span>
                    </li>
                  ))}
                </ul>

                {/* Action Button */}
                <div className="mt-auto">
                  {plan.current ? (
                    plan.tier === 'free' ? (
                      <button 
                        className="w-full py-3 px-4 bg-gray-200 text-gray-500 rounded-lg font-medium cursor-not-allowed" 
                        disabled
                      >
                        Current Plan
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <button
                          onClick={handleBillingPortal}
                          disabled={loading}
                          className="w-full py-3 px-4 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {loading ? 'Loading...' : 'Manage Billing'}
                        </button>
                        {!subscriptionStatus?.cancel_at_period_end && (
                          <button
                            onClick={handleCancel}
                            disabled={canceling}
                            className="w-full py-2 px-4 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors disabled:opacity-50"
                          >
                            {canceling ? 'Canceling...' : 'Cancel Subscription'}
                          </button>
                        )}
                      </div>
                    )
                  ) : plan.tier === 'free' ? (
                    <button 
                      className="w-full py-3 px-4 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors" 
                      disabled
                    >
                      No Payment Required
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan.tier, billingPeriod)}
                      disabled={loading}
                      className="w-full py-3 px-4 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {loading ? 'Processing...' : `Upgrade to ${plan.name}`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Proration Notice */}
      {currentTier === 'supported' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
          <h3 className="font-semibold text-blue-900 mb-2">Upgrade to Academy with Proration</h3>
          <p className="text-sm text-blue-700">
            When you upgrade from Supported to Academy, you'll receive a prorated credit for the unused portion of your Supported subscription. 
            This credit will be automatically applied to your Academy subscription, so you only pay the difference.
          </p>
        </div>
      )}

      {/* Billing Portal Access for Existing Customers */}
      {subscriptionStatus?.stripe_customer && (
        <div className="text-center mb-12">
          <button
            onClick={handleBillingPortal}
            disabled={loading}
            className="inline-flex items-center px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Access Billing Portal'}
          </button>
          <p className="mt-2 text-sm text-gray-500">
            View invoices, update payment methods, and manage your subscription
          </p>
        </div>
      )}

      {/* FAQ Section */}
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">How does proration work?</h3>
            <p className="text-gray-600">
              When you upgrade, Stripe automatically credits you for unused time on your current plan. This credit is applied to your new subscription immediately.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Can I switch between monthly and yearly?</h3>
            <p className="text-gray-600">
              Yes! You can switch billing periods anytime through the billing portal. Changes are prorated automatically.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">What happens if I upgrade mid-cycle?</h3>
            <p className="text-gray-600">
              You're only charged for the difference. For example, upgrading from Supported to Academy mid-month means you pay the prorated difference for the remaining days.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Can I get a refund?</h3>
            <p className="text-gray-600">
              We offer a 30-day money-back guarantee for first-time subscribers. Contact support@optioed.org for assistance.
            </p>
          </div>
        </div>
      </div>

      {/* Trust Badges */}
      <div className="mt-12 text-center">
        <p className="text-sm text-gray-500 mb-4">Trusted by educators and learners worldwide</p>
        <div className="flex justify-center items-center space-x-8">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-gray-600">SSL Encrypted</span>
          </div>
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
              <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-gray-600">Secure Payments via Stripe</span>
          </div>
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-gray-600">Cancel Anytime</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SubscriptionPageWithYearly