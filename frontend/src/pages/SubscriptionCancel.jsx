import React from 'react'
import { useNavigate } from 'react-router-dom'
import { XCircleIcon } from '@heroicons/react/solid'

const SubscriptionCancel = () => {
  const navigate = useNavigate()
  
  const handleReturnToSubscriptions = () => {
    navigate('/subscription')
  }
  
  const handleContactSupport = () => {
    window.location.href = 'mailto:support@optioed.org?subject=Subscription%20Payment%20Issue'
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center">
          {/* Cancel Icon */}
          <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-red-100 mb-6">
            <XCircleIcon className="h-12 w-12 text-red-600" />
          </div>
          
          {/* Cancel Message */}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Payment Cancelled
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Your payment was cancelled and you have not been charged.
          </p>
          
          {/* Reasons Section */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
            <h3 className="font-semibold text-yellow-900 mb-2">Common reasons for cancellation:</h3>
            <ul className="text-sm text-yellow-700 space-y-2 text-left">
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>You changed your mind about upgrading</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>You want to review the features again</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>You encountered an issue during checkout</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>You need to update your payment method</span>
              </li>
            </ul>
          </div>
          
          {/* Free Tier Benefits */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
            <h3 className="font-semibold text-blue-900 mb-2">Remember: You still have access to:</h3>
            <ul className="text-sm text-blue-700 space-y-1 text-left">
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>5 basic quests</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Public diploma page</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Community support</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Learning progress tracking</span>
              </li>
            </ul>
          </div>
          
          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleReturnToSubscriptions}
              className="w-full py-3 px-4 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              View Subscription Plans
            </button>
            <button
              onClick={handleContactSupport}
              className="w-full py-3 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Contact Support
            </button>
          </div>
          
          {/* Help Text */}
          <p className="mt-6 text-sm text-gray-500">
            Had an issue? We're here to help!<br />
            <a href="mailto:support@optioed.org" className="text-[#ef597b] hover:underline">support@optioed.org</a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default SubscriptionCancel