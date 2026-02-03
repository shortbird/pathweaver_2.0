import React, { forwardRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import AccreditationModal from './AccreditationModal'

const OrganizationFeaturesSection = forwardRef(({ isVisible = true }, ref) => {
  const [accreditationModalOpen, setAccreditationModalOpen] = useState(false)
  // Pexels search terms for images:
  // - "microschool classroom students" or "small group learning"
  // - "graduation ceremony student" or "diploma celebration"
  // - "parent child learning together" or "family education"

  const features = [
    {
      title: 'Student Management',
      description: 'Enroll students, track progress across all learners, and manage cohorts with ease.',
      // Placeholder - replace with Pexels image
      image: 'https://images.pexels.com/photos/8613089/pexels-photo-8613089.jpeg?auto=compress&cs=tinysrgb&w=800',
      imageAlt: 'Small group of students learning together',
    },
    {
      title: 'Instant Accreditation',
      description: 'Skip the costly, years-long accreditation process. Offer your students official high school diplomas and dual-enrollment college from day one.',
      // Placeholder - replace with Pexels image showing graduation/diploma
      // Search: "student graduation diploma", "high school graduate", "graduation ceremony"
      image: 'https://images.pexels.com/photos/267885/pexels-photo-267885.jpeg?auto=compress&cs=tinysrgb&w=800',
      imageAlt: 'Graduate holding diploma',
      hasLearnMore: true,
    },
    {
      title: 'Parent Portal',
      description: 'Built-in parent dashboards for every family. No extra setup required.',
      // Placeholder - replace with Pexels image
      image: 'https://images.pexels.com/photos/4260325/pexels-photo-4260325.jpeg?auto=compress&cs=tinysrgb&w=800',
      imageAlt: 'Parent and child learning together',
    },
  ]

  return (
    <section
      ref={ref}
      className={`py-20 bg-white transition-all duration-700 ${
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
            Built for Growing Learning Communities
          </h2>
          <p
            className="text-lg text-gray-600 max-w-2xl mx-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            From 5-student microschools to 500+ student learning networks
          </p>
        </div>

        {/* Feature Cards with Images */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-lg transition-shadow"
            >
              <div className="relative h-48 overflow-hidden">
                <img
                  src={feature.image}
                  alt={feature.imageAlt}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>
              </div>
              <div className="p-6">
                <h3
                  className="text-xl font-bold text-gray-900 mb-2"
                  style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                >
                  {feature.title}
                </h3>
                <p
                  className="text-gray-600 leading-relaxed"
                  style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                >
                  {feature.description}
                </p>
                {feature.hasLearnMore && (
                  <button
                    onClick={() => setAccreditationModalOpen(true)}
                    className="mt-4 text-optio-purple hover:text-optio-pink font-semibold transition-colors"
                    style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                  >
                    Learn more about accreditation
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            to="/contact?type=demo"
            className="inline-flex items-center justify-center bg-gradient-primary text-white px-8 py-4 rounded-lg font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all min-h-[44px] w-full sm:w-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Get More Info
            <ArrowRightIcon className="ml-2 w-5 h-5" />
          </Link>
          <Link
            to="/demo"
            className="inline-flex items-center justify-center bg-white border-2 border-optio-purple text-optio-purple hover:bg-optio-purple hover:text-white px-8 py-4 rounded-lg font-bold transition-all min-h-[44px] w-full sm:w-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Try Demo First
          </Link>
        </div>
      </div>

      {/* Accreditation Modal */}
      <AccreditationModal
        isOpen={accreditationModalOpen}
        onClose={() => setAccreditationModalOpen(false)}
      />
    </section>
  )
})

OrganizationFeaturesSection.displayName = 'OrganizationFeaturesSection'

export default OrganizationFeaturesSection
