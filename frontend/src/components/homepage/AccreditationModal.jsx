import React from 'react'
import { createPortal } from 'react-dom'
import { XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline'

const AccreditationModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null

  const diplomaFeatures = [
    'Issued by accredited partner institutions',
    'Meets state requirements',
    'Accepted by colleges nationwide',
    'Includes official transcript and portfolio',
  ]

  const dualEnrollmentFeatures = [
    'Earn college credit while in high school',
    'Transfer to 4-year programs',
    'Save thousands on tuition',
    'Accelerate your academic journey',
  ]

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors z-10"
          aria-label="Close modal"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>

        <div className="p-8 md:p-12">
          {/* Header */}
          <div className="text-center mb-10">
            <h2
              className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              Official Diplomas Through Our Accredited Partners
            </h2>
            <p
              className="text-lg text-gray-600 max-w-2xl mx-auto"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              We partner with established accredited institutions to provide official credentials
            </p>
          </div>

          {/* Two Column Layout */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* High School Diploma Path */}
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
              <h3
                className="text-xl font-bold text-gray-900 mb-4"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                High School Diploma
              </h3>

              <ul className="space-y-3">
                {diplomaFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span
                      className="text-gray-700"
                      style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                    >
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Dual-Enrollment */}
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
              <h3
                className="text-xl font-bold text-gray-900 mb-4"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Dual-Enrollment College Credits
              </h3>

              <ul className="space-y-3">
                {dualEnrollmentFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span
                      className="text-gray-700"
                      style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                    >
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-xl p-6 border border-optio-purple/10">
            <p
              className="text-gray-700 leading-relaxed text-center"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              Optio provides the learning platform and portfolio system. Our accredited partner institutions review student work and issue official diplomas and transcripts. Your credentials are recognized by colleges and employers nationwide.
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  // Use portal to render at document body level, ensuring it's above everything
  return createPortal(modalContent, document.body)
}

export default AccreditationModal
