import React from 'react'
import { captureEvent } from '../../services/posthog'

const PhilosophyModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm p-6 sm:p-8 pb-4 flex items-start justify-between border-b border-white/10">
          <div>
            <p className="text-sm font-semibold text-optio-pink uppercase tracking-wider mb-2" style={{ fontFamily: 'Poppins' }}>The Optio Philosophy</p>
            <h2 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              The Process Is The Goal
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white p-1 flex-shrink-0 ml-4"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8">
          <p className="text-lg text-white/80 leading-relaxed mb-8" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            Learning is not about reaching a destination or impressing others. It's about who students become through the journey of discovery, creation, and growth.
          </p>

          {/* SDT Pillars */}
          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            {[
              {
                title: 'Choice',
                subtitle: 'Autonomy',
                desc: 'Students make meaningful decisions about their learning. They choose which quests to pursue, how to demonstrate understanding, and what evidence to share. We never dictate a single path.',
              },
              {
                title: 'Competency',
                subtitle: 'Growth',
                desc: 'Challenges meet students where they are. Tasks stretch them just enough to feel accomplishment without overwhelming them. Progress is based on mastery, not compliance.',
              },
              {
                title: 'Connection',
                subtitle: 'Relatedness',
                desc: 'Learning feels relevant to who students are and who they are becoming. They see themselves in the content. Family and mentors participate. Education becomes a shared experience.',
              },
            ].map((item) => (
              <div key={item.title} className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/10">
                <p className="text-xs font-semibold text-optio-pink uppercase tracking-wider mb-1" style={{ fontFamily: 'Poppins' }}>{item.subtitle}</p>
                <h3 className="text-lg font-bold text-white mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>{item.title}</h3>
                <p className="text-sm text-white/70 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
              </div>
            ))}
          </div>

          {/* SDT explanation */}
          <p className="text-white/60 text-sm leading-relaxed mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            These three pillars come from Self-Determination Theory, decades of research showing that intrinsic motivation flourishes when students have autonomy, feel competent, and connect personally with their learning. When all three align, motivation becomes self-sustaining.
          </p>

          {/* Contrast */}
          <div className="grid sm:grid-cols-2 gap-4 max-w-lg mx-auto">
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-xs text-white/40 mb-1" style={{ fontFamily: 'Poppins' }}>Traditional approach</p>
              <p className="text-sm text-white/50 line-through" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>"This will help you in the future"</p>
            </div>
            <div className="bg-white/5 rounded-lg p-4 border border-optio-pink/30">
              <p className="text-xs text-optio-pink mb-1" style={{ fontFamily: 'Poppins' }}>Optio approach</p>
              <p className="text-sm text-white" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>"This is helping you grow right now"</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PhilosophyModal
