import React from 'react'

const ActivityEmptyState = ({ onAddConnection }) => {
  return (
    <div className="text-center py-16 px-4">
      <div className="text-6xl mb-4" role="img" aria-label="Growing plant">
        🌱
      </div>

      <h3
        className="text-xl sm:text-2xl font-bold text-neutral-700 mb-3"
        style={{ fontFamily: 'Poppins', fontWeight: 700 }}
      >
        Your learning community is taking shape
      </h3>

      <p
        className="text-base text-neutral-500 max-w-md mx-auto mb-6"
        style={{ fontFamily: 'Poppins', fontWeight: 500 }}
      >
        Connect with others to see what they're discovering and share encouragement on their learning journeys
      </p>

      <button
        onClick={onAddConnection}
        className="bg-gradient-to-r bg-gradient-primary text-white px-8 py-3 rounded-full font-semibold shadow-[0_4px_20px_rgba(109,70,155,0.15)] hover:shadow-[0_6px_25px_rgba(109,70,155,0.25)] hover:-translate-y-0.5 transition-all duration-300"
        style={{ fontFamily: 'Poppins', fontWeight: 600 }}
      >
        Connect with Learning Partners
      </button>
    </div>
  )
}

export default ActivityEmptyState
