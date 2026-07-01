import React, { forwardRef } from 'react'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import WascBadge from '../accreditation/WascBadge'

const AccreditationSection = forwardRef(({ isVisible = true }, ref) => {
  const diplomaFeatures = [
    'Issued by Optio Academy, accredited by WASC',
    'Meets state graduation requirements',
    'Accepted by colleges nationwide',
    'Includes an official transcript and portfolio',
  ]

  const dualEnrollmentFeatures = [
    'Earn college credit while in high school',
    'Transfer to 4-year programs',
    'Save thousands on tuition',
    'Accelerate your academic journey',
  ]

  return (
    <section
      ref={ref}
      className={`py-20 bg-gray-50 transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2
            className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            A WASC-Accredited High School Diploma
          </h2>
          <p
            className="text-lg text-gray-600 max-w-2xl mx-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Optio Academy is accredited by the Accrediting Commission for Schools, Western
            Association of Schools and Colleges, so the diploma you earn is official and
            recognized nationwide.
          </p>
          <div className="mt-8 max-w-md mx-auto">
            <WascBadge variant="card" />
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* High School Diploma Path */}
          <div className="bg-white rounded-2xl p-8 shadow-md border border-gray-100">
            <h3
              className="text-2xl font-bold text-gray-900 mb-6"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              High School Diploma
            </h3>

            <ul className="space-y-3 mb-6">
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

            <div className="bg-gray-50 rounded-lg p-4">
              <p
                className="text-lg font-bold text-gray-900"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                $150 <span className="text-sm font-normal text-gray-600">per class (one semester, 0.5 credit)</span>
              </p>
            </div>
          </div>

          {/* Dual-Enrollment */}
          <div className="bg-white rounded-2xl p-8 shadow-md border border-gray-100">
            <h3
              className="text-2xl font-bold text-gray-900 mb-6"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              Dual-Enrollment College Credits
            </h3>

            <ul className="space-y-3 mb-6">
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

            <div className="bg-gray-50 rounded-lg p-4">
              <p
                className="text-lg font-bold text-gray-900"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                $250 <span className="text-sm font-normal text-gray-600">per credit</span>
              </p>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-md">
          <p
            className="text-gray-700 leading-relaxed text-center max-w-3xl mx-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Your work is reviewed by licensed teachers and issued as an official, WASC-accredited transcript through Optio Academy. Partner schools that aren't accredited themselves can offer the same accredited transcript to their students through us. College credit is earned through our dual-enrollment partners. Your credentials are recognized by colleges and employers nationwide.
          </p>
        </div>
      </div>
    </section>
  )
})

AccreditationSection.displayName = 'AccreditationSection'

export default AccreditationSection
