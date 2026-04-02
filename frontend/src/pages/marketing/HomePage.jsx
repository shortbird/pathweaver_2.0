import React, { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useAuth } from '../../contexts/AuthContext'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import { RevealSection, RevealItem } from '../../components/marketing/RevealSection'
import { useSectionView, useCtaTracker } from '../../components/marketing/useMarketingAnalytics'

const HERO_IMAGE = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/homepage/hero_real.jpg'

const AUDIENCES = [
  {
    title: 'For Students',
    subtitle: 'A smarter way to do high school',
    description: 'Turn your interests into real high school credit. Self-directed learning with a dedicated teacher in your corner.',
    path: '/for-students',
    image: 'https://images.pexels.com/photos/8033875/pexels-photo-8033875.jpeg?auto=compress&cs=tinysrgb&w=600',
    color: 'from-blue-500 to-indigo-600',
  },
  {
    title: 'For Families',
    subtitle: 'One hub for your homeschool',
    description: 'Track every curriculum, class, and learning experience in one place. Everything flows into a professional portfolio.',
    path: '/for-families',
    image: 'https://images.pexels.com/photos/4260325/pexels-photo-4260325.jpeg?auto=compress&cs=tinysrgb&w=600',
    color: 'from-emerald-500 to-teal-600',
  },
  {
    title: 'For Schools',
    subtitle: 'Instant accreditation for your program',
    description: 'From 5-student microschools to 500+ student networks. Student management, parent portals, and official credentials from day one.',
    path: '/for-schools',
    image: 'https://images.pexels.com/photos/8613089/pexels-photo-8613089.jpeg?auto=compress&cs=tinysrgb&w=600',
    color: 'from-optio-purple to-optio-pink',
  },
]

const HIGHLIGHTS = [
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    title: 'Personalized Quests',
    text: 'Learning adventures built around real interests',
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    title: 'Automatic Portfolios',
    text: 'Student work captured as they learn, no extra steps',
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: 'Accredited Credentials',
    text: 'Official diplomas and transferable college credit',
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    title: 'Observer Access',
    text: 'Grandparents and mentors cheer progress and post bounties',
  },
]

const HomePage = () => {
  const { isAuthenticated, user, loading } = useAuth()
  const navigate = useNavigate()
  const trackCta = useCtaTracker('homepage')

  const heroRef = useSectionView('hero', 'homepage')
  const audienceRef = useSectionView('audience_cards', 'homepage')
  const highlightsRef = useSectionView('highlights', 'homepage')
  const ctaRef = useSectionView('final_cta', 'homepage')

  // Redirect authenticated users
  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      if (user.role === 'observer') navigate('/observer/feed')
      else if (user.role === 'superadmin' || user.role === 'parent') navigate('/parent/dashboard')
      else navigate('/dashboard')
    }
  }, [isAuthenticated, user, navigate, loading])

  return (
    <MarketingLayout>
      <Helmet>
        <title>Optio Education | Personalized Learning, Official Credentials</title>
        <meta name="description" content="Where self-directed learning meets accredited diplomas. For students, homeschool families, microschools, and learning communities." />
        <meta property="og:title" content="Optio Education | Personalized Learning, Official Credentials" />
        <meta property="og:description" content="Turn interests into real learning. Turn learning into official credentials. For students, families, and schools." />
        <meta property="og:url" content="https://www.optioeducation.com" />
        <link rel="canonical" href="https://www.optioeducation.com" />
      </Helmet>

      {/* ========== HERO ========== */}
      <section ref={heroRef} className="relative overflow-hidden min-h-[60vh] sm:min-h-[70vh] flex items-center">
        {/* Background */}
        <div className="absolute inset-0">
          <img src={HERO_IMAGE} alt="" className="w-full h-full object-cover" style={{ objectPosition: 'center 40%' }} />
          {/* Mobile overlay */}
          <div className="absolute inset-0 bg-optio-purple/70 sm:hidden" />
          {/* Desktop gradient overlay */}
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
              Personalized Learning.
            </h1>
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl mb-6 leading-tight text-center sm:text-left"
              style={{
                fontFamily: 'Poppins',
                fontWeight: 700,
                background: 'linear-gradient(180deg, #E7ABF3 0%, #BE84C9 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Official Credentials.
            </h2>
            <p
              className="text-lg sm:text-xl text-white/90 mb-8 leading-relaxed text-center sm:text-left"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              Where self-directed learning meets accredited diplomas. For students, families, and schools.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center sm:justify-start">
              <Link
                to="/how-it-works"
                onClick={() => trackCta('hero_how_it_works')}
                className="bg-white text-optio-pink hover:bg-gray-100 text-base sm:text-lg px-6 py-3 sm:px-8 sm:py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center justify-center font-bold"
                style={{ fontFamily: 'Poppins' }}
              >
                See How It Works
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link
                to="/register"
                onClick={() => trackCta('hero_get_started')}
                className="bg-transparent border-2 border-white text-white hover:bg-white/10 text-base sm:text-lg px-6 py-3 sm:px-8 sm:py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center justify-center font-semibold"
                style={{ fontFamily: 'Poppins' }}
              >
                Get Started Free
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========== HIGHLIGHTS BAR ========== */}
      <section ref={highlightsRef} className="py-12 sm:py-16 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            {HIGHLIGHTS.map((item, i) => (
              <RevealItem key={item.title} index={i}>
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 text-optio-purple mb-3">
                    {item.icon}
                  </div>
                  <h3
                    className="text-base sm:text-lg font-bold text-gray-900 mb-1"
                    style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                  >
                    {item.title}
                  </h3>
                  <p
                    className="text-sm text-gray-600"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    {item.text}
                  </p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== WHO IS OPTIO FOR? (Audience Cards) ========== */}
      <section ref={audienceRef} className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-12 sm:mb-16">
              <h2
                className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Who Is Optio For?
              </h2>
              <p
                className="text-lg text-gray-600 max-w-2xl mx-auto"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                One platform, built for every kind of learner and learning community.
              </p>
            </div>
          </RevealSection>

          <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
            {AUDIENCES.map((audience, i) => (
              <RevealItem key={audience.path} index={i}>
                <Link
                  to={audience.path}
                  onClick={() => trackCta('audience_card', { audience: audience.title })}
                  className="group block rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="relative h-48 sm:h-56 overflow-hidden">
                    <img
                      src={audience.image}
                      alt={audience.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className={`absolute inset-0 bg-gradient-to-t ${audience.color} opacity-60 group-hover:opacity-50 transition-opacity`} />
                    <div className="absolute bottom-0 left-0 right-0 p-6">
                      <h3
                        className="text-2xl font-bold text-white mb-1"
                        style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                      >
                        {audience.title}
                      </h3>
                      <p
                        className="text-white/90 text-sm font-medium"
                        style={{ fontFamily: 'Poppins' }}
                      >
                        {audience.subtitle}
                      </p>
                    </div>
                  </div>
                  <div className="p-6">
                    <p
                      className="text-gray-600 mb-4"
                      style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                    >
                      {audience.description}
                    </p>
                    <span
                      className="inline-flex items-center text-optio-purple font-semibold text-sm group-hover:gap-2 transition-all"
                      style={{ fontFamily: 'Poppins' }}
                    >
                      Learn more
                      <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </span>
                  </div>
                </Link>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== SOCIAL PROOF / STATS ========== */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
              {[
                { stat: 'WASC', label: 'Accredited' },
                { stat: '5', label: 'Learning Pillars' },
                { stat: '100%', label: 'Personalized' },
                { stat: 'Free', label: 'To Start' },
              ].map((item) => (
                <div key={item.label}>
                  <p
                    className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-transparent"
                    style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                  >
                    {item.stat}
                  </p>
                  <p
                    className="text-sm text-gray-500 mt-1"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== HOW IT WORKS TEASER ========== */}
      <section className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <RevealSection>
            <h2
              className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              How Does It Work?
            </h2>
            <p
              className="text-lg text-gray-600 max-w-2xl mx-auto mb-10"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              Students pursue interests through personalized quests. Their work becomes a portfolio. Family and mentors cheer them on.
            </p>
          </RevealSection>

          <div className="grid sm:grid-cols-3 gap-6 mb-10">
            {[
              { step: '1', title: 'Learn Through Quests', desc: 'Personalized adventures built around real interests' },
              { step: '2', title: 'Build a Portfolio', desc: 'Work is automatically captured and organized' },
              { step: '3', title: 'Earn Credentials', desc: 'Official transcripts and accredited diplomas' },
            ].map((item, i) => (
              <RevealItem key={item.step} index={i}>
                <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center text-lg font-bold mx-auto mb-4">
                    {item.step}
                  </div>
                  <h3
                    className="text-lg font-bold text-gray-900 mb-2"
                    style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                  >
                    {item.title}
                  </h3>
                  <p
                    className="text-sm text-gray-600"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    {item.desc}
                  </p>
                </div>
              </RevealItem>
            ))}
          </div>

          <RevealSection delay={300}>
            <Link
              to="/how-it-works"
              onClick={() => trackCta('how_it_works_teaser')}
              className="inline-flex items-center justify-center bg-gradient-to-r from-optio-purple to-optio-pink text-white px-8 py-4 rounded-lg font-bold text-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
              style={{ fontFamily: 'Poppins' }}
            >
              Explore the Full Platform
              <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </RevealSection>
        </div>
      </section>

      {/* ========== FINAL CTA ========== */}
      <section ref={ctaRef} className="py-16 sm:py-20 bg-gradient-to-r from-optio-purple to-optio-pink">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2
            className="text-3xl sm:text-4xl font-bold text-white mb-4"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Ready to Transform Learning?
          </h2>
          <p
            className="text-xl text-white/90 mb-8 max-w-2xl mx-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Join families and schools proving that personalized education can be official.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/register"
              onClick={() => trackCta('final_get_started')}
              className="bg-white text-optio-pink hover:bg-gray-100 px-8 py-4 rounded-lg font-bold text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all inline-flex items-center justify-center"
              style={{ fontFamily: 'Poppins' }}
            >
              Get Started Free
              <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <Link
              to="/how-it-works"
              onClick={() => trackCta('final_how_it_works')}
              className="bg-transparent border-2 border-white text-white hover:bg-white/10 px-8 py-4 rounded-lg font-bold text-lg transition-all inline-flex items-center justify-center"
              style={{ fontFamily: 'Poppins' }}
            >
              See How It Works
            </Link>
          </div>
          <p
            className="text-white/70 text-sm mt-8"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Questions? Email{' '}
            <a href="mailto:support@optioeducation.com" className="underline hover:no-underline text-white/90">
              support@optioeducation.com
            </a>
          </p>
        </div>
      </section>
    </MarketingLayout>
  )
}

export default HomePage
