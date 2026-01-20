import React, { forwardRef } from 'react'

const VELA_LOGO_URL = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/homepage/VELA.gif'

const VELASection = forwardRef(({ isVisible = true }, ref) => {
  return (
    <section
      ref={ref}
      className={`py-20 bg-gradient-to-br from-gray-50 to-gray-100 transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
          {/* VELA Logo */}
          <div className="flex-shrink-0">
            <img
              src={VELA_LOGO_URL}
              alt="VELA - Voices for Economic and Educational Liberation Alliance"
              className="h-32 md:h-44 w-auto"
            />
          </div>

          {/* Content */}
          <div className="text-center md:text-left max-w-xl">
            <h2
              className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              VELA Grant Recipient
            </h2>
            <p
              className="text-lg text-gray-600 leading-relaxed"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              Optio is proud to be a VELA grant recipient, supporting our mission to make personalized, accredited education accessible to all learners nationwide.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
})

VELASection.displayName = 'VELASection'

export default VELASection
