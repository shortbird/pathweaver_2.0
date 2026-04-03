import React, { useState } from 'react'
import { RevealSection } from './RevealSection'
import { captureEvent } from '../../services/posthog'
import PhilosophyModal from './PhilosophyModal'

const PhilosophyTeaser = ({ pageName = 'unknown' }) => {
  const [modalOpen, setModalOpen] = useState(false)

  const handleOpen = () => {
    setModalOpen(true)
    captureEvent('marketing_philosophy_opened', { page: pageName })
  }

  return (
    <>
      <section className="py-12 sm:py-16 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
              <div className="flex-1 text-center sm:text-left">
                <p className="text-sm font-semibold text-optio-pink uppercase tracking-wider mb-2" style={{ fontFamily: 'Poppins' }}>Our Philosophy</p>
                <h3 className="text-2xl sm:text-3xl font-bold mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  The Process Is The Goal
                </h3>
                <p className="text-white/70 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  We believe students thrive when education celebrates curiosity and effort today, not just preparation for some future outcome.
                </p>
              </div>
              <button
                onClick={handleOpen}
                className="flex-shrink-0 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-6 py-3 rounded-lg font-semibold transition-all inline-flex items-center gap-2"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                Learn More
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
            </div>
          </RevealSection>
        </div>
      </section>

      <PhilosophyModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}

export default PhilosophyTeaser
