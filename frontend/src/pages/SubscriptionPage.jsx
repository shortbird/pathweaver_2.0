import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import { getTierDisplayName } from '../utils/tierMapping'

const SubscriptionPage = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [canceling, setCanceling] = useState(false)

  const handleUpgrade = async (tier) => {
    setLoading(true)
    try {
      const response = await api.post('/subscriptions/create-checkout', { tier })
      window.location.href = response.data.checkout_url
    } catch (error) {
      toast.error('Failed to create checkout session')
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription?')) {
      return
    }

    setCanceling(true)
    try {
      await api.post('/subscriptions/cancel')
      toast.success('Subscription will be cancelled at the end of the billing period')
    } catch (error) {
      toast.error('Failed to cancel subscription')
    } finally {
      setCanceling(false)
    }
  }

  const plans = [
    {
      tier: 'explorer',
      name: 'Free',
      price: 'Free',
      description: 'Perfect for enrichment and personal growth',
      features: [
        'Access to quest library',
        'Track personal progress',
        'Join the community',
        'Basic progress dashboard'
      ],
      current: user?.subscription_tier === 'explorer'
    },
    {
      tier: 'creator',
      name: 'Supported',
      price: '$10/month',
      description: 'For serious learners seeking credit',
      features: [
        'Everything in Free tier',
        'Official credit banking',
        'Transcript generation',
        'Community XP bonuses',
        'Priority support',
        'Advanced analytics'
      ],
      current: user?.subscription_tier === 'creator',
      popular: true
    },
    {
      tier: 'visionary',
      name: 'Academy',
      price: '$25/month',
      description: 'Complete educational solution',
      features: [
        'Everything in Supported tier',
        'Dedicated educator support',
        'Personalized learning plan',
        'Priority review',
        'Custom quest creation',
        'Family account management'
      ],
      current: user?.subscription_tier === 'visionary'
    }
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Choose Your Learning Path</h1>
        <p className="text-xl text-gray-600">
          Unlock your full potential with the right subscription
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        {plans.map(plan => (
          <div
            key={plan.tier}
            className={`card relative ${plan.popular ? 'border-2 border-primary' : ''} ${
              plan.current ? 'bg-gray-50' : ''
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-primary text-white text-xs px-3 py-1 rounded-full">
                  MOST POPULAR
                </span>
              </div>
            )}

            {plan.current && (
              <div className="absolute -top-3 right-4">
                <span className="bg-green-600 text-white text-xs px-3 py-1 rounded-full">
                  CURRENT PLAN
                </span>
              </div>
            )}

            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-2">{plan.name}</h2>
              <p className="text-3xl font-bold text-primary mb-2">{plan.price}</p>
              <p className="text-gray-600 text-sm">{plan.description}</p>
            </div>

            <ul className="space-y-3 mb-8">
              {plan.features.map((feature, index) => (
                <li key={index} className="flex items-start">
                  <svg
                    className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <div className="mt-auto">
              {plan.current ? (
                plan.tier === 'explorer' ? (
                  <button className="w-full btn-primary opacity-50 cursor-not-allowed" disabled>
                    Current Plan
                  </button>
                ) : (
                  <button
                    onClick={handleCancel}
                    disabled={canceling}
                    className="w-full bg-red-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    {canceling ? 'Canceling...' : 'Cancel Subscription'}
                  </button>
                )
              ) : plan.tier === 'explorer' ? (
                <button className="w-full btn-primary opacity-50 cursor-not-allowed" disabled>
                  Free Plan
                </button>
              ) : (
                <button
                  onClick={() => handleUpgrade(plan.tier)}
                  disabled={loading}
                  className="w-full btn-primary disabled:opacity-50"
                >
                  {loading ? 'Processing...' : `Upgrade to ${plan.name}`}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-1">Can I change my plan anytime?</h3>
            <p className="text-gray-600">
              Yes! You can upgrade or downgrade your subscription at any time. Changes take effect immediately.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">What payment methods do you accept?</h3>
            <p className="text-gray-600">
              We accept all major credit cards and debit cards through our secure payment processor, Stripe.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">Is my data safe?</h3>
            <p className="text-gray-600">
              Absolutely! We use industry-standard encryption and security measures to protect your data.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">Can I get a refund?</h3>
            <p className="text-gray-600">
              We offer a 30-day money-back guarantee for first-time subscribers. Contact support for assistance.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SubscriptionPage