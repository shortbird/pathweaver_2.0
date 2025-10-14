import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Play, Sparkles, Trophy, Info, X, Award, BookOpen, Users, CheckCircle, Heart, Image } from 'lucide-react'
import { PhilosophySection } from '../components/ui/PhilosophyCard'
import { useSubscriptionTiers, formatPrice } from '../hooks/useSubscriptionTiers'

const HomePage = () => {
  const { isAuthenticated } = useAuth()
  const { data: tiers, isLoading: tiersLoading } = useSubscriptionTiers()
  const [pricingModalOpen, setPricingModalOpen] = useState(false)
  const [philosophyModalOpen, setPhilosophyModalOpen] = useState(false)

  return (
    <div className="min-h-screen">
      {/* Skip link for accessibility */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-primary text-white px-4 py-2 rounded z-50"
      >
        Skip to main content
      </a>

      {/* Hero Section - Main Tagline Only */}
      <div
        className="bg-gradient-to-br from-[#6D469B] to-[#EF597B] text-white relative overflow-hidden"
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
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-tight">
                <span className="block drop-shadow-lg">Supporting Parents.</span>
                <span className="block drop-shadow-lg mt-2">Empowering Students.</span>
                <span className="block drop-shadow-lg mt-2">Building Futures.</span>
              </h1>
          </div>
        </div>
      </div>

      {/* Secondary Hero Section - Teacher Focus */}
      <div className="bg-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            A dedicated teacher in your corner.
          </h2>
          <p className="text-xl sm:text-2xl text-gray-700 mb-8 leading-relaxed italic">
            Raising doers, not dependents.
          </p>

          {/* CTAs - Consultation Focused */}
          {!isAuthenticated && (
            <div className="flex flex-col gap-4 justify-center items-center max-w-sm mx-auto sm:max-w-none sm:flex-row">
              <Link
                to="/consultation"
                className="bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white hover:from-[#5d3a85] hover:to-[#d94d6a] text-lg px-8 py-4 rounded-lg font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center group w-full sm:w-auto justify-center min-h-[52px] touch-manipulation"
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
                className="bg-white border-2 border-[#6D469B] text-[#6D469B] hover:bg-[#6D469B] hover:text-white px-8 py-4 rounded-lg font-semibold inline-flex items-center transition-all w-full sm:w-auto justify-center shadow-md min-h-[52px] touch-manipulation"
              >
                <Play className="mr-2 w-5 h-5" aria-hidden="true" />
                Try 2-Min Demo
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* If You're Feeling... Emotional Connection Section */}
      <div id="support" className="py-16 bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF]" role="main">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              If You're Feeling...
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-8">
            {/* Card 1: Nurturing Potential */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 bg-gradient-to-r from-[#6D469B]/70 to-[#EF597B]/70 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Heart className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3 text-center">
                "I want to nurture my child's potential..."
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Licensed teachers work alongside you, providing expertise and peace of mind.
              </p>
            </div>

            {/* Card 2: Protecting Love of Learning */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 bg-gradient-to-r from-[#6D469B]/70 to-[#EF597B]/70 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3 text-center">
                "I want to protect their love of learning..."
              </h3>
              <p className="text-gray-700 leading-relaxed">
                You set the vision. We provide professional support that keeps you in charge.
              </p>
            </div>

            {/* Card 3: Real World Readiness */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 bg-gradient-to-r from-[#6D469B]/70 to-[#EF597B]/70 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3 text-center">
                "Will my child be ready for the real world?"
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Student-driven learning creates intrinsically motivated doers, not dependents.
              </p>
            </div>
          </div>

          <div className="text-center">
            <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              You're not alone. We're here to support you.
            </p>
          </div>
        </div>
      </div>

      {/* What Optio Provides Section - Column Layout with Image */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              What Optio Provides
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              A complete support system for your family's learning journey
            </p>
          </div>

          {/* Column Layout: Content Left, Image Right */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left Column - Content */}
            <div className="space-y-8">
              {/* Your Own Dedicated Teacher */}
              <div>
                <div className="flex items-start mb-3">
                  <div className="w-12 h-12 bg-gradient-to-r from-[#6D469B]/60 to-[#EF597B]/60 rounded-full flex items-center justify-center mr-4 flex-shrink-0 shadow-sm">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Your Own Dedicated Teacher</h3>
                    <p className="text-gray-700 leading-relaxed">
                      Your educational partner: a licensed educator for your family.
                    </p>
                  </div>
                </div>
              </div>

              {/* Student-Driven Learning Platform */}
              <div>
                <div className="flex items-start mb-3">
                  <div className="w-12 h-12 bg-gradient-to-r from-[#6D469B]/60 to-[#EF597B]/60 rounded-full flex items-center justify-center mr-4 flex-shrink-0 shadow-sm">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Student-Driven Learning Platform</h3>
                    <p className="text-gray-700 leading-relaxed">
                      Digital portfolio capturing your child's unique learning journey.
                    </p>
                  </div>
                </div>
              </div>

              {/* Parent Peace of Mind */}
              <div>
                <div className="flex items-start mb-3">
                  <div className="w-12 h-12 bg-gradient-to-r from-[#6D469B]/60 to-[#EF597B]/60 rounded-full flex items-center justify-center mr-4 flex-shrink-0 shadow-sm">
                    <Heart className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Parent Peace of Mind</h3>
                    <p className="text-gray-700 leading-relaxed">
                      Professional oversight with flexibility and family control.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Image */}
            <div className="rounded-xl overflow-hidden shadow-lg border-2 border-gray-200">
              <img
                src="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/homepage/teacher.jpg"
                alt="Teacher collaborating with parent and student in a supportive learning environment"
                className="w-full h-full object-cover aspect-[4/3]"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="py-16 bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              A simple, supportive process designed around your family's needs
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-[#6D469B]/75 to-[#EF597B]/75 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
                <span className="text-2xl font-bold text-white">1</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Meet Your Teacher</h3>
              <p className="text-gray-600 leading-relaxed text-sm">
                Schedule a free consultation to discuss your family's vision and needs.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-[#6D469B]/75 to-[#EF597B]/75 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
                <span className="text-2xl font-bold text-white">2</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Create Your Plan</h3>
              <p className="text-gray-600 leading-relaxed text-sm">
                Work with your teacher to design a learning approach that fits your child's interests and your family's goals.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-[#6D469B]/75 to-[#EF597B]/75 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
                <span className="text-2xl font-bold text-white">3</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Learn & Document</h3>
              <p className="text-gray-600 leading-relaxed text-sm">
                Your student pursues projects and interests while our platform captures their growth. Your teacher provides guidance along the way.
              </p>
            </div>

            {/* Step 4 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-[#6D469B]/75 to-[#EF597B]/75 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
                <span className="text-2xl font-bold text-white">4</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Review & Celebrate</h3>
              <p className="text-gray-600 leading-relaxed text-sm">
                Regular check-ins with your teacher ensure progress and celebrate milestones.
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Link
              to="/consultation"
              className="inline-flex items-center bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white px-8 py-4 rounded-lg font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
            >
              <Users className="mr-2 w-5 h-5" />
              Start with a Free Consultation
            </Link>
          </div>
        </div>
      </div>

      {/* Parent Testimonials Section */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              What Parents Are Saying
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Real stories from families using Optio
            </p>
          </div>

          {/* Happy Families Collage */}
          <div className="mb-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-6xl mx-auto">
            {/* Image 1 */}
            <div className="rounded-lg overflow-hidden shadow-md border-2 border-gray-200">
              <img
                src="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/homepage/fam1.jpg"
                alt="Happy homeschooling family"
                className="w-full h-full object-cover aspect-square"
                loading="lazy"
              />
            </div>
            {/* Image 2 */}
            <div className="rounded-lg overflow-hidden shadow-md border-2 border-gray-200">
              <img
                src="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/homepage/fam2.jpg"
                alt="Parent supporting student's learning"
                className="w-full h-full object-cover aspect-square"
                loading="lazy"
              />
            </div>
            {/* Image 3 */}
            <div className="rounded-lg overflow-hidden shadow-md border-2 border-gray-200">
              <img
                src="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/homepage/fam4.jpg"
                alt="Family learning together at home"
                className="w-full h-full object-cover aspect-square"
                loading="lazy"
              />
            </div>
            {/* Image 4 */}
            <div className="rounded-lg overflow-hidden shadow-md border-2 border-gray-200">
              <img
                src="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/homepage/fam5.jpg"
                alt="Warm family connection while learning"
                className="w-full h-full object-cover aspect-square"
                loading="lazy"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Testimonial 1 */}
            <div className="bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF] rounded-xl p-6 border border-gray-200">
              <div className="text-4xl text-[#6D469B] mb-3">"</div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Finally, someone who understands that I need help without needing someone to take over.
              </p>
              <p className="text-sm font-semibold text-gray-900">Sarah M.</p>
              <p className="text-xs text-gray-600">Homeschooling parent of two</p>
            </div>

            {/* Testimonial 2 */}
            <div className="bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF] rounded-xl p-6 border border-gray-200">
              <div className="text-4xl text-[#6D469B] mb-3">"</div>
              <p className="text-gray-700 leading-relaxed mb-4">
                I was drowning trying to be teacher, mom, and curriculum planner all at once. Having our Optio teacher feels like finally having a co-parent in the education department.
              </p>
              <p className="text-sm font-semibold text-gray-900">Jennifer K.</p>
              <p className="text-xs text-gray-600">Working mom, two teens</p>
            </div>

            {/* Testimonial 3 */}
            <div className="bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF] rounded-xl p-6 border border-gray-200">
              <div className="text-4xl text-[#6D469B] mb-3">"</div>
              <p className="text-gray-700 leading-relaxed mb-4">
                I finally stopped Googling 'am I homeschooling wrong' at 2am. Our teacher gives me the confidence I was missing.
              </p>
              <p className="text-sm font-semibold text-gray-900">Alicia R.</p>
              <p className="text-xs text-gray-600">First-time homeschool parent</p>
            </div>

            {/* Testimonial 4 */}
            <div className="bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF] rounded-xl p-6 border border-gray-200">
              <div className="text-4xl text-[#6D469B] mb-3">"</div>
              <p className="text-gray-700 leading-relaxed mb-4">
                It's not someone telling me what to do, it's someone helping me do what I already wanted to do. That's the difference.
              </p>
              <p className="text-sm font-semibold text-gray-900">David L.</p>
              <p className="text-xs text-gray-600">Dad, homeschooling for 3 years</p>
            </div>

            {/* Testimonial 5 */}
            <div className="bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF] rounded-xl p-6 border border-gray-200">
              <div className="text-4xl text-[#6D469B] mb-3">"</div>
              <p className="text-gray-700 leading-relaxed mb-4">
                My son went from barely finishing assignments to staying up late working on his projects because he actually cares about them. That's not something I could force. It had to come from him.
              </p>
              <p className="text-sm font-semibold text-gray-900">Kim S.</p>
              <p className="text-xs text-gray-600">Mom of 14-year-old</p>
            </div>

            {/* Testimonial 6 */}
            <div className="bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF] rounded-xl p-6 border border-gray-200">
              <div className="text-4xl text-[#6D469B] mb-3">"</div>
              <p className="text-gray-700 leading-relaxed mb-4">
                She's not learning to follow instructions, she's learning to lead her own life. That's what I needed for her.
              </p>
              <p className="text-sm font-semibold text-gray-900">Monica G.</p>
              <p className="text-xs text-gray-600">Mom of 16-year-old daughter</p>
            </div>
          </div>
        </div>
      </div>

      {/* Consultation CTA Section - Replaces Old Signup Form */}
      <div className="py-16 bg-gradient-to-br from-[#6D469B] to-[#EF597B] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Take the Next Step
            </h2>
            <p className="text-xl mb-6 opacity-95">
              Schedule Your FREE Consultation
            </p>
            <p className="text-lg opacity-90 max-w-2xl mx-auto leading-relaxed">
              Meet with an Optio teacher to discuss your family's unique situation. No pressure, no commitment—just a conversation about what's possible.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl border-2 border-white/20 p-6 sm:p-8 mb-8">
            <h3 className="text-xl font-bold mb-4 text-center">What to Expect:</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span>30-minute video call with a licensed teacher</span>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span>Discussion of your child's interests and your concerns</span>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span>Overview of how Optio could work for your family</span>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                <span>Answers to all your questions</span>
              </div>
            </div>
          </div>

          <div className="text-center">
            <Link
              to="/consultation"
              className="inline-flex items-center bg-white text-[#6D469B] hover:bg-gray-100 px-8 py-4 rounded-lg font-bold text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all"
            >
              <Users className="mr-2 w-5 h-5" />
              Book Your Free Consultation
            </Link>

            <p className="text-sm opacity-90 mt-6">
              Questions? Email <a href="mailto:support@optioeducation.com" className="underline hover:no-underline">support@optioeducation.com</a>
            </p>
          </div>
        </div>
      </div>

      {/* Our Philosophy Section */}
      <PhilosophySection onPhilosophyModalOpen={() => setPhilosophyModalOpen(true)} />
      {/* Simplified Pricing with Modal */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Simple Pricing</h2>
            <p className="text-lg text-gray-700">
              Start free. Upgrade when ready.
            </p>
          </div>

          {tiersLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
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
                          ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b]'
                          : tier.badge_color === 'green'
                          ? 'bg-green-500'
                          : 'bg-gray-500'
                      }`}>
                        {tier.badge_text}
                      </span>
                    </div>
                  )}
                  <h3 className="text-2xl font-bold mb-2">{tier.display_name}</h3>
                  <p className="text-3xl font-bold mb-1">{formatPrice(tier.price_monthly)}<span className="text-lg font-normal text-gray-600">/mo</span></p>
                  <p className="text-gray-600 mb-6">{tier.description}</p>
                  <div className="flex-grow">
                    {tier.features?.slice(0, 2).map((feature, index) => (
                      <p key={index} className={`mb-4 ${feature.toLowerCase().includes('diploma') ? 'text-gray-700 font-semibold' : 'text-gray-700'}`}>
                        ✓ {feature}
                      </p>
                    ))}
                  </div>
                  <Link
                    to="/register"
                    className={`block w-full py-3 px-6 rounded-lg font-bold transition-all text-center ${
                      tier.tier_key === 'Explore'
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg'
                    }`}
                  >
                    {tier.tier_key === 'Explore' ? 'Start Free' : `Get ${tier.display_name}`}
                  </Link>
                </div>
              ))}
            </div>
          )}

          {/* View full details button */}
          <div className="text-center mt-8">
            <button
              onClick={() => setPricingModalOpen(true)}
              className="inline-flex items-center text-[#ef597b] hover:text-[#e54469] font-medium"
            >
              <Info className="mr-2 w-4 h-4" aria-hidden="true" />
              View Full Feature Comparison
            </button>
          </div>
        </div>
      </div>

      {/* FAQ Section - Teacher-Partnership Focus */}
      <div className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF] rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                What does a dedicated teacher actually do?
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Your dedicated teacher is a licensed educator who becomes a non-parent adult invested in your child's education. They work WITH you as a partner, providing experienced guidance, answering questions, and keeping momentum going. They can provide daily support, check-ins, and be the person who generally keeps everything moving forward. Your teacher is there to support your family's learning journey with professional insight and encouragement.
              </p>
            </div>

            <div className="bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF] rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                How much control do I have over my child's education?
              </h3>
              <p className="text-gray-700 leading-relaxed">
                You maintain complete control over your family's learning vision and approach. Your teacher is there to support, not impose. Together, you'll find your family's natural learning rhythm without requirements or hurdles. The teacher's role is guidance and professional support, not gatekeeping.
              </p>
            </div>

            <div className="bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF] rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                How often do we meet with our teacher?
              </h3>
              <p className="text-gray-700 leading-relaxed">
                That's up to your family! Options range from weekly check-ins for more support to monthly touchpoints for more independent families. Your teacher works around your schedule and needs. It's flexible by design.
              </p>
            </div>

            <div className="bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF] rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                Is this accredited?
              </h3>
              <p className="text-gray-700 leading-relaxed">
                For families pursuing the diploma pathway, yes. Optio provides fully accredited high school diplomas. However, the teacher's primary focus is supporting meaningful learning, not just checking boxes for certification. The accreditation is there when you need it, but it's not the driving force.
              </p>
            </div>

            <div className="bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF] rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                What if we're already homeschooling?
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Perfect! Many Optio families are already homeschooling and use our teachers as professional support to enhance what they're already doing. Your teacher can offer guidance, provide accountability, and bring the expertise you've been looking for.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA - Consultation Focused */}
      <div className="py-16 bg-gradient-to-br from-[#F3EFF4] to-[#EEEBEF]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900">Ready to Talk?</h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Connect with an Optio teacher to explore how we can support your family's learning journey.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                to="/consultation"
                className="bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white hover:shadow-lg text-lg px-8 py-4 rounded-lg font-bold transition-all inline-flex items-center transform hover:scale-105"
              >
                <Users className="mr-2 w-5 h-5" aria-hidden="true" />
                Schedule Consultation
              </Link>
              <Link
                to="/demo"
                className="bg-white border-2 border-[#6D469B] text-[#6D469B] hover:bg-[#6D469B] hover:text-white text-lg px-8 py-4 rounded-lg font-bold transition-all inline-flex items-center"
              >
                <Play className="mr-2 w-5 h-5" aria-hidden="true" />
                Try Demo First
              </Link>
            </div>
          </div>
        </div>
      </div>


      {/* Pricing Details Modal */}
      {pricingModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold">Full Feature Comparison</h3>
              <button
                onClick={() => setPricingModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close modal"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {/* 3-Column Comparison Chart */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border-b-2 border-gray-200 p-4 text-left font-semibold text-gray-700">Features</th>
                    {tiers?.slice(0, 4).map((tier) => (
                      <th
                        key={tier.id}
                        className={`border-b-2 border-gray-200 p-4 text-center ${
                          tier.badge_color === 'gradient' ? 'bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5' : ''
                        }`}
                      >
                        <div className={`font-bold text-xl ${
                          tier.badge_color === 'gradient' ? 'text-[#ef597b]' : tier.badge_color === 'green' ? 'text-green-600' : ''
                        }`}>
                          {tier.display_name}
                        </div>
                        <div className="text-2xl font-bold mt-1">{formatPrice(tier.price_monthly)}</div>
                        <div className="text-sm text-gray-600">
                          {tier.tier_key === 'Explore' ? 'Forever' : 'per month'}
                        </div>
                        {tier.badge_text && (
                          <div className="mt-2">
                            <span className={`text-white text-xs px-3 py-1 rounded-full font-semibold ${
                              tier.badge_color === 'gradient'
                                ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b]'
                                : tier.badge_color === 'green'
                                ? 'bg-green-500'
                                : 'bg-gray-500'
                            }`}>
                              {tier.badge_text}
                            </span>
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Core Features */}
                  <tr className="border-b border-gray-100">
                    <td colSpan="5" className="bg-gray-50 p-3 font-semibold text-gray-700">Core Features</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Access to Quest Library</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Track Learning Progress</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Submit Evidence for Quests</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Earn XP & Skill Badges</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700 font-semibold">Optio Portfolio Diploma</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold text-lg bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold text-lg">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold text-lg">✓</td>
                  </tr>

                  {/* Support & Community */}
                  <tr className="border-b border-gray-100">
                    <td colSpan="5" className="bg-gray-50 p-3 font-semibold text-gray-700">Support & Community</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Community Forum Access</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Educator Support Team</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Team Learning & XP Bonuses</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Custom Quest Submissions</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>

                  {/* Top Tier Exclusive */}
                  <tr className="border-b border-gray-100">
                    <td colSpan="5" className="bg-gray-50 p-3 font-semibold text-gray-700">Top Tier Exclusive Features</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700 font-semibold">Accredited High School Diploma</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-gray-400 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">—</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold text-lg">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">1-on-1 Licensed Teachers</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-gray-400 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">—</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Personal Learning Guide</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-gray-400 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">—</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Weekly Check-ins</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-gray-400 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">—</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Business Mentor Network</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-gray-400 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">—</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">College Counseling</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-gray-400 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">—</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Official Transcripts</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-gray-400 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">—</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                to="/register"
                className="block w-full bg-gray-100 text-gray-700 hover:bg-gray-200 py-3 px-6 rounded-lg font-semibold transition-colors text-center"
              >
                Start Free
              </Link>
              <Link
                to="/register"
                className="block w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-3 px-6 rounded-lg font-bold transition-all text-center transform hover:scale-105"
              >
                Get Supported
              </Link>
              <Link
                to="/register"
                className="block w-full bg-green-500 text-white hover:bg-green-600 py-3 px-6 rounded-lg font-bold transition-colors text-center"
              >
                Join Academy
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Philosophy Details Modal */}
      {philosophyModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold">Our Philosophy: The Process Is The Goal</h3>
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
                <p className="text-lg font-semibold text-gray-800 mb-2">Core Belief</p>
                <p className="text-gray-700">
                  Learning is not about reaching a destination or impressing others. It's about who you become through the journey of discovery, creation, and growth. Every quest, every piece of evidence is valuable because of what it teaches you RIGHT NOW, not what it might prove later.
                </p>
              </div>
              
              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#ef597b]">Present-Focused Value</h4>
                <p className="text-gray-700 mb-3">
                  We don't say "This will help you in the future." We say "This is helping you grow right now."
                </p>
                <p className="text-gray-700">
                  Your learning matters today. Each skill you build, each idea you explore, each creation you make enriches your life in this moment. The value isn't postponed to some future job or college application – it's immediate and real.
                </p>
              </div>
              
              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#6d469b]">Internal Motivation Over External Validation</h4>
                <p className="text-gray-700 mb-3">
                  The platform celebrates personal growth, curiosity, and creation for its own sake. We focus on how learning FEELS, not how it LOOKS.
                </p>
                <ul className="space-y-2 text-gray-700">
                  <li>• "You're discovering what you're capable of" (not "proving your capabilities")</li>
                  <li>• "Your creativity is flourishing" (not "showcasing your creativity")</li>
                  <li>• "You're becoming more yourself" (not "standing out from others")</li>
                </ul>
              </div>
              
              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#ef597b]">Process Celebration</h4>
                <p className="text-gray-700">
                  Every step is valuable. We celebrate attempts, effort, and learning from mistakes as much as completion. Mistakes are expected and celebrated. Your consistency is beautiful. You're in a learning flow state.
                </p>
              </div>
              
              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#6d469b]">What This Means For You</h4>
                <ul className="space-y-3 text-gray-700">
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
              <p className="text-sm text-blue-800">
                <strong>Remember:</strong> You're already enough. You're growing at the perfect pace. You're creating something meaningful. The diploma is not the goal – it's the beautiful byproduct of a meaningful learning journey.
              </p>
            </div>
            
            <div className="mt-6 flex justify-center">
              <Link
                to="/demo"
                className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all"
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