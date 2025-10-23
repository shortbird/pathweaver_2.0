import React from 'react'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'

const ConnectionsHeader = ({ returnToQuest, onBackToQuest }) => {
  return (
    <header
      className="bg-gradient-to-r bg-gradient-primary py-8 px-6 sm:py-10 sm:px-8"
      role="banner"
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            Connections
          </h1>
          {returnToQuest && (
            <button
              onClick={onBackToQuest}
              className="flex items-center gap-2 bg-white text-optio-purple px-6 py-3 rounded-full font-semibold shadow-[0_4px_20px_rgba(255,255,255,0.3)] hover:shadow-[0_6px_25px_rgba(255,255,255,0.4)] hover:-translate-y-0.5 transition-all duration-300"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              aria-label="Return to quest"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              Back to Quest
            </button>
          )}
        </div>
        <p className="text-base sm:text-lg text-white/90" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
          Learning is more fun when you do it with others!
        </p>
      </div>
    </header>
  )
}

export default ConnectionsHeader
