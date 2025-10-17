import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Play, X, BookOpen, Users, CheckCircle, Heart } from 'lucide-react'
import { PhilosophySection } from '../components/ui/PhilosophyCard'
import { useSubscriptionTiers, formatPrice } from '../hooks/useSubscriptionTiers'

const HomePage = () => {
  const { isAuthenticated } = useAuth()
  const { data: tiers, isLoading: tiersLoading } = useSubscriptionTiers()
  const [philosophyModalOpen, setPhilosophyModalOpen] = useState(false)

  return (
    <div className="min-h-screen">
      {/* Skip link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-[#6d469b] text-white px-4 py-2 rounded z-50"
        style={{ fontFamily: 'Poppins', fontWeight: 600 }}
      >
        Skip to main content
      </a>

      {/* Hero Section - Main Tagline Only */}
      <div
        className="bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white relative overflow-hidden"
        role="banner"
        aria-label="Hero section introducing Optio teacher-partnership model"
      >
        {/* Subtle background elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-32 h-32 border-2 border-white/20 rounded-full"></div>
          <div className="absolute bottom-20 right-10 w-24 h-24 border-2 border-white/20 rounded-full"></div>
          <div className="absolute top-1/2 left-1/3 w-20 h-20 border-2 border-white/10 rounded-full"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32 relative">
          <div className="text-center">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                <span className="block drop-shadow-lg">Supporting Parents.</span>
                <span className="block drop-shadow-lg mt-4">Empowering Students.</span>
                <span className="block drop-shadow-lg mt-4">Building Futures.</span>
              </h1>
          </div>
        </div>
      </div>

      {/* Secondary Hero Section - Teacher Focus */}
      <div className="bg-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            An experienced educator in your corner.
          </h2>
          <p className="text-xl sm:text-2xl text-gray-700 mb-8 leading-relaxed italic" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            Raising doers, not dependents.
          </p>

          {/* CTAs - Consultation Focused */}
          {!isAuthenticated && (
            <div className="flex flex-col gap-4 justify-center items-center max-w-sm mx-auto sm:max-w-none sm:flex-row">
              <Link
                to="/consultation"
                className="bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white hover:from-[#5d3a85] hover:to-[#d94d6a] text-lg px-8 py-4 rounded-lg font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center group w-full sm:w-auto justify-center min-h-[52px] touch-manipulation"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                aria-describedby="consultation-description"
              >
                <Users className="mr-2 w-5 h-5 group-hover:scale-110 transition-transform flex-shrink-0" aria-hidden="true" />
                Schedule FREE Consultation
              </Link>
              <span id="consultation-description" className="sr-only">
                Schedule a free 30-minute consultation with a licensed teacher
              </span>

              <Link
                to="/demo"
                className="bg-white border-2 border-[#6d469b] text-[#6d469b] hover:bg-[#6d469b] hover:text-white px-8 py-4 rounded-lg font-semibold inline-flex items-center transition-all w-full sm:w-auto justify-center shadow-md min-h-[52px] touch-manipulation"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                <Play className="mr-2 w-5 h-5" aria-hidden="true" />
                Try 2-Min Demo
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* What Optio Provides Section - Column Layout with Image */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              What Optio Provides
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              A complete support system for your family's learning rhythm
            </p>
          </div>

          {/* Column Layout: Content Left, Image Right */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left Column - Content */}
            <div className="space-y-8">
              {/* Your Own Dedicated Teacher */}
              <div>
                <div className="flex items-start mb-3">
                  <div className="w-12 h-12 bg-gradient-to-r from-[#6d469b] to-[#ef597b] rounded-full flex items-center justify-center mr-4 flex-shrink-0 shadow-md">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Your Own Licensed Teacher</h3>
                    <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                      Your family's experienced educational partner.
                    </p>
                  </div>
                </div>
              </div>

              {/* Student-Driven Learning Platform */}
              <div>
                <div className="flex items-start mb-3">
                  <div className="w-12 h-12 bg-gradient-to-r from-[#6d469b] to-[#ef597b] rounded-full flex items-center justify-center mr-4 flex-shrink-0 shadow-md">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Student-Driven Learning Platform</h3>
                    <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                      Digital portfolio capturing your child's unique learning journey.
                    </p>
                  </div>
                </div>
              </div>

              {/* Parent Peace of Mind */}
              <div>
                <div className="flex items-start mb-3">
                  <div className="w-12 h-12 bg-gradient-to-r from-[#6d469b] to-[#ef597b] rounded-full flex items-center justify-center mr-4 flex-shrink-0 shadow-md">
                    <Heart className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Parent Peace of Mind</h3>
                    <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                      Professional support with flexibility and family control.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Image */}
            <div className="rounded-xl overflow-hidden shadow-lg border-2 border-gray-200">
              <img
                src="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/homepage/educator.jpg"
                alt="Teacher collaborating with parent and student in a supportive learning environment"
                className="w-full h-full object-cover aspect-[4/3]"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Simplified Pricing with Modal */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Simple Pricing</h2>
            <p className="text-lg text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Start free. Upgrade when ready.
            </p>
          </div>

          {tiersLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6d469b]"></div>
            </div>
          ) : (
            <div className="grid md:grid-cols-4 gap-6">
              {tiers?.slice(0, 4).map((tier) => (
                <div
                  key={tier.id}
                  className={`bg-white rounded-xl shadow-sm p-6 sm:p-8 flex flex-col relative ${
                    tier.badge_text ? (tier.badge_color === 'gradient' ? 'border-2 border-[#ef597b] transform scale-105 shadow-lg' : '') : ''
                  }`}
                >
                  {tier.badge_text && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className={`text-white text-xs px-4 py-1 rounded-full inline-block font-bold ${
                        tier.badge_color === 'gradient'
                          ? 'bg-gradient-to-r from-[#6d469b] to-[#ef597b]'
                          : tier.badge_color === 'green'
                          ? 'bg-green-500'
                          : 'bg-gray-500'
                      }`}
                      style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                      >
                        {tier.badge_text}
                      </span>
                    </div>
                  )}
                  <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>{tier.display_name}</h3>
                  <p className="text-3xl font-bold mb-1" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                    {formatPrice(tier.price_monthly)}
                    <span className="text-lg font-normal text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>/mo</span>
                  </p>
                  <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{tier.description}</p>
                  <ul className="space-y-2 mb-8 flex-grow text-sm">
                    {tier.features?.map((feature, index) => (
                      <li key={index} className="flex items-start">
                        <svg className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className={`text-gray-700 ${feature.includes('Portfolio Diploma') || feature.includes('TWO diplomas') ? 'font-semibold' : ''}`} style={{ fontFamily: 'Poppins', fontWeight: feature.includes('Portfolio Diploma') || feature.includes('TWO diplomas') ? 600 : 500 }}>
                          {feature}
                        </span>
                      </li>
                    ))}
                    {tier.limitations?.map((limitation, index) => (
                      <li key={`limit-${index}`} className="flex items-start">
                        <svg className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <span className="text-gray-500 line-through text-xs" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{limitation}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/register"
                    className={`block w-full py-3 px-6 rounded-lg font-bold transition-all text-center ${
                      tier.tier_key === 'Explore'
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white hover:shadow-lg'
                    }`}
                    style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                  >
                    {tier.tier_key === 'Explore' ? 'Start Free' : `Get ${tier.display_name}`}
                  </Link>
                </div>
              ))}
            </div>
          )}

          {/* Pricing Note */}
          {!tiersLoading && (
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Pricing is per student. Contact{' '}
                <a href="mailto:support@optioeducation.com" className="text-[#6d469b] hover:underline font-semibold" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
                  support@optioeducation.com
                </a>
                {' '}for information on family or microschool discounts.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* How It Works Section */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              How It Works
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              A simple, supportive process designed around your family's needs
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-[#6d469b] to-[#ef597b] rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
                <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>1</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Meet Your Teacher</h3>
              <p className="text-gray-600 leading-relaxed text-sm" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Schedule a free consultation to discuss your family's vision and needs.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-[#6d469b] to-[#ef597b] rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
                <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>2</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Create Your Plan</h3>
              <p className="text-gray-600 leading-relaxed text-sm" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Work with your teacher to design a learning approach that fits your child's interests and your family's goals.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-[#6d469b] to-[#ef597b] rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
                <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>3</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Learn & Document</h3>
              <p className="text-gray-600 leading-relaxed text-sm" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Your student pursues projects and interests while our platform records their growth. Your teacher provides guidance along the way.
              </p>
            </div>

            {/* Step 4 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-[#6d469b] to-[#ef597b] rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
                <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>4</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Review & Celebrate</h3>
              <p className="text-gray-600 leading-relaxed text-sm" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Regular check-ins with your teacher ensure progress and celebrate milestones.
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Link
              to="/consultation"
              className="inline-flex items-center bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white px-8 py-4 rounded-lg font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              <Users className="mr-2 w-5 h-5" />
              Start with a Free Consultation
            </Link>
          </div>
        </div>
      </div>

      {/* Consultation CTA Section - Replaces Old Signup Form */}
      <div className="py-16 bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              Take the Next Step
            </h2>
            <p className="text-xl mb-6 opacity-95" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
              Schedule Your FREE Consultation
            </p>
            <p className="text-lg opacity-90 max-w-2xl mx-auto leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Meet with an Optio teacher to discuss your family's unique situation. No pressure, no commitment—just a conversation about what's possible.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl border-2 border-white/20 p-6 sm:p-8 mb-8">
            <h3 className="text-xl font-bold mb-4 text-center" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>What to Expect:</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>30-minute video call with a licensed teacher</span>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Discussion of your child's interests and your ideas</span>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Overview of how Optio could work for your family</span>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Answers to all your questions</span>
              </div>
            </div>
          </div>

          <div className="text-center">
            <Link
              to="/consultation"
              className="inline-flex items-center bg-white text-[#6d469b] hover:bg-gray-100 px-8 py-4 rounded-lg font-bold text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              <Users className="mr-2 w-5 h-5" />
              Book Your Free Consultation
            </Link>

            <p className="text-sm opacity-90 mt-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Questions? Email <a href="mailto:support@optioeducation.com" className="underline hover:no-underline">support@optioeducation.com</a>
            </p>
          </div>
        </div>
      </div>

      {/* Our Philosophy Section */}
      <PhilosophySection onPhilosophyModalOpen={() => setPhilosophyModalOpen(true)} />

      {/* FAQ Section - Teacher-Partnership Focus */}
      <div className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-6">
            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                What does an Optio teacher actually do?
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Your Optio teacher is a licensed educator who becomes a non-parent adult invested in your child's education. They work WITH you as a partner, providing experienced guidance, answering questions, and keeping momentum going. They can provide daily support, check-ins, and be a person you can rely on to keep your kids' education moving when you get busy. Your teacher is there to support your family's learning journey with professional insight and encouragement.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                How much control do I have over my child's education?
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                You maintain complete control over your family's learning vision and approach. Your teacher is there to support, not impose. Together, you'll find your family's natural learning rhythm without requirements or hurdles. The teacher's role is guidance and professional support, not gatekeeping.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                How often do we meet with our teacher?
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                That's up to your family! Options range from daily check-ins for more support to quarterly touchpoints for more independent families. Your teacher works around your schedule and needs. It's flexible by design.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Is this accredited?
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Yes, Optio students can earn traditional accredited high school diplomas. We have created a unique system that combines student-driven learning with the necessary structure to meet accreditation standards. Our teachers ensure that your child meets all graduation requirements while pursuing their passions.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                What if we're already homeschooling?
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Perfect! Many Optio families are already homeschooling and use our teachers as professional support to enhance what they're already doing. Your teacher can offer guidance, provide accountability, and bring the expertise you've been looking for.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA - Consultation Focused */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Ready to Talk?</h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Connect with an Optio teacher to explore how we can support your family's learning journey.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                to="/consultation"
                className="bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white hover:shadow-lg text-lg px-8 py-4 rounded-lg font-bold transition-all inline-flex items-center transform hover:scale-105"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                <Users className="mr-2 w-5 h-5" aria-hidden="true" />
                Schedule Consultation
              </Link>
              <Link
                to="/demo"
                className="bg-white border-2 border-[#6d469b] text-[#6d469b] hover:bg-[#6d469b] hover:text-white text-lg px-8 py-4 rounded-lg font-bold transition-all inline-flex items-center"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                <Play className="mr-2 w-5 h-5" aria-hidden="true" />
                Try Demo First
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Philosophy Details Modal */}
      {philosophyModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Our Philosophy: The Process Is The Goal</h3>
              <button
                onClick={() => setPhilosophyModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close modal"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-4 bg-gradient-to-r from-[#ef597b]/5 to-[#6d469b]/5 rounded-lg">
                <p className="text-lg font-semibold text-gray-800 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>Core Belief</p>
                <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Learning is not about reaching a destination or impressing others. It's about who you become through the journey of discovery, creation, and growth. Every quest, every piece of evidence is valuable because of what it teaches you RIGHT NOW, not what it might prove later.
                </p>
              </div>

              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#ef597b]" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>Present-Focused Value</h4>
                <p className="text-gray-700 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  We don't say "This will help you in the future." We say "This is helping you grow right now."
                </p>
                <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Your learning matters today. Each skill you build, each idea you explore, each creation you make enriches your life in this moment. The value isn't postponed to some future job or college application – it's immediate and real.
                </p>
              </div>

              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#6d469b]" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>Internal Motivation Over External Validation</h4>
                <p className="text-gray-700 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  The platform celebrates personal growth, curiosity, and creation for its own sake. We focus on how learning FEELS, not how it LOOKS.
                </p>
                <ul className="space-y-2 text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  <li>• "You're discovering what you're capable of" (not "proving your capabilities")</li>
                  <li>• "Your creativity is flourishing" (not "showcasing your creativity")</li>
                  <li>• "You're becoming more yourself" (not "standing out from others")</li>
                </ul>
              </div>

              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#ef597b]" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>Process Celebration</h4>
                <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Every step is valuable. We celebrate attempts, effort, and learning from mistakes as much as completion. Mistakes are expected and celebrated. Your consistency is beautiful. You're in a learning flow state.
                </p>
              </div>

              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#6d469b]" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>What This Means For You</h4>
                <ul className="space-y-3 text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Learn at your own pace – there's no "falling behind"</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Follow your curiosity, not a prescribed path</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Create for the joy of creating, not for grades</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Build skills that matter to you personally</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Celebrate growth, not comparison</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-800" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                <strong style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Remember:</strong> You're already enough. You're growing at the perfect pace. You're creating something meaningful. The diploma is not the goal – it's the beautiful byproduct of a meaningful learning journey.
              </p>
            </div>

            <div className="mt-6 flex justify-center">
              <Link
                to="/demo"
                className="bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                Experience It Yourself
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePage
