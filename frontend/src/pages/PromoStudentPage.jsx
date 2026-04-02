import React, { useState, useEffect, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import api from '../services/api'
import { captureEvent } from '../services/posthog'
import MarketingLayout from '../components/marketing/MarketingLayout'

// Scroll animation hook
const useScrollReveal = () => {
  const ref = useRef(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(el)
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, isVisible }
}

// Wrapper component for animated sections
const RevealSection = ({ children, className = '', delay = 0 }) => {
  const { ref, isVisible } = useScrollReveal()

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-8'
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

// Staggered children animation
const RevealItem = ({ children, index = 0 }) => {
  const { ref, isVisible } = useScrollReveal()

  return (
    <div
      ref={ref}
      className={`transition-all duration-500 ease-out ${
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-6'
      }`}
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      {children}
    </div>
  )
}


const CheckIcon = () => (
  <svg className="w-5 h-5 text-optio-purple flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const TransferGuarantee = () => (
  <div className="bg-green-50 border border-green-200 rounded-xl px-6 py-4 flex flex-col items-center gap-1 text-center max-w-md mx-auto">
    <div className="flex items-center gap-2">
      <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
      <span className="font-bold text-gray-900 text-lg">Transfer Guarantee</span>
    </div>
    <p className="text-sm text-gray-600">Receive a full refund if your school won't accept the credit.</p>
  </div>
)

const IMAGES = {
  hero: 'https://images.pexels.com/photos/8033875/pexels-photo-8033875.jpeg?auto=compress&cs=tinysrgb&w=1920',
  pick: 'https://images.pexels.com/photos/5428012/pexels-photo-5428012.jpeg?auto=compress&cs=tinysrgb&w=600',
  learn: 'https://images.pexels.com/photos/4145354/pexels-photo-4145354.jpeg?auto=compress&cs=tinysrgb&w=600',
  transfer: 'https://images.pexels.com/photos/7942464/pexels-photo-7942464.jpeg?auto=compress&cs=tinysrgb&w=600',
  social: 'https://images.pexels.com/photos/8499491/pexels-photo-8499491.jpeg?auto=compress&cs=tinysrgb&w=800',
  different: 'https://images.pexels.com/photos/4145190/pexels-photo-4145190.jpeg?auto=compress&cs=tinysrgb&w=800',
  boring: 'https://images.pexels.com/photos/8233483/pexels-photo-8233483.jpeg?auto=compress&cs=tinysrgb&w=800',
  adventure: 'https://images.pexels.com/photos/5036773/pexels-photo-5036773.jpeg?auto=compress&cs=tinysrgb&w=800',
}

const CREDIT_EXAMPLES = [
  {
    img: 'https://images.pexels.com/photos/10222167/pexels-photo-10222167.jpeg?auto=compress&cs=tinysrgb&w=600',
    activity: 'Piano lessons',
    credit: 'Music credit',
    howItWorks: 'Your private piano lessons become the foundation of a personalized music course. You study music theory alongside your playing and build a portfolio of recordings and reflections that demonstrate real musical growth.',
    example: 'You could perform in recitals, study music history through the composers you\'re learning, and submit recordings as coursework evidence.',
  },
  {
    img: 'https://images.pexels.com/photos/28887298/pexels-photo-28887298.jpeg?auto=compress&cs=tinysrgb&w=600',
    activity: 'Community sports',
    credit: 'PE credit',
    howItWorks: 'Your club or rec league season becomes a structured PE course. You track your training, games, and physical development, and add components like sports nutrition, injury prevention, or coaching principles to round out the credit.',
    example: 'You could log your practices and games, research sports nutrition for a project, and reflect on teamwork and leadership throughout your season.',
  },
  {
    img: 'https://images.pexels.com/photos/5622142/pexels-photo-5622142.jpeg?auto=compress&cs=tinysrgb&w=600',
    activity: 'Summer camp',
    credit: 'Science credit',
    howItWorks: 'Outdoor and nature-based camp experiences become the starting point for a science course. You turn activities like hiking, wildlife observation, or survival skills into structured learning through research projects, field journals, and scientific analysis.',
    example: 'You could keep a field journal documenting local ecosystems, research water purification methods, and present your findings on forest ecology.',
  },
  {
    img: 'https://images.pexels.com/photos/33029254/pexels-photo-33029254.jpeg?auto=compress&cs=tinysrgb&w=600',
    activity: 'Art classes',
    credit: 'Fine arts credit',
    howItWorks: 'Your existing art practice or classes become the core of a fine arts course. You build a portfolio, study art history connected to your medium, and develop a personal artist statement. The work you\'re already doing gets the academic structure it deserves.',
    example: 'You could build a 12-piece portfolio, study the artists who inspire your style, and write critical analyses of your own work.',
  },
  {
    img: 'https://images.pexels.com/photos/4709289/pexels-photo-4709289.jpeg?auto=compress&cs=tinysrgb&w=600',
    activity: 'Coding projects',
    credit: 'Technology credit',
    howItWorks: 'Your coding projects and self-taught tech skills become a structured technology course. You document your development process, learn industry best practices, and build a project portfolio that demonstrates real technical ability.',
    example: 'You could document your code and design decisions, build a project portfolio, and study cybersecurity fundamentals alongside your development work.',
  },
  {
    img: 'https://images.pexels.com/photos/36713504/pexels-photo-36713504.jpeg?auto=compress&cs=tinysrgb&w=600',
    activity: 'Volunteer work',
    credit: 'Civics credit',
    howItWorks: 'Your volunteer work and community involvement become a civics or social studies course. You connect your service to broader topics like local government, social issues, or community organizing, turning hands-on experience into academic credit.',
    example: 'You could research food insecurity in your county, interview local organizers, and propose solutions in a final presentation.',
  },
]

const PromoStudentPage = () => {
  const [form, setForm] = useState({ name: '', email: '', classes_interested: '', state: '', interest_individual: false, interest_fulltime: false })
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedExample, setSelectedExample] = useState(null)
  const [showGuarantee, setShowGuarantee] = useState(false)
  const [showUFA, setShowUFA] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const interests = [
        form.interest_individual && 'Individual Classes',
        form.interest_fulltime && 'Full-Time (Optio Academy)',
      ].filter(Boolean).join(', ')

      const details = [
        interests,
        form.classes_interested && `Classes: ${form.classes_interested}`,
        form.state && `State: ${form.state}`,
      ].filter(Boolean).join(' | ')

      await api.post('/api/promo/interest', {
        name: form.name,
        email: form.email,
        classes_interested: details || null,
        source: 'for-students',
      })
      setSubmitted(true)
      captureEvent('promo_form_submitted', {
        interest_individual: form.interest_individual,
        interest_fulltime: form.interest_fulltime,
        has_classes: !!form.classes_interested,
        has_state: !!form.state,
      })
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <MarketingLayout>
      <Helmet>
        <title>Take Classes Your Way | Optio Education</title>
        <meta name="description" content="Self-directed accredited high school classes with teacher support. Transfer credits to your school. WASC accredited. $249 per credit." />
        <meta property="og:title" content="Take Classes Your Way | Optio Education" />
        <meta property="og:description" content="Self-directed learning with teacher support. Translate your interests into high school credit. WASC accredited, transfer guaranteed." />
        <meta property="og:url" content="https://www.optioeducation.com/for-students" />
        <link rel="canonical" href="https://www.optioeducation.com/for-students" />
        <style>{`html { scroll-behavior: smooth; }`}</style>
      </Helmet>

      <div className="min-h-screen bg-white">

        {/* ========== 1. HERO ========== */}
        <div className="relative overflow-hidden min-h-[55vh] flex items-center">
          <div className="absolute inset-0">
            <img src={IMAGES.hero} alt="" className="w-full h-full object-cover" style={{ objectPosition: 'center 65%' }} />
            <div className="absolute inset-0 bg-optio-purple/70 sm:bg-transparent sm:bg-gradient-to-r sm:from-optio-purple/90 sm:via-optio-purple-dark/80 sm:to-optio-pink/70" />
          </div>
          <div className="relative max-w-5xl mx-auto px-4 py-16 sm:py-20 text-center text-white">
            <img
              src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png"
              alt="Optio Education"
              className="h-10 sm:h-12 mx-auto mb-6 brightness-0 invert"
            />
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 leading-tight">
              A Smarter Way to Do High School
            </h1>
            <p className="text-lg sm:text-xl text-white/85 max-w-2xl mx-auto leading-relaxed mb-8">
              Self-directed learning with a dedicated teacher in your corner. Translate your interests into real high school credit.
            </p>
            <a
              href="#get-info"
              className="inline-block bg-white text-optio-purple font-semibold px-8 py-3 rounded-full text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
            >
              Get More Info
            </a>
          </div>
        </div>

        {/* ========== 2. GET CREDIT FOR WHAT YOU ALREADY DO ========== */}
        <section className="py-16 sm:py-20 px-4 bg-white">
          <div className="max-w-5xl mx-auto text-center">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
                Get Credit for What You Already Do
              </h2>
              <p className="text-gray-500 mb-12 max-w-2xl mx-auto text-lg">
                Already spending time on something you love? That could count toward your diploma.
              </p>
            </RevealSection>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 text-left">
              {CREDIT_EXAMPLES.map((item, i) => (
                <RevealItem key={item.activity} index={i}>
                  <button
                    onClick={() => { setSelectedExample(item); captureEvent('promo_credit_example_viewed', { activity: item.activity }) }}
                    className="w-full bg-white rounded-xl overflow-hidden border border-gray-100 text-left hover:shadow-card-hover hover:border-optio-purple/30 transition-all cursor-pointer group"
                  >
                    <div className="aspect-[16/9] overflow-hidden">
                      <img src={item.img} alt={item.activity} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                    <div className="p-4">
                      <p className="font-semibold text-gray-900">{item.activity}</p>
                      <p className="text-optio-purple font-medium text-sm mt-1">→ {item.credit}</p>
                      <p className="text-xs text-gray-400 mt-2">Click to see how it works</p>
                    </div>
                  </button>
                </RevealItem>
              ))}
            </div>
          </div>
        </section>

        {/* ========== 3. NOT YOUR TYPICAL ONLINE SCHOOL ========== */}
        <section className="py-16 sm:py-20 px-4 bg-gray-50">
          <div className="max-w-5xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <RevealSection className="hidden lg:block">
                <img
                  src={IMAGES.different}
                  alt="Student working on creative project"
                  className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover"
                />
              </RevealSection>
              <RevealSection delay={200}>
                <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6 text-center lg:text-left">
                  This Isn't Your Typical Online School
                </h2>
                <div className="space-y-3">
                  {[
                    'Coursework designed around your interests',
                    'A dedicated teacher available when you need guidance',
                    'Real-world projects, not videos + quizzes',
                    'Learn about topics that actually interest you',
                    'Work at your own pace. Accelerate if you want, or take your time.',
                    'No failing grades. You either earn an A or you\'re still working on it.',
                    'A portfolio record of all your learning you can share with friends and family',
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <CheckIcon />
                      <p className="text-gray-700">{item}</p>
                    </div>
                  ))}
                </div>
              </RevealSection>
            </div>
          </div>
        </section>

        {/* ========== 4. HOW IT WORKS + CREDIT TRANSFER ========== */}
        <section className="py-16 sm:py-20 px-4 bg-white">
          <div className="max-w-4xl mx-auto">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-3">
                How It Works
              </h2>
              <p className="text-center text-gray-500 mb-12">
                Four steps. You don't have to leave your school.
              </p>
            </RevealSection>

            {/* Step flow */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-14">
              {[
                { img: 'https://images.pexels.com/photos/8217192/pexels-photo-8217192.jpeg?auto=compress&cs=tinysrgb&w=400', label: 'Choose your class', sub: 'Pick any subject' },
                { img: 'https://images.pexels.com/photos/4145153/pexels-photo-4145153.jpeg?auto=compress&cs=tinysrgb&w=400', label: 'Meet your teacher', sub: 'Then self-direct your learning' },
                { img: 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/promo/wasc.png', label: 'We send your transcript', sub: 'Official WASC-accredited record', contain: true },
                { img: 'https://images.pexels.com/photos/5211472/pexels-photo-5211472.jpeg?auto=compress&cs=tinysrgb&w=400', label: 'Credit on your record', sub: 'Free up a period at school' },
              ].map(({ img, label, sub, contain }, i) => (
                <RevealItem key={label} index={i}>
                  <div className="text-center">
                    <div className="aspect-square overflow-hidden rounded-xl mb-3 bg-gray-100 flex items-center justify-center">
                      <img src={img} alt={label} className={contain ? 'max-w-[80%] max-h-[80%] object-contain' : 'w-full h-full object-cover'} />
                    </div>
                    <p className="font-semibold text-gray-900 text-sm">{label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
                  </div>
                </RevealItem>
              ))}
            </div>

            <RevealSection>
              <TransferGuarantee />
              <p className="text-center text-sm text-gray-500 mt-3">
                <a href="#get-info" className="text-optio-purple font-medium hover:underline">Claim your first credit free</a> below.
              </p>
            </RevealSection>
          </div>
        </section>

        {/* ========== 5. THE OPTIO DIFFERENCE / OPTIO FIXES THAT ========== */}
        <section className="py-16 sm:py-20 px-4 bg-gray-50">
          <div className="max-w-5xl mx-auto">

            <RevealSection>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-4 mb-14">
                <span className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">The</span>
                <img
                  src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png"
                  alt="Optio"
                  className="h-16 sm:h-16 md:h-15 sm:relative sm:-top-[5px]"
                />
                <span className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">Difference</span>
              </div>
            </RevealSection>

            <div className="grid lg:grid-cols-5 gap-8 items-center mb-16">
              <RevealSection className="lg:col-span-3">
                <h2 className="text-3xl sm:text-4xl font-bold text-gray-600 mb-6">Sound familiar?</h2>
                <img src={IMAGES.boring} alt="Bored student in classroom" className="w-full rounded-2xl shadow-lg grayscale object-cover aspect-[16/9] mb-6 lg:hidden" style={{ objectPosition: 'center 15%' }} />
                <div className="space-y-3">
                  {[
                    { problem: 'Sitting in class for 7 hours', detail: 'Even when you already get it' },
                    { problem: '30+ kids, 1 teacher', detail: 'No one knows how you learn best' },
                    { problem: 'Worksheets and busy work', detail: 'Homework that teaches you nothing' },
                    { problem: 'Required classes you dread', detail: 'Stuck in a room watching the clock' },
                    { problem: 'Grades based on compliance', detail: 'Points for showing up, not learning' },
                  ].map(({ problem, detail }, i) => (
                    <div key={i} className="bg-white rounded-xl p-4 border border-gray-200">
                      <p className="font-semibold text-gray-700">{problem}</p>
                      <p className="text-sm text-gray-500 mt-1">{detail}</p>
                    </div>
                  ))}
                </div>
              </RevealSection>
              <RevealSection className="lg:col-span-2 hidden lg:block" delay={300}>
                <img src={IMAGES.boring} alt="Bored student in classroom" className="w-full rounded-2xl shadow-lg grayscale object-cover aspect-[3/4] object-top" />
              </RevealSection>
            </div>

            <div className="grid lg:grid-cols-5 gap-8 items-center">
              <RevealSection className="lg:col-span-2 hidden lg:block">
                <img src={IMAGES.adventure} alt="Teenagers on an adventure" className="w-full rounded-2xl shadow-lg object-cover aspect-[3/4]" style={{ objectPosition: 'center 90%' }} />
              </RevealSection>
              <RevealSection className="lg:col-span-3" delay={300}>
                <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">Optio fixes that.</h2>
                <img src={IMAGES.adventure} alt="Teenagers on an adventure" className="w-full rounded-2xl shadow-lg object-cover aspect-[16/9] mb-6 lg:hidden" style={{ objectPosition: 'center 80%' }} />
                <div className="space-y-3">
                  {[
                    { fix: 'Learn on your schedule', detail: 'Morning, night, weekends. You decide when.' },
                    { fix: 'A teacher in your corner', detail: 'They help get you started and are available to support you on your journey.' },
                    { fix: 'Real projects you choose', detail: 'Write about what interests you. Build things that matter.' },
                    { fix: 'Make any subject interesting', detail: 'Study history through film, learn English by writing about what you love.' },
                    { fix: 'Progress based on mastery', detail: 'Show what you know. Move on when you\'re ready.' },
                  ].map(({ fix, detail }, i) => (
                    <div key={i} className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-xl p-4 border border-optio-purple/15">
                      <p className="font-semibold text-gray-900">{fix}</p>
                      <p className="text-sm text-gray-600 mt-1">{detail}</p>
                    </div>
                  ))}
                </div>
              </RevealSection>
            </div>
          </div>
        </section>

        {/* ========== 8. OPTIO ACADEMY (FULL-TIME) ========== */}
        <section className="py-16 sm:py-20 px-4 bg-white">
          <div className="max-w-3xl mx-auto">
            <RevealSection>
              <div className="bg-white rounded-2xl p-8 sm:p-10 border border-gray-200 shadow-lg">
                <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-center text-gray-900">
                  Want to Go Full Time?
                </h2>
                <p className="text-gray-500 text-center max-w-xl mx-auto mb-6">
                  Optio Academy is our full-time diploma program. Work 1-on-1 with a dedicated teacher to self-direct your entire high school education through Optio.
                </p>
                <div className="bg-amber-50 rounded-xl p-5 border border-amber-200 max-w-md mx-auto text-center mb-6">
                  <p className="text-sm text-amber-700 font-semibold mb-1">Utah Students</p>
                  <p className="text-gray-600 text-sm">
                    Your full tuition could be covered by the Utah Fits All Scholarship program.
                  </p>
                </div>
                <div className="text-center">
                  <a
                    href="#get-info"
                    className="inline-block bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold px-8 py-3 rounded-full text-lg hover:opacity-90 transition-opacity"
                  >
                    Learn More
                  </a>
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        {/* ========== 9. PRICING ========== */}
        <section className="py-16 sm:py-20 px-4 bg-gray-50">
          <div className="max-w-5xl mx-auto">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3 text-center">
                Simple Pricing
              </h2>
              <p className="text-gray-500 mb-10 text-center">
                No hidden fees. No subscriptions.
              </p>
            </RevealSection>
            <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              {/* A-la-carte */}
              <RevealSection>
                <div className="bg-gradient-to-br from-optio-purple to-optio-pink rounded-2xl p-8 text-white shadow-xl h-full flex flex-col">
                  <div className="text-center mb-6 flex-1">
                    <p className="text-sm font-medium text-white/70 mb-3 uppercase tracking-wide">Individual Classes</p>
                    <p className="text-4xl sm:text-5xl font-bold">$249</p>
                    <p className="text-lg text-white/90 mt-1">per credit</p>
                    <p className="text-white/60 text-sm mt-2">1 credit = 1 full-year class</p>
                  </div>
                  <div className="space-y-2">
                    {[
                      'Dedicated teacher support',
                      'All course materials included',
                      'WASC-accredited transcript',
                      'Work at your own pace',
                    ].map((text) => (
                      <div key={text} className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-white/60 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <p className="text-sm text-white/85">{text}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => { setShowGuarantee(true); captureEvent('promo_guarantee_viewed') }}
                    className="mt-5 flex items-center justify-center gap-2 w-full bg-white/15 rounded-lg px-4 py-2.5 hover:bg-white/25 transition-colors cursor-pointer"
                  >
                    <svg className="w-5 h-5 text-green-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span className="text-sm font-semibold text-white">Transfer Guarantee</span>
                  </button>
                </div>
              </RevealSection>

              {/* Full-time */}
              <RevealSection delay={150}>
                <div className="bg-white rounded-2xl p-8 shadow-xl border border-gray-200 h-full flex flex-col">
                  <div className="text-center mb-6 flex-1">
                    <p className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">Optio Academy (Full Time)</p>
                    <p className="text-4xl sm:text-5xl font-bold text-gray-900">$8,000</p>
                    <p className="text-lg text-gray-500 mt-1">per year</p>
                    <p className="text-gray-400 text-sm mt-2">Full diploma program</p>
                  </div>
                  <div className="space-y-2">
                    {[
                      '1-on-1 dedicated teacher',
                      'Self-direct your entire education',
                      'All courses and materials',
                      'WASC-accredited diploma',
                    ].map((text) => (
                      <div key={text} className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-optio-purple flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <p className="text-sm text-gray-600">{text}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => { setShowUFA(true); captureEvent('promo_ufa_viewed') }}
                    className="mt-5 flex items-center justify-center gap-2 w-full bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 hover:bg-amber-100 transition-colors cursor-pointer"
                  >
                    <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-semibold text-amber-700">Utah Fits All may cover tuition</span>
                  </button>
                </div>
              </RevealSection>
            </div>
          </div>
        </section>

        {/* ========== 9. INTEREST FORM ========== */}
        <section id="get-info" className="py-16 sm:py-20 px-4 bg-gradient-to-br from-gray-900 to-gray-800 text-white scroll-mt-4">
          <div className="max-w-lg mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">
              Get Started
            </h2>
            <p className="text-gray-300 mb-8 text-lg">
              Drop your info and we'll reach out with everything you need, including a free credit code for your first class.
            </p>

            {submitted ? (
              <div className="bg-white/10 rounded-2xl p-8 backdrop-blur-sm">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold mb-2">You're in!</h3>
                <p className="text-gray-300">We'll be in touch soon with next steps and your free credit code.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 text-left">
                <div>
                  <label htmlFor="promo-name" className="block text-sm font-medium text-gray-300 mb-1">
                    Your Name
                  </label>
                  <input
                    id="promo-name"
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-optio-pink focus:border-transparent"
                    placeholder="First and last name"
                  />
                </div>
                <div>
                  <label htmlFor="promo-email" className="block text-sm font-medium text-gray-300 mb-1">
                    Email
                  </label>
                  <input
                    id="promo-email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-optio-pink focus:border-transparent"
                    placeholder="you@email.com"
                  />
                </div>
                <div>
                  <p className="block text-sm font-medium text-gray-300 mb-2">I'm interested in</p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <label
                      className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
                        form.interest_individual
                          ? 'bg-optio-purple/20 border-optio-purple text-white'
                          : 'bg-white/10 border-white/20 text-gray-300 hover:border-white/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.interest_individual}
                        onChange={(e) => setForm({ ...form, interest_individual: e.target.checked })}
                        className="sr-only"
                      />
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        form.interest_individual ? 'bg-optio-purple border-optio-purple' : 'border-white/40'
                      }`}>
                        {form.interest_individual && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">Individual Classes</p>
                        <p className="text-xs text-gray-400">Take specific classes, transfer credit</p>
                      </div>
                    </label>
                    <label
                      className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
                        form.interest_fulltime
                          ? 'bg-optio-purple/20 border-optio-purple text-white'
                          : 'bg-white/10 border-white/20 text-gray-300 hover:border-white/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.interest_fulltime}
                        onChange={(e) => setForm({ ...form, interest_fulltime: e.target.checked })}
                        className="sr-only"
                      />
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        form.interest_fulltime ? 'bg-optio-purple border-optio-purple' : 'border-white/40'
                      }`}>
                        {form.interest_fulltime && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">Full-Time Program</p>
                        <p className="text-xs text-gray-400">Optio Academy diploma</p>
                      </div>
                    </label>
                  </div>
                </div>

                {form.interest_individual && (
                  <div>
                    <label htmlFor="promo-classes" className="block text-sm font-medium text-gray-300 mb-1">
                      What classes are you interested in? <span className="text-gray-500">(optional)</span>
                    </label>
                    <input
                      id="promo-classes"
                      type="text"
                      value={form.classes_interested}
                      onChange={(e) => setForm({ ...form, classes_interested: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-optio-pink focus:border-transparent"
                      placeholder="e.g. English, History, Math"
                    />
                  </div>
                )}

                {form.interest_fulltime && (
                  <div>
                    <label htmlFor="promo-state" className="block text-sm font-medium text-gray-300 mb-1">
                      What state are you in? <span className="text-gray-500">(optional)</span>
                    </label>
                    <input
                      id="promo-state"
                      type="text"
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-optio-pink focus:border-transparent"
                      placeholder="e.g. Utah, California"
                    />
                  </div>
                )}

                {error && (
                  <p className="text-red-400 text-sm">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold py-3 rounded-lg text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Get Started'}
                </button>
                <p className="text-center text-gray-500 text-xs mt-2">
                  We'll email you back personally. No automated spam.
                </p>
              </form>
            )}
          </div>
        </section>

      </div>

      {/* Credit Example Modal */}
      {selectedExample && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedExample(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aspect-[16/9] overflow-hidden rounded-t-2xl">
              <img src={selectedExample.img} alt={selectedExample.activity} className="w-full h-full object-cover" />
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{selectedExample.activity}</h3>
                  <p className="text-optio-purple font-medium text-sm">→ {selectedExample.credit}</p>
                </div>
                <button
                  onClick={() => setSelectedExample(null)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <h4 className="font-semibold text-gray-900 mb-2">How it works</h4>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">{selectedExample.howItWorks}</p>

              <h4 className="font-semibold text-gray-900 mb-2">What this could look like</h4>
              <p className="text-gray-600 text-sm leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">{selectedExample.example}</p>

              <a
                href="#get-info"
                onClick={() => setSelectedExample(null)}
                className="mt-6 block w-full text-center bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity"
              >
                Get My Free Credit Code
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Utah Fits All Modal */}
      {showUFA && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowUFA(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-xl font-bold text-gray-900">Utah Fits All Scholarship</h3>
              </div>
              <button
                onClick={() => setShowUFA(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
              <p>
                The <span className="font-semibold text-gray-900">Utah Fits All Scholarship</span> is a state-funded program that provides Utah students with funds to use toward approved educational expenses, including tuition at accredited private schools.
              </p>
              <p>
                Because Optio Academy is WASC-accredited, Utah students may be eligible to have their <span className="font-semibold text-gray-900">full $8,000 annual tuition covered</span> through this program.
              </p>
              <p>
                Eligibility is determined by the state of Utah. We can help you through the application process and confirm whether you qualify.
              </p>
            </div>

            <a
              href="#get-info"
              onClick={() => setShowUFA(false)}
              className="mt-6 block w-full text-center bg-amber-500 text-white font-semibold py-3 rounded-lg hover:bg-amber-600 transition-colors"
            >
              Get More Info
            </a>
          </div>
        </div>
      )}

      {/* Transfer Guarantee Modal */}
      {showGuarantee && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowGuarantee(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <h3 className="text-xl font-bold text-gray-900">Transfer Guarantee</h3>
              </div>
              <button
                onClick={() => setShowGuarantee(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
              <p>
                We stand behind every credit you earn through Optio. If your high school or school district won't accept your transfer credit, we'll give you a <span className="font-semibold text-gray-900">full refund</span>. No questions asked.
              </p>
              <p>
                Optio is accredited by the <span className="font-semibold text-gray-900">Western Association of Schools and Colleges (WASC)</span>, a nationally recognized accrediting body. Credits from WASC-accredited schools are widely accepted by high schools, colleges, and universities across the country.
              </p>
              <p>
                Before you start, we recommend confirming with your school counselor that they accept transfer credits from accredited programs. Most do. If yours doesn't, you're fully covered.
              </p>
            </div>

            <button
              onClick={() => setShowGuarantee(false)}
              className="mt-6 w-full bg-green-500 text-white font-semibold py-3 rounded-lg hover:bg-green-600 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </MarketingLayout>
  )
}

export default PromoStudentPage
