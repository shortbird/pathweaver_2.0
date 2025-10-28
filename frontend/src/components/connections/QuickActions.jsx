import React from 'react'
import { UserGroupIcon, UsersIcon } from '@heroicons/react/24/outline'

const QuickActions = ({ onInviteParent, onConnectPartner }) => {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Connect with Parents Card */}
        <div
          className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-8 border-2 border-purple-100 hover:border-purple-300 hover:shadow-lg transition-all cursor-pointer group"
          onClick={onInviteParent}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onInviteParent()
            }
          }}
          aria-label="Connect with parents and family"
        >
          <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <UserGroupIcon className="w-8 h-8 text-white" />
          </div>
          <h2
            className="text-2xl font-bold text-gray-900 mb-3"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Connect with Parents
          </h2>
          <p
            className="text-gray-700 mb-6 leading-relaxed"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Give your parents or guardians access to view your progress, celebrate your wins, and support your journey.
          </p>
          <button
            className="bg-gradient-primary text-white px-6 py-3 rounded-full font-semibold shadow-md hover:shadow-lg transition-all"
            style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            onClick={(e) => {
              e.stopPropagation()
              onInviteParent()
            }}
          >
            Invite a Parent
          </button>
        </div>

        {/* Find Learning Partners Card */}
        <div
          className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-8 border-2 border-purple-100 hover:border-purple-300 hover:shadow-lg transition-all cursor-pointer group"
          onClick={onConnectPartner}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onConnectPartner()
            }
          }}
          aria-label="Find learning partners"
        >
          <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <UsersIcon className="w-8 h-8 text-white" />
          </div>
          <h2
            className="text-2xl font-bold text-gray-900 mb-3"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Find Learning Partners
          </h2>
          <p
            className="text-gray-700 mb-6 leading-relaxed"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Connect with other learners who share your interests. See what they're exploring and celebrate each other's progress.
          </p>
          <button
            className="bg-gradient-primary text-white px-6 py-3 rounded-full font-semibold shadow-md hover:shadow-lg transition-all"
            style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            onClick={(e) => {
              e.stopPropagation()
              onConnectPartner()
            }}
          >
            Connect with Partner
          </button>
        </div>
      </div>
    </section>
  )
}

export default QuickActions
