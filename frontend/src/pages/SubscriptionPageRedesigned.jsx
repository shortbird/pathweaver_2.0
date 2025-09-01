import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import { 
  TIER_FEATURES, 
  getTierDisplayName, 
  getTierBadgeColor,
  convertLegacyTier 
} from '../utils/tierMapping'
import { CheckIcon, XMarkIcon as XIcon, SparklesIcon } from '@heroicons/react/24/solid'
import { StarIcon, AcademicCapIcon, RocketLaunchIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'

const SubscriptionPageRedesigned = () => {
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
      toast.error('Failed to create checkout session. Please ensure Stripe is configured.')
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

  const getPriceForPeriod = (tier) => {
    if (billingPeriod === 'yearly' && tier.yearlyPrice) {
      return {
        price: tier.yearlyPrice,
        period: 'year',
        savings: tier.yearlySavings || 0
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
      current: currentTier === 'free',
      icon: RocketLaunchIcon,
      gradient: 'from-gray-400 to-gray-600'
    },
    {
      ...TIER_FEATURES.supported,
      tier: 'supported',
      current: currentTier === 'supported',
      icon: StarIcon,
      gradient: 'from-blue-500 to-purple-600'
    },
    {
      ...TIER_FEATURES.academy,
      tier: 'academy',
      current: currentTier === 'academy',
      icon: AcademicCapIcon,
      gradient: 'from-[#ef597b] to-[#6d469b]'
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
              Choose Your Learning Journey
            </span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            From self-directed exploration to accredited diplomas with teacher support. 
            Find the perfect path for your educational goals.
          </p>
          
          {/* Current Plan Badge */}
          {!loadingStatus && subscriptionStatus && (
            <div className="mt-6 inline-flex items-center bg-white rounded-full px-4 py-2 shadow-md">
              <span className="text-sm text-gray-500 mr-2">Your Plan:</span>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getTierBadgeColor(currentTier)}`}>
                {getTierDisplayName(currentTier)}
              </span>
              {subscriptionStatus.cancel_at_period_end && (
                <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                  Canceling at period end
                </span>
              )}
            </div>
          )}
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center mb-12">
          <div className="bg-white p-1.5 rounded-xl shadow-lg inline-flex">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-8 py-3 rounded-lg text-sm font-semibold transition-all ${
                billingPeriod === 'monthly'
                  ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`px-8 py-3 rounded-lg text-sm font-semibold transition-all ${
                billingPeriod === 'yearly'
                  ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="flex items-center gap-2">
                Yearly Billing
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                  SAVE BIG
                </span>
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {plans.map((plan, index) => {
            const pricing = getPriceForPeriod(plan)
            const Icon = plan.icon
            
            return (
              <div
                key={plan.tier}
                className={`relative bg-white rounded-3xl overflow-hidden transform transition-all hover:scale-105 hover:shadow-2xl ${
                  plan.popular ? 'shadow-xl' : 'shadow-lg'
                } ${plan.current ? 'ring-4 ring-green-400 ring-opacity-50' : ''}`}
              >
                {/* Popular/Premium Badge */}
                {plan.popular && (
                  <div className="absolute -top-1 -right-1 z-10">
                    <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-2 rounded-bl-2xl rounded-tr-2xl">
                      <div className="flex items-center gap-1">
                        <StarIcon className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Most Popular</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {plan.premium && (
                  <div className="absolute -top-1 -left-1 z-10">
                    <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-6 py-2 rounded-br-2xl rounded-tl-2xl">
                      <div className="flex items-center gap-1">
                        <AcademicCapIcon className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Accredited</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Gradient Header */}
                <div className={`h-2 bg-gradient-to-r ${plan.gradient}`}></div>

                {/* Card Content */}
                <div className="p-8">
                  {/* Plan Icon & Name */}
                  <div className="text-center mb-6">
                    <div className={`inline-flex p-3 rounded-2xl bg-gradient-to-r ${plan.gradient} bg-opacity-10 mb-4`}>
                      <Icon className={`w-8 h-8 bg-gradient-to-r ${plan.gradient} text-transparent bg-clip-text`} 
                           style={{ stroke: `url(#gradient-${plan.tier})`, fill: 'none' }} />
                      <svg width="0" height="0">
                        <defs>
                          <linearGradient id={`gradient-${plan.tier}`}>
                            <stop offset="0%" stopColor={plan.tier === 'free' ? '#9CA3AF' : plan.tier === 'supported' ? '#3B82F6' : '#ef597b'} />
                            <stop offset="100%" stopColor={plan.tier === 'free' ? '#4B5563' : plan.tier === 'supported' ? '#9333EA' : '#6d469b'} />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">{plan.name}</h2>
                    <p className="text-sm text-gray-600">{plan.description}</p>
                  </div>

                  {/* Pricing */}
                  <div className="text-center mb-6">
                    <div className="mb-2">
                      {plan.price === 0 ? (
                        <span className="text-5xl font-bold text-gray-900">Free</span>
                      ) : (
                        <>
                          <span className="text-5xl font-bold text-gray-900">
                            ${pricing.price.toFixed(0)}
                          </span>
                          <span className="text-gray-500 ml-2">/{pricing.period}</span>
                        </>
                      )}
                    </div>
                    
                    {/* Savings Badge */}
                    {billingPeriod === 'yearly' && pricing.savings > 0 && (
                      <div className="inline-flex items-center gap-2 mt-2">
                        <SparklesIcon className="w-5 h-5 text-green-600" />
                        <span className="text-green-600 font-semibold">
                          Save ${pricing.savings} per year!
                        </span>
                      </div>
                    )}
                    
                    {/* Monthly equivalent for yearly */}
                    {billingPeriod === 'yearly' && plan.price > 0 && (
                      <p className="text-sm text-gray-500 mt-1">
                        Just ${(pricing.price / 12).toFixed(2)}/month
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="space-y-3 mb-8">
                    {plan.features.slice(0, 6).map((feature, idx) => (
                      <li key={idx} className="flex items-start">
                        <CheckIcon className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700">{feature}</span>
                      </li>
                    ))}
                    {plan.features.length > 6 && (
                      <li className="flex items-start">
                        <CheckIcon className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700 font-semibold">
                          +{plan.features.length - 6} more features
                        </span>
                      </li>
                    )}
                    {plan.limitations?.map((limitation, idx) => (
                      <li key={`limit-${idx}`} className="flex items-start opacity-60">
                        <XIcon className="w-5 h-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-500">{limitation}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA Button */}
                  <div className="mt-auto">
                    {plan.current ? (
                      plan.tier === 'free' ? (
                        <button 
                          className="w-full py-4 px-6 bg-gray-100 text-gray-500 rounded-xl font-semibold cursor-not-allowed" 
                          disabled
                        >
                          Current Plan
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <button
                            onClick={handleBillingPortal}
                            disabled={loading}
                            className={`w-full py-4 px-6 bg-gradient-to-r ${plan.gradient} text-white rounded-xl font-semibold hover:opacity-90 transition-all disabled:opacity-50 shadow-lg`}
                          >
                            {loading ? 'Loading...' : 'Manage Subscription'}
                          </button>
                          {!subscriptionStatus?.cancel_at_period_end && (
                            <button
                              onClick={handleCancel}
                              disabled={canceling}
                              className="w-full py-3 px-6 text-red-600 hover:bg-red-50 rounded-xl font-medium transition-all disabled:opacity-50"
                            >
                              {canceling ? 'Canceling...' : 'Cancel Plan'}
                            </button>
                          )}
                        </div>
                      )
                    ) : plan.tier === 'free' ? (
                      <button 
                        className="w-full py-4 px-6 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-all shadow-lg"
                        onClick={() => window.location.href = '/register'}
                      >
                        Start Free
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpgrade(plan.tier, billingPeriod)}
                        disabled={loading}
                        className={`w-full py-4 px-6 bg-gradient-to-r ${plan.gradient} text-white rounded-xl font-semibold hover:opacity-90 transition-all disabled:opacity-50 shadow-lg transform hover:scale-105`}
                      >
                        {loading ? 'Processing...' : plan.buttonText}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Trust Section */}
        <div className="text-center mb-16">
          <h3 className="text-2xl font-bold text-gray-900 mb-8">Why Parents and Students Trust Optio</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <ShieldCheckIcon className="w-12 h-12 text-[#6d469b] mx-auto mb-4" />
              <h4 className="font-semibold text-gray-900 mb-2">Accredited Option</h4>
              <p className="text-sm text-gray-600">
                Academy tier offers fully accredited high school diplomas with teacher support
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <StarIcon className="w-12 h-12 text-[#ef597b] mx-auto mb-4" />
              <h4 className="font-semibold text-gray-900 mb-2">Real-World Learning</h4>
              <p className="text-sm text-gray-600">
                Turn projects, hobbies, and passions into academic credit
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <RocketLaunchIcon className="w-12 h-12 text-blue-600 mx-auto mb-4" />
              <h4 className="font-semibold text-gray-900 mb-2">College Ready</h4>
              <p className="text-sm text-gray-600">
                Build portfolios that showcase actual achievements, not just grades
              </p>
            </div>
          </div>
        </div>

        {/* Proration Notice for Upgrades */}
        {currentTier === 'supported' && (
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-6 mb-8">
            <h3 className="font-bold text-purple-900 mb-2 flex items-center gap-2">
              <SparklesIcon className="w-5 h-5" />
              Upgrade to Academy with Automatic Proration
            </h3>
            <p className="text-sm text-purple-700">
              When you upgrade, we'll automatically credit you for the unused portion of your Supported subscription. 
              You only pay the difference!
            </p>
          </div>
        )}

        {/* FAQ Section */}
        <div className="bg-white rounded-3xl shadow-xl p-10">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Frequently Asked Questions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-bold text-gray-900 mb-3">Is the Academy tier really accredited?</h3>
              <p className="text-gray-600">
                Yes! The Academy tier provides a fully accredited high school diploma through our partner institution, 
                combining self-directed learning with certified teacher support.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-3">Can I switch between monthly and yearly?</h3>
              <p className="text-gray-600">
                Absolutely! You can change your billing period anytime through the billing portal. 
                Changes are prorated automatically.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-3">What if my child needs more structure?</h3>
              <p className="text-gray-600">
                The Academy tier is perfect for this! You get weekly check-ins with certified teachers, 
                personalized learning paths, and parent progress reports.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-3">Do colleges accept Optio diplomas?</h3>
              <p className="text-gray-600">
                Yes! Our portfolios showcase real achievements that colleges love. Academy tier graduates 
                receive accredited diplomas accepted by all universities.
              </p>
            </div>
          </div>
        </div>

        {/* Security Badges */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500 mb-6">Secure payment processing by Stripe</p>
          <div className="flex justify-center items-center gap-8 flex-wrap">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="w-5 h-5 text-green-600" />
              <span className="text-sm text-gray-600">256-bit SSL Encryption</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckIcon className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-gray-600">PCI Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <StarIcon className="w-5 h-5 text-purple-600" />
              <span className="text-sm text-gray-600">30-Day Guarantee</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SubscriptionPageRedesigned