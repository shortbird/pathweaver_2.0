import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import { RevealSection, RevealItem } from '../../components/marketing/RevealSection'
import { useSectionView, useCtaTracker } from '../../components/marketing/useMarketingAnalytics'
import ContactInfoModal from '../../components/ContactInfoModal'

const PAGE = 'for_families'

const IMAGES = {
  hero: 'https://images.pexels.com/photos/4260325/pexels-photo-4260325.jpeg?auto=compress&cs=tinysrgb&w=1920',
  journal: 'https://images.pexels.com/photos/4145354/pexels-photo-4145354.jpeg?auto=compress&cs=tinysrgb&w=800',
  portfolio: 'https://images.pexels.com/photos/8499491/pexels-photo-8499491.jpeg?auto=compress&cs=tinysrgb&w=800',
  observer: 'https://images.pexels.com/photos/3768131/pexels-photo-3768131.jpeg?auto=compress&cs=tinysrgb&w=800',
}

const CheckIcon = () => (
  <svg className="w-5 h-5 text-optio-purple flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const ForFamiliesPage = () => {
  const [contactOpen, setContactOpen] = useState(false)
  const trackCta = useCtaTracker(PAGE)

  const heroRef = useSectionView('hero', PAGE)
  const problemRef = useSectionView('problem', PAGE)
  const featuresRef = useSectionView('features', PAGE)
  const observerRef = useSectionView('observer_access', PAGE)
  const diplomaRef = useSectionView('diploma', PAGE)
  const testimonialRef = useSectionView('testimonial', PAGE)
  const ctaRef = useSectionView('final_cta', PAGE)

  return (
    <MarketingLayout>
      <Helmet>
        <title>For Families | Optio Education</title>
        <meta name="description" content="One hub for your homeschool. Track every curriculum, class, and learning experience. Build portfolios automatically. Official diploma pathway." />
        <meta property="og:title" content="For Families | Optio Education" />
        <meta property="og:description" content="The homeschool platform that tracks learning, builds portfolios, and provides an official diploma pathway." />
        <meta property="og:url" content="https://www.optioeducation.com/for-families" />
        <link rel="canonical" href="https://www.optioeducation.com/for-families" />
      </Helmet>

      {/* ========== HERO ========== */}
      <section ref={heroRef} className="relative overflow-hidden min-h-[55vh] flex items-center">
        <div className="absolute inset-0">
          <img src={IMAGES.hero} alt="" className="w-full h-full object-cover" style={{ objectPosition: 'center 30%' }} />
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
              One Hub For Your Homeschool
            </h1>
            <p
              className="text-lg sm:text-xl text-white/90 mb-8 leading-relaxed text-center sm:text-left"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              Track every curriculum, class, and learning experience in one place. Build portfolios automatically. Earn official credentials.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center sm:justify-start">
              <Link
                to="/register"
                onClick={() => trackCta('hero_get_started')}
                className="bg-white text-optio-pink hover:bg-gray-100 text-base sm:text-lg px-6 py-3 sm:px-8 sm:py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center justify-center font-bold"
                style={{ fontFamily: 'Poppins' }}
              >
                Start Free
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
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

      {/* ========== THE PROBLEM ========== */}
      <section ref={problemRef} className="py-16 sm:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-12">
              <h2
                className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Sound Familiar?
              </h2>
            </div>
          </RevealSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { problem: 'Spreadsheets everywhere', detail: 'Different tracker for every kid, every subject, every requirement' },
              { problem: 'No proof of learning', detail: 'All this incredible work and nothing to show colleges or employers' },
              { problem: 'Accreditation is complicated', detail: 'Umbrella schools, co-ops, online programs... which ones are legit?' },
              { problem: 'Family wants to see progress', detail: 'Grandparents ask what the kids are learning and you have no easy answer' },
              { problem: 'Curriculum juggling', detail: 'Khan Academy for math, co-op for science, life for everything else' },
              { problem: 'Diploma uncertainty', detail: "Will your homeschool diploma actually be recognized?" },
            ].map((item, i) => (
              <RevealItem key={i} index={i}>
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                  <p className="font-semibold text-gray-800 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>{item.problem}</p>
                  <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.detail}</p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== OPTIO FIXES THAT ========== */}
      <section ref={featuresRef} className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-14">
              <h2
                className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Optio Brings It All Together
              </h2>
              <p
                className="text-lg text-gray-600 max-w-2xl mx-auto"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                One platform for tracking, portfolios, and credentials.
              </p>
            </div>
          </RevealSection>

          {/* Feature 1: Learning Journal */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16 sm:mb-20">
            <RevealSection>
              <img src={IMAGES.journal} alt="Student journaling" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
            </RevealSection>
            <RevealSection delay={200}>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Capture Every Learning Moment
              </h3>
              <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                The Learning Journal makes it easy to document spontaneous learning -- a nature walk, a cooking experiment, a deep conversation. Quick entries that add up to a complete picture.
              </p>
              <div className="space-y-3">
                {[
                  'Quick capture from your phone or desktop',
                  'Organize into topics that evolve into quests',
                  'Attach photos, videos, and files as evidence',
                  'Connect any curriculum or outside class',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckIcon />
                    <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
          </div>

          {/* Feature 2: Automatic Portfolio */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16 sm:mb-20">
            <RevealSection delay={200} className="order-2 lg:order-1">
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Portfolios That Build Themselves
              </h3>
              <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                As students complete quests and journal their learning, their work automatically flows into a professional portfolio. No manual uploading, no extra steps.
              </p>
              <div className="space-y-3">
                {[
                  'Social media-style activity feed of learning',
                  'Evidence of real projects, not just grades',
                  'Share with colleges, employers, or family',
                  'Parent controls who can view',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckIcon />
                    <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
            <RevealSection className="order-1 lg:order-2">
              <img src={IMAGES.portfolio} alt="Student portfolio" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ========== OBSERVER ACCESS + BOUNTIES ========== */}
      <section ref={observerRef} className="py-16 sm:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <RevealSection>
              <img src={IMAGES.observer} alt="Family supporting student" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
            </RevealSection>
            <RevealSection delay={200}>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                The Whole Family Can Participate
              </h3>
              <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Invite grandparents, mentors, and trusted adults as Observers. They can follow along, cheer progress, and even post Bounties -- real-world tasks that earn XP.
              </p>
              <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-xl p-5 border border-optio-purple/15 mb-6">
                <p className="font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
                  Example Bounty
                </p>
                <p className="text-gray-600 text-sm" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Grandma posts a bounty: "Help me organize my photo albums." Only available to her grandkids. They earn XP for completing it -- and Grandma gets help.
                </p>
              </div>
              <div className="space-y-3">
                {[
                  'Parents control who has observer access',
                  'Observers see the activity feed, not admin tools',
                  'Bounties turn real-world help into learning XP',
                  'Transforms education into a shared family experience',
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

      {/* ========== DIPLOMA PATH ========== */}
      <section ref={diplomaRef} className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <RevealSection>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              An Official Diploma Path
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              The same WASC-accredited pathway that our partner schools use. Real credentials that colleges and employers recognize.
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { title: 'Individual Credits', desc: 'Take specific classes and transfer credit to your current school. $249 per credit.', icon: '1' },
              { title: 'Full-Time Diploma', desc: 'Self-direct your entire education through Optio Academy with a dedicated teacher.', icon: '2' },
              { title: 'Dual Enrollment', desc: 'Earn college credit while completing high school requirements. Save thousands on tuition.', icon: '3' },
            ].map((item, i) => (
              <RevealItem key={item.title} index={i}>
                <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm h-full">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center text-lg font-bold mx-auto mb-4">
                    {item.icon}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>{item.title}</h3>
                  <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== TESTIMONIAL ========== */}
      <section ref={testimonialRef} className="py-16 sm:py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-2xl p-8 sm:p-10 border border-optio-purple/10">
              <svg className="w-10 h-10 text-optio-purple/30 mb-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151C7.563 6.068 6 8.789 6 11h4v10H0z" />
              </svg>
              <p className="text-lg sm:text-xl text-gray-700 italic mb-6 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                "My husband and I feel like Optio was created just for us. We homeschool our 7 kids and this is the perfect platform to track all the unique types of learning we do in our family."
              </p>
              <div>
                <p className="font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Paige H.</p>
                <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Homeschool Parent, Utah</p>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== FINAL CTA ========== */}
      <section ref={ctaRef} className="py-16 sm:py-20 bg-gradient-to-r from-optio-purple to-optio-pink">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            Your Family's Learning, All in One Place
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            Start free. No credit card required. Upgrade to credentials when you're ready.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/register"
              onClick={() => trackCta('final_get_started')}
              className="bg-white text-optio-pink hover:bg-gray-100 px-8 py-4 rounded-lg font-bold text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all inline-flex items-center justify-center"
              style={{ fontFamily: 'Poppins' }}
            >
              Start Free
              <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <button
              onClick={() => { trackCta('final_get_info'); setContactOpen(true) }}
              className="bg-transparent border-2 border-white text-white hover:bg-white/10 px-8 py-4 rounded-lg font-bold text-lg transition-all inline-flex items-center justify-center"
              style={{ fontFamily: 'Poppins' }}
            >
              Get More Info
            </button>
          </div>
        </div>
      </section>

      <ContactInfoModal isOpen={contactOpen} onClose={() => setContactOpen(false)} contactType="demo" />
    </MarketingLayout>
  )
}

export default ForFamiliesPage
