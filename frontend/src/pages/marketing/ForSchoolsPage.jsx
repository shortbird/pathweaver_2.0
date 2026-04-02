import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import { RevealSection, RevealItem } from '../../components/marketing/RevealSection'
import { useSectionView, useCtaTracker } from '../../components/marketing/useMarketingAnalytics'
import ContactInfoModal from '../../components/ContactInfoModal'

const PAGE = 'for_schools'

const IMAGES = {
  hero: 'https://images.pexels.com/photos/8613089/pexels-photo-8613089.jpeg?auto=compress&cs=tinysrgb&w=1920',
  management: 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=800',
  diploma: 'https://images.pexels.com/photos/267885/pexels-photo-267885.jpeg?auto=compress&cs=tinysrgb&w=800',
  parent: 'https://images.pexels.com/photos/4260325/pexels-photo-4260325.jpeg?auto=compress&cs=tinysrgb&w=800',
}

const CheckIcon = () => (
  <svg className="w-5 h-5 text-optio-purple flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const ForSchoolsPage = () => {
  const [contactOpen, setContactOpen] = useState(false)
  const trackCta = useCtaTracker(PAGE)

  const heroRef = useSectionView('hero', PAGE)
  const whoRef = useSectionView('who_its_for', PAGE)
  const featuresRef = useSectionView('features', PAGE)
  const accreditationRef = useSectionView('accreditation', PAGE)
  const howRef = useSectionView('how_it_works', PAGE)
  const ctaRef = useSectionView('final_cta', PAGE)

  return (
    <MarketingLayout>
      <Helmet>
        <title>For Schools & Organizations | Optio Education</title>
        <meta name="description" content="Instant accreditation for microschools, online schools, learning centers, and co-ops. Student management, parent portals, and official credentials from day one." />
        <meta property="og:title" content="For Schools & Organizations | Optio Education" />
        <meta property="og:description" content="Skip the costly accreditation process. Offer official diplomas and dual-enrollment college credit from day one." />
        <meta property="og:url" content="https://www.optioeducation.com/for-schools" />
        <link rel="canonical" href="https://www.optioeducation.com/for-schools" />
      </Helmet>

      {/* ========== HERO ========== */}
      <section ref={heroRef} className="relative overflow-hidden min-h-[55vh] flex items-center">
        <div className="absolute inset-0">
          <img src={IMAGES.hero} alt="" className="w-full h-full object-cover" style={{ objectPosition: 'center 40%' }} />
          <div className="absolute inset-0 bg-optio-purple/70 sm:hidden" />
          <div className="absolute inset-0 hidden sm:block" style={{
            background: 'linear-gradient(to right, #6D469B 0%, #6D469B 25%, rgba(109,70,155,0.95) 35%, rgba(109,70,155,0.7) 45%, rgba(109,70,155,0.3) 55%, transparent 65%)'
          }} />
        </div>
        <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="max-w-xl">
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl text-white mb-3 leading-tight text-center sm:text-left"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              Accreditation From Day One
            </h1>
            <p
              className="text-lg sm:text-xl text-white/90 mb-8 leading-relaxed text-center sm:text-left"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              Skip the costly, years-long accreditation process. Offer your students official diplomas and dual-enrollment college credit through Optio.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center sm:justify-start">
              <button
                onClick={() => { trackCta('hero_get_info'); setContactOpen(true) }}
                className="bg-white text-optio-pink hover:bg-gray-100 text-base sm:text-lg px-6 py-3 sm:px-8 sm:py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center justify-center font-bold"
                style={{ fontFamily: 'Poppins' }}
              >
                Get More Info
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
              <Link
                to="/how-it-works"
                onClick={() => trackCta('hero_how_it_works')}
                className="bg-transparent border-2 border-white text-white hover:bg-white/10 text-base sm:text-lg px-6 py-3 sm:px-8 sm:py-4 rounded-lg transition-all duration-300 inline-flex items-center justify-center font-semibold"
                style={{ fontFamily: 'Poppins' }}
              >
                See How It Works
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========== WHO IT'S FOR ========== */}
      <section ref={whoRef} className="py-16 sm:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Built For Growing Learning Communities
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                From 5-student microschools to 500+ student learning networks.
              </p>
            </div>
          </RevealSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { type: 'Microschools', desc: 'Small, intentional learning communities', icon: '5-30 students' },
              { type: 'Online Schools', desc: 'Virtual programs that need official credentials', icon: '10-500+ students' },
              { type: 'Learning Centers', desc: 'Co-ops, tutoring centers, after-school programs', icon: '10-200 students' },
              { type: 'Traditional Schools', desc: 'Supplement existing programs with personalized learning', icon: '50-500+ students' },
            ].map((item, i) => (
              <RevealItem key={item.type} index={i}>
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 h-full">
                  <p className="text-xs font-semibold text-optio-purple uppercase tracking-wider mb-2" style={{ fontFamily: 'Poppins' }}>{item.icon}</p>
                  <h3 className="text-lg font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>{item.type}</h3>
                  <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== KEY FEATURES ========== */}
      <section ref={featuresRef} className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Feature 1: Student Management */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16 sm:mb-20">
            <RevealSection>
              <img src={IMAGES.management} alt="Team collaboration" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
            </RevealSection>
            <RevealSection delay={200}>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Student Management Made Simple
              </h3>
              <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Enroll students, track progress across all learners, and manage your program from a single dashboard.
              </p>
              <div className="space-y-3">
                {[
                  'Enroll and manage student cohorts',
                  'Track progress across all learners in real-time',
                  'Assign advisors to individual students',
                  'Organization-wide analytics and reporting',
                  'Custom branding for your program',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckIcon />
                    <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
          </div>

          {/* Feature 2: Accreditation */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16 sm:mb-20">
            <RevealSection delay={200} className="order-2 lg:order-1">
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Instant Accreditation
              </h3>
              <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Skip the costly, years-long accreditation process. Through our partnership with established WASC-accredited institutions, your students can earn official credentials from day one.
              </p>
              <div className="space-y-3">
                {[
                  'WASC-accredited high school diplomas',
                  'Dual-enrollment college credit',
                  'Official transcripts recognized nationwide',
                  'No accreditation process for your organization',
                  'Students earn credentials through your program',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckIcon />
                    <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
            <RevealSection className="order-1 lg:order-2">
              <img src={IMAGES.diploma} alt="Graduation" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
            </RevealSection>
          </div>

          {/* Feature 3: Parent Portal */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <RevealSection>
              <img src={IMAGES.parent} alt="Parent and child" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
            </RevealSection>
            <RevealSection delay={200}>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Built-in Parent Portal
              </h3>
              <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Every family automatically gets a parent dashboard. No extra setup required. Parents see their child's learning journey as a social media-style activity feed.
              </p>
              <div className="space-y-3">
                {[
                  'Activity feed of student learning',
                  'Observer invitations for extended family',
                  'Bounty system for family engagement',
                  'No extra setup -- works out of the box',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckIcon />
                    <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ========== HOW IT WORKS FOR ORGS ========== */}
      <section ref={howRef} className="py-16 sm:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <RevealSection>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              Getting Started Is Simple
            </h2>
            <p className="text-lg text-gray-600 mb-12" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              You can be up and running in a day.
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-4 gap-6">
            {[
              { step: '1', title: 'Create Your Org', desc: 'Set up your organization with custom branding' },
              { step: '2', title: 'Enroll Students', desc: 'Add students individually or in bulk' },
              { step: '3', title: 'Assign Quests', desc: 'Use our library or create your own curriculum' },
              { step: '4', title: 'Issue Credentials', desc: 'Official transcripts and diplomas for completers' },
            ].map((item, i) => (
              <RevealItem key={item.step} index={i}>
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center text-xl font-bold mx-auto mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>{item.title}</h3>
                  <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== PRICING TEASER ========== */}
      <section ref={accreditationRef} className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="bg-white rounded-2xl p-8 sm:p-10 border border-gray-200 shadow-lg text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Pricing That Scales With You
              </h2>
              <p className="text-gray-600 mb-6 max-w-xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                The platform is free to use for tracking and portfolios. Credential services are priced per student based on your program size. Contact us for a custom quote.
              </p>
              <button
                onClick={() => { trackCta('pricing_get_info'); setContactOpen(true) }}
                className="inline-flex items-center justify-center bg-gradient-to-r from-optio-purple to-optio-pink text-white px-8 py-4 rounded-lg font-bold text-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
                style={{ fontFamily: 'Poppins' }}
              >
                Get a Custom Quote
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== FINAL CTA ========== */}
      <section ref={ctaRef} className="py-16 sm:py-20 bg-gradient-to-r from-optio-purple to-optio-pink">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            Ready to Offer Official Credentials?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            Join learning communities that are proving personalized education can be accredited.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => { trackCta('final_get_info'); setContactOpen(true) }}
              className="bg-white text-optio-pink hover:bg-gray-100 px-8 py-4 rounded-lg font-bold text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all inline-flex items-center justify-center"
              style={{ fontFamily: 'Poppins' }}
            >
              Get More Info
              <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
            <Link
              to="/register"
              onClick={() => trackCta('final_register')}
              className="bg-transparent border-2 border-white text-white hover:bg-white/10 px-8 py-4 rounded-lg font-bold text-lg transition-all inline-flex items-center justify-center"
              style={{ fontFamily: 'Poppins' }}
            >
              Create Your Organization
            </Link>
          </div>
        </div>
      </section>

      <ContactInfoModal isOpen={contactOpen} onClose={() => setContactOpen(false)} contactType="sales" />
    </MarketingLayout>
  )
}

export default ForSchoolsPage
