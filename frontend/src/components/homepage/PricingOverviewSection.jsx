import React, { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'

const PricingOverviewSection = forwardRef(({ isVisible = true }, ref) => {
  const freeTierFeatures = [
    'Single student',
    'Unlimited quests',
    'Auto portfolio',
    'AI learning tools',
  ]

  const freeNotIncluded = [
    'Courses',
    'Parent tools',
    'Observer access',
  ]

  const parentPlanFeatures = [
    'Parent tracking tools',
    'Support from Optio teachers',
    'Full platform access',
    'Unlimited quests',
    'Observer invites',
    'Portfolio for all kids',
  ]

  const orgFeatures = [
    'Everything in Parent Plan, plus:',
    'Student management',
    'Custom branding',
    'LTI capabilities',
    'Diploma issuance',
    'Learning analytics',
    'Dedicated support',
  ]

  return (
    <section
      ref={ref}
      className={`py-20 bg-white transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2
            className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Transparent Pricing
          </h2>
          <p
            className="text-lg text-gray-600 max-w-3xl mx-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Start free. Add parent features when you need them. Official credits priced separately.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-12 items-stretch">
          {/* Free Account */}
          <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200 flex flex-col">
            <h3
              className="text-xl font-bold text-gray-900 mb-2"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              Free Account
            </h3>
            <p
              className="text-4xl font-bold text-gray-900 mb-6"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              $0<span className="text-lg text-gray-500 font-normal">/month</span>
            </p>
            <ul className="space-y-3">
              {freeTierFeatures.map((feature, index) => (
                <li key={index} className="flex items-center gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <span
                    className="text-gray-700"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
            <ul className="space-y-3 mt-4 pt-4 border-t border-gray-200 flex-grow">
              {freeNotIncluded.map((feature, index) => (
                <li key={index} className="flex items-center gap-3">
                  <XCircleIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <span
                    className="text-gray-400"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              to="/register"
              className="block w-full text-center bg-white border-2 border-gray-300 text-gray-700 hover:border-optio-purple hover:text-optio-purple px-6 py-3 rounded-lg font-semibold transition-all min-h-[44px] mt-8"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Start Free
            </Link>
          </div>

          {/* Parent Plan */}
          <div className="bg-white rounded-2xl p-8 border-2 border-optio-purple shadow-lg relative flex flex-col">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span
                className="bg-gradient-primary text-white text-sm px-4 py-1 rounded-full"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                Most Popular
              </span>
            </div>
            <h3
              className="text-xl font-bold text-gray-900 mb-2"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              Parent Plan
            </h3>
            <p
              className="text-4xl font-bold text-optio-purple mb-1"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              $39<span className="text-lg text-gray-500 font-normal">/month per kid</span>
            </p>
            <p
              className="text-sm text-gray-500 mb-6"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              or $100/month family (unlimited kids)
            </p>
            <ul className="space-y-3 flex-grow">
              {parentPlanFeatures.map((feature, index) => (
                <li key={index} className="flex items-center gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <span
                    className="text-gray-700"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              to="/register?plan=parent"
              className="block w-full text-center bg-gradient-primary text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all min-h-[44px] mt-8"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Subscribe
            </Link>
          </div>

          {/* Organizations */}
          <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200 flex flex-col">
            <h3
              className="text-xl font-bold text-gray-900 mb-2"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              For Organizations
            </h3>
            <p
              className="text-4xl font-bold text-gray-900 mb-6"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              Custom
            </p>
            {/* Everything in Parent Plan - no checkbox */}
            <p
              className="text-gray-700 font-semibold mb-3"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Everything in Parent Plan, plus:
            </p>
            <ul className="space-y-3 flex-grow">
              {orgFeatures.slice(1).map((feature, index) => (
                <li key={index} className="flex items-center gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <span
                    className="text-gray-700"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              to="/contact?type=sales"
              className="block w-full text-center bg-white border-2 border-gray-300 text-gray-700 hover:border-optio-purple hover:text-optio-purple px-6 py-3 rounded-lg font-semibold transition-all min-h-[44px] mt-8"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Contact Sales
            </Link>
          </div>
        </div>

        {/* Official Credits Add-On */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-2xl p-8 border border-optio-purple/10">
            <h4
              className="text-lg font-bold text-gray-900 mb-4"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              Official Credits (Optional Add-On)
            </h4>
            <p
              className="text-gray-700 mb-4"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              Earn official credits through our accredited partner institutions:
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p
                  className="font-semibold text-gray-900"
                  style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                >
                  High School Credit
                </p>
                <p
                  className="text-2xl font-bold text-optio-purple"
                  style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                >
                  $150<span className="text-sm text-gray-500 font-normal">/credit</span>
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p
                  className="font-semibold text-gray-900"
                  style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                >
                  College Associate Credit
                </p>
                <p
                  className="text-2xl font-bold text-optio-purple"
                  style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                >
                  $250<span className="text-sm text-gray-500 font-normal">/credit</span>
                </p>
              </div>
            </div>
            <p
              className="text-sm text-gray-600 mt-4"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              Credits are earned by completing Optio quests. Student work is reviewed by licensed educators.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
})

PricingOverviewSection.displayName = 'PricingOverviewSection'

export default PricingOverviewSection
