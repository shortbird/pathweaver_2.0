import React from 'react'

const ConnectionsEmptyState = ({ onAddConnection }) => {
  return (
    <div className="text-center py-16 px-4">
      <div className="text-6xl mb-4" role="img" aria-label="Handshake">
        🤝
      </div>

      <h3
        className="text-xl sm:text-2xl font-bold text-[#3B383C] mb-3"
        style={{ fontFamily: 'Poppins', fontWeight: 700 }}
      >
        Your learning community starts here
      </h3>

      <p
        className="text-base text-[#605C61] max-w-md mx-auto mb-6"
        style={{ fontFamily: 'Poppins', fontWeight: 500 }}
      >
        Connect with others who are on their own unique learning journeys. Share discoveries, celebrate progress, and learn alongside each other.
      </p>

      <button
        onClick={onAddConnection}
        className="bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white px-8 py-3 rounded-full font-semibold shadow-[0_4px_20px_rgba(109,70,155,0.15)] hover:shadow-[0_6px_25px_rgba(109,70,155,0.25)] hover:-translate-y-0.5 transition-all duration-300"
        style={{ fontFamily: 'Poppins', fontWeight: 600 }}
      >
        Add Your First Connection
      </button>
    </div>
  )
}

export default ConnectionsEmptyState
