import React from 'react'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'

const ConnectionsHeader = ({ returnToQuest, onBackToQuest }) => {
  return (
    <header
      className="bg-gradient-primary py-12 relative overflow-hidden"
      role="banner"
      aria-label="Connections page header"
    >
      {/* Subtle background elements - match homepage */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-10 left-10 w-24 h-24 border-2 border-white/20 rounded-full"></div>
        <div className="absolute bottom-10 right-10 w-20 h-20 border-2 border-white/20 rounded-full"></div>
        <div className="absolute top-1/2 left-1/3 w-16 h-16 border-2 border-white/10 rounded-full"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Back to Quest button - if needed */}
        {returnToQuest && (
          <div className="mb-6">
            <button
              onClick={onBackToQuest}
              className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border-2 border-white/30 text-white px-6 py-3 rounded-full font-semibold hover:bg-white hover:text-optio-purple transition-all"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              aria-label="Return to quest"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              Back to Quest
            </button>
          </div>
        )}

        {/* Hero Content */}
        <div>
          <h1
            className="text-4xl md:text-5xl font-bold text-white mb-4 drop-shadow-lg"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Your Learning Network
          </h1>
          <p
            className="text-lg md:text-xl text-white/90 max-w-3xl leading-relaxed"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Learning is more powerful when your family and peers are part of the journey. Connect with parents for support and peers for collaboration.
          </p>
        </div>
      </div>
    </header>
  )
}

export default ConnectionsHeader
