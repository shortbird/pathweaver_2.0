import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useSubscriptionTiers, formatPrice } from '../hooks/useSubscriptionTiers'
import SubscriptionRequestForm from '../components/SubscriptionRequestForm'

const SubscriptionPage = () => {
  const { user } = useAuth()
  const { data: tiers, isLoading: tiersLoading } = useSubscriptionTiers()
  const [selectedTier, setSelectedTier] = useState(null)
  const [showRequestForm, setShowRequestForm] = useState(false)

  const currentTier = user?.subscription_tier || 'Explore'

  const handleRequestUpgrade = (tier) => {
    setSelectedTier(tier)
    setShowRequestForm(true)
  }

  const handleFormClose = () => {
    setShowRequestForm(false)
    setSelectedTier(null)
  }

  const handleFormSuccess = () => {
    // Could add additional success handling here
    // For now, the form handles the toast notification
  }

  return (
    <div className="py-16 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Choose Your Learning Rhythm</h2>
          <p className="text-lg text-gray-700 max-w-3xl mx-auto">
            Select the support level that best fits your educational journey.
          </p>
        </div>

        {tiersLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          <div className="grid md:grid-cols-4 gap-6">
            {tiers?.map((tier) => {
              const isCurrentTier = currentTier === tier.tier_key
              const monthlyPrice = parseFloat(tier.price_monthly)
              const isFree = tier.tier_key === 'Explore'

              return (
                <div
                  key={tier.id}
                  className={`bg-white rounded-xl shadow-sm p-6 hover:shadow-lg transition-shadow flex flex-col relative ${
                    tier.badge_text ? (tier.badge_color === 'gradient' ? 'border-2 border-[#ef597b]' : '') : ''
                  }`}
                >
                  {tier.badge_text && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className={`text-white text-xs px-3 py-1 rounded-full font-bold ${
                        tier.badge_color === 'gradient'
                          ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b]'
                          : tier.badge_color === 'green'
                          ? 'bg-green-500'
                          : 'bg-gray-500'
                      }`}>
                        {tier.badge_text}
                      </span>
                    </div>
                  )}

                  <h3 className="text-2xl font-bold mb-2">{tier.display_name}</h3>

                  <div className="mb-1">
                    <p className="text-3xl font-bold">{formatPrice(monthlyPrice)}<span className="text-base font-normal text-gray-600">/mo</span></p>
                  </div>

                  <p className="text-gray-600 mb-6 text-sm">{tier.description}</p>

                  <ul className="space-y-2 mb-8 flex-grow text-sm">
                    {tier.features?.map((feature, index) => (
                      <li key={index} className="flex items-start">
                        <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className={`text-gray-700 ${feature.includes('Portfolio Diploma') || feature.includes('TWO diplomas') ? 'font-semibold' : ''}`}>
                          {feature}
                        </span>
                      </li>
                    ))}
                    {tier.limitations?.map((limitation, index) => (
                      <li key={`limit-${index}`} className="flex items-start">
                        <svg className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <span className="text-gray-500 line-through text-xs">{limitation}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Action Button */}
                  {isCurrentTier ? (
                    <button className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg font-semibold cursor-not-allowed text-sm" disabled>
                      Current Plan
                    </button>
                  ) : isFree && !user ? (
                    <Link to="/register" className="w-full bg-gray-100 text-gray-700 hover:bg-gray-200 py-2 px-4 rounded-lg font-semibold transition-colors text-center text-sm">
                      Start Free
                    </Link>
                  ) : !user ? (
                    <Link to="/login" className="w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-2 px-4 rounded-lg font-bold transition-all text-center text-sm">
                      Sign In to Upgrade
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleRequestUpgrade(tier)}
                      className="w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-2 px-4 rounded-lg font-bold transition-all text-sm"
                    >
                      Get {tier.display_name}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pricing Note */}
        {!tiersLoading && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Pricing is per student. Contact{' '}
              <a href="mailto:support@optioeducation.com" className="text-purple-600 hover:underline font-semibold">
                support@optioeducation.com
              </a>
              {' '}for information on family or microschool discounts.
            </p>
          </div>
        )}

        {/* Additional Info Section */}
        <div className="mt-16 bg-white rounded-xl shadow-sm p-8 max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold mb-4 text-center">How It Works</h3>
          <div className="space-y-4 text-gray-700">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full flex items-center justify-center text-white font-bold">
                1
              </div>
              <div>
                <h4 className="font-semibold mb-1">Choose Your Tier</h4>
                <p className="text-sm">Select the tier that fits your learning rhythm and goals.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full flex items-center justify-center text-white font-bold">
                2
              </div>
              <div>
                <h4 className="font-semibold mb-1">Submit Your Request</h4>
                <p className="text-sm">Fill out a quick form with your contact preferences.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full flex items-center justify-center text-white font-bold">
                3
              </div>
              <div>
                <h4 className="font-semibold mb-1">Connect with Our Team</h4>
                <p className="text-sm">Our support team will reach out within 24-48 hours to discuss your goals and help you get started.</p>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600 text-center">
              <strong>Questions?</strong> Email{' '}
              <a href="mailto:support@optioeducation.com" className="text-purple-600 hover:underline font-semibold">
                support@optioeducation.com
              </a>
              {' '}- our team reads every message personally.
            </p>
          </div>
        </div>
      </div>

      {/* Subscription Request Form Modal */}
      {showRequestForm && selectedTier && (
        <SubscriptionRequestForm
          tier={selectedTier}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  )
}

export default SubscriptionPage
