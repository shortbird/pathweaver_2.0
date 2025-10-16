import React from 'react'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'

const ConnectionsHeader = ({ returnToQuest, onBackToQuest }) => {
  return (
    <header
      className="bg-gradient-to-r from-[#F3EFF4] to-[#EEEBEF] py-8 px-6 sm:py-10 sm:px-8"
      role="banner"
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-3xl sm:text-4xl font-bold text-[#3B383C]" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            Connections
          </h1>
          {returnToQuest && (
            <button
              onClick={onBackToQuest}
              className="flex items-center gap-2 bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white px-6 py-3 rounded-full font-semibold shadow-[0_4px_20px_rgba(109,70,155,0.15)] hover:shadow-[0_6px_25px_rgba(109,70,155,0.25)] hover:-translate-y-0.5 transition-all duration-300"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              aria-label="Return to quest"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              Back to Quest
            </button>
          )}
        </div>
        <p className="text-base sm:text-lg text-[#605C61]" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
          Learning partners who celebrate your journey right now
        </p>
      </div>
    </header>
  )
}

export default ConnectionsHeader
