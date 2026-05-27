import React, { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import FreeClassModal from '../../components/marketing/FreeClassModal'
import { useSectionView, useCtaTracker } from '../../components/marketing/useMarketingAnalytics'
import { captureEvent } from '../../services/posthog'

const PAGE = 'classes'
const MODAL_SEEN_KEY = 'optio_classes_modal_seen'
const AUTO_OPEN_DELAY_MS = 1500

const PEXELS = (id, w = 800) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`

// 9 transcript-language subjects parents and schools recognize. 3 examples each
// to keep cards scannable now that the photo carries the visual weight.
const SUBJECTS = [
  {
    name: 'Math',
    blurb: 'A math class built around how you actually use numbers.',
    image: PEXELS(5212662),
    examples: ['Budgeting & personal finance', 'Coding & game design', 'Statistics through sports'],
  },
  {
    name: 'English',
    blurb: 'Build a class around your voice — reading, writing, storytelling.',
    image: PEXELS(6256202),
    examples: ['Creative writing & fiction', 'Journalism & blogging', 'Poetry & spoken word'],
  },
  {
    name: 'Science',
    blurb: 'Real-world science from what you\'re already curious about.',
    image: PEXELS(5622142),
    examples: ['Field journaling & ecology', 'Cooking & food chemistry', 'Robotics & engineering'],
  },
  {
    name: 'History',
    blurb: 'Turn your family roots, travel, or current events into a history class.',
    image: PEXELS(15186551),
    examples: ['Family history & genealogy', 'Travel-based world history', 'Local & community history'],
  },
  {
    name: 'World Languages',
    blurb: 'Earn a language class for the language you\'re already learning.',
    image: PEXELS(4881147),
    examples: ['Conversational practice with tutors', 'Travel & immersion', 'Translation projects'],
  },
  {
    name: 'Physical Education',
    blurb: 'Take a PE class for the sport or movement you already do.',
    image: PEXELS(28887298),
    examples: ['Competitive sports & training', 'Dance, yoga, martial arts', 'Hiking & outdoor skills'],
  },
  {
    name: 'Visual Arts',
    blurb: 'Build an art class around the work you actually want to make.',
    image: PEXELS(33029254),
    examples: ['Drawing, painting, sculpture', 'Digital art & illustration', 'Photography & editing'],
  },
  {
    name: 'Music',
    blurb: 'Your lessons, band, or songwriting can become a music class.',
    image: PEXELS(10222167),
    examples: ['Private lessons on any instrument', 'Songwriting & home recording', 'Performing live'],
  },
  {
    name: 'Career & Technical',
    blurb: 'Real work, real skills — count it as a CTE class.',
    image: PEXELS(4709289),
    examples: ['Internships & part-time work', 'Entrepreneurship', 'Web & app development'],
  },
]

const HOW_IT_WORKS = [
  { step: 1, text: 'Choose your class subject — Math, Science, History, PE, etc.' },
  { step: 2, text: 'Use the Optio app to create a Quest focused on your passion project.' },
  { step: 3, text: 'Earn 1,000 Experience Points (XP) in that class subject — the equivalent of a semester-long class.' },
  { step: 4, text: 'Optio provides an official transcript you can use to transfer that class credit to your high school.' },
]

const FAQS = [
  {
    q: 'Is the first class really free?',
    a: 'Yes — your first class is on us. Drop your email and we\'ll send you everything you need to claim it. No credit card, no commitment.',
  },
  {
    q: 'What does a class cost after the first one?',
    a: '$50 per class after your first free class. If you want one-on-one support from an Optio teacher during the class, that\'s available as an add-on.',
  },
  {
    q: 'Will my local school accept the class?',
    a: 'Most do. We provide official transcripts and detailed documentation in the format schools expect. If your school won\'t accept it, we offer a full refund — that\'s our Transfer Guarantee.',
  },
  {
    q: 'How long does a class take to finish?',
    a: 'There\'s no typical pace — it depends on you. We don\'t measure classes by time spent; we measure by evidence of learning. Move as fast or as slowly as you need.',
  },
  {
    q: 'What age is this for?',
    a: 'Optio classes are designed for high school students (typically ages 13–18). If you\'re younger or older, get in touch and we\'ll talk through whether it\'s a fit.',
  },
  {
    q: 'Who teaches the class?',
    a: 'You can complete the class entirely on your own. Optio teachers review all your work before official credit is awarded. If you want one-on-one support from an Optio teacher during the class, that\'s available as an add-on.',
  },
]

const TESTIMONIALS = [
  {
    quote: 'My son was playing competitive soccer 15 hours a week and getting nothing for it on paper. Optio turned that into a real PE class on his transcript. His school accepted it without a question.',
    name: 'Sarah M.',
    context: 'Parent of an 11th-grader, Texas',
  },
  {
    quote: 'I\'ve been writing fiction every day for two years and nobody at my school cared. With Optio I got actual English credit for it. The teacher I worked with actually read my stuff.',
    name: 'Jordan L.',
    context: 'Student, 10th grade, Oregon',
  },
]

const Hero = ({ onClaim }) => {
  const ref = useSectionView('hero', PAGE)
  const track = useCtaTracker(PAGE)
  return (
    <section ref={ref} className="relative overflow-hidden bg-gradient-to-br from-optio-purple via-optio-purple to-optio-pink text-white pt-32 pb-20 sm:pt-40 sm:pb-28 px-4">
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 70%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="relative max-w-4xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 leading-tight" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
          Real high school classes built around passion projects.
        </h1>
        <p className="text-lg sm:text-xl text-white/90 mb-10 max-w-2xl mx-auto leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
          Accepted by your local high school. Your first class is free.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
          <button
            type="button"
            onClick={() => { track('hero_get_free_class'); onClaim() }}
            className="bg-white text-optio-purple font-bold px-8 py-4 rounded-full text-lg shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Get your free class
          </button>
          <a
            href="#subjects"
            onClick={() => track('hero_browse_subjects')}
            className="text-white/90 hover:text-white font-semibold text-base underline-offset-4 hover:underline"
            style={{ fontFamily: 'Poppins' }}
          >
            See what subjects are available
          </a>
        </div>
      </div>
    </section>
  )
}

const SubjectCatalog = ({ onClaim }) => {
  const ref = useSectionView('subjects', PAGE)
  const track = useCtaTracker(PAGE)
  return (
    <section ref={ref} id="subjects" className="py-16 sm:py-24 px-4 bg-white scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            Passion projects aligned with school subjects
          </h2>
          <p className="text-lg text-gray-600" style={{ fontFamily: 'Poppins' }}>
            See how Optio can help you get official school credit for real-world learning.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SUBJECTS.map((s) => (
            <article
              key={s.name}
              className="group bg-white border border-gray-200 rounded-2xl overflow-hidden hover:border-optio-purple hover:shadow-xl hover:-translate-y-0.5 transition-all"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-gray-100">
                <img
                  src={s.image}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
                <h3
                  className="absolute bottom-3 left-4 right-4 text-white text-xl font-bold drop-shadow-md"
                  style={{ fontFamily: 'Poppins', fontWeight: 700, textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                >
                  {s.name}
                </h3>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-700 mb-3 leading-relaxed" style={{ fontFamily: 'Poppins' }}>
                  {s.blurb}
                </p>
                <ul className="space-y-1.5">
                  {s.examples.map((ex) => (
                    <li key={ex} className="flex items-start gap-2 text-sm text-gray-600" style={{ fontFamily: 'Poppins' }}>
                      <svg className="w-4 h-4 text-optio-pink flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span>{ex}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>

        <div className="text-center mt-12">
          <button
            type="button"
            onClick={() => { track('subjects_get_free_class'); onClaim() }}
            className="bg-gradient-to-r from-optio-purple to-optio-pink text-white font-bold px-8 py-4 rounded-full text-lg shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Start with a free class
          </button>
        </div>
      </div>
    </section>
  )
}

const APP_SCREENSHOTS = [
  { src: 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/screenshots/basketball.png', alt: 'Basketball passion project' },
  { src: 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/screenshots/france.png', alt: 'Learning French passion project' },
  { src: 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/screenshots/mistborn.png', alt: 'Reading Mistborn passion project' },
  { src: 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/screenshots/stop_motion.png', alt: 'Stop motion animation passion project' },
]
const CAROUSEL_INTERVAL_MS = 4000

const PhoneCarousel = () => {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  // Auto-advance; pauses on hover/touch. Re-runs when index changes so a manual
  // dot click resets the timer instead of cutting the new slide short.
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % APP_SCREENSHOTS.length)
    }, CAROUSEL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [paused, index])

  return (
    <div
      className="flex flex-col items-center gap-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div className="relative w-[240px] sm:w-[280px]">
        <div className="relative bg-gray-900 rounded-[2.75rem] p-2 shadow-2xl ring-1 ring-black/10">
          <div className="relative aspect-[9/19.5] bg-gradient-to-br from-gray-100 to-gray-200 rounded-[2.25rem] overflow-hidden">
            {APP_SCREENSHOTS.map((s, i) => (
              <img
                key={s.src}
                src={s.src}
                alt={s.alt}
                loading={i === 0 ? 'eager' : 'lazy'}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-out ${
                  i === index ? 'opacity-100' : 'opacity-0'
                }`}
              />
            ))}
            {/* Dynamic-island-style notch sits above the slides */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-6 bg-gray-900 rounded-full z-10" />
          </div>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center gap-2" role="tablist" aria-label="App screenshot carousel">
        {APP_SCREENSHOTS.map((s, i) => (
          <button
            key={s.src}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Show screenshot ${i + 1} of ${APP_SCREENSHOTS.length}`}
            onClick={() => setIndex(i)}
            className={`h-2 rounded-full transition-all ${
              i === index ? 'w-6 bg-optio-purple' : 'w-2 bg-gray-300 hover:bg-gray-400'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

const HowItWorks = () => {
  const ref = useSectionView('how_it_works', PAGE)
  const track = useCtaTracker(PAGE)
  return (
    <section ref={ref} className="py-16 sm:py-24 px-4 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            How it works
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center max-w-5xl mx-auto">
          {/* Numbered steps */}
          <div className="order-2 md:order-1 space-y-6 sm:space-y-8 max-w-md mx-auto md:mx-0 md:ml-auto">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.step} className="flex items-start gap-5">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center text-lg font-bold shadow-md" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  {s.step}
                </div>
                <p className="text-lg text-gray-800 leading-snug pt-2.5" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  {s.text}
                </p>
              </div>
            ))}
            <div className="pl-[68px]">
              <Link
                to="/how-it-works"
                onClick={() => track('how_it_works_deep_link')}
                className="inline-flex items-center gap-2 text-optio-purple hover:text-optio-pink font-semibold text-base transition-colors"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                See exactly how the Optio app works
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Phone screenshot carousel */}
          <div className="order-1 md:order-2 flex justify-center md:justify-start">
            <PhoneCarousel />
          </div>
        </div>
      </div>
    </section>
  )
}

// Sample transcript rows for the mockup. The OPTIO row is the visual anchor —
// it shows visitors what their Optio class actually looks like on a school transcript.
const TRANSCRIPT_ROWS = [
  { name: 'English 10', grade: 'A', credit: '1.0' },
  { name: 'Algebra II', grade: 'B+', credit: '1.0' },
  { name: 'PE: Soccer Conditioning', grade: 'A', credit: '1.0', optio: true },
  { name: 'World History', grade: 'A-', credit: '1.0' },
  { name: 'Spanish I', grade: 'B+', credit: '1.0' },
  { name: 'Biology', grade: 'A', credit: '1.0' },
]

const TranscriptMockup = () => (
  <div className="relative max-w-sm mx-auto md:mx-0">
    <div className="bg-white rounded-xl shadow-2xl ring-1 ring-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-b from-gray-50 to-white border-b border-gray-200 px-6 py-4">
        <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold" style={{ fontFamily: 'Poppins' }}>
          Official High School Transcript
        </p>
        <p className="text-sm font-bold text-gray-800 mt-1" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
          Lincoln High School
        </p>
      </div>

      {/* Student info */}
      <div className="px-6 py-3 border-b border-gray-100 text-xs text-gray-600 flex justify-between" style={{ fontFamily: 'Poppins' }}>
        <span><span className="text-gray-400">Student: </span>Jordan L.</span>
        <span><span className="text-gray-400">Grade: </span>11</span>
      </div>

      {/* Column headers */}
      <div className="px-6 pt-3 pb-2 grid grid-cols-[1fr_auto_auto] gap-4 text-[10px] uppercase tracking-wider text-gray-400 font-semibold" style={{ fontFamily: 'Poppins' }}>
        <span>Class</span>
        <span className="w-10 text-right">Grade</span>
        <span className="w-10 text-right">Credit</span>
      </div>

      {/* Class rows */}
      <div className="px-6 pb-4">
        {TRANSCRIPT_ROWS.map((c, i) => (
          <div
            key={i}
            className={`grid grid-cols-[1fr_auto_auto] gap-4 py-2.5 text-sm items-center border-t border-gray-100 ${
              c.optio ? 'bg-optio-pink/10 -mx-6 px-6 border-l-4 border-l-optio-pink' : ''
            }`}
            style={{ fontFamily: 'Poppins' }}
          >
            <span className="text-gray-800 font-medium flex items-center gap-2 flex-wrap">
              {c.name}
              {c.optio && (
                <span className="px-2 py-0.5 bg-optio-pink text-white text-[9px] font-bold rounded-full tracking-wider" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  OPTIO
                </span>
              )}
            </span>
            <span className="text-gray-800 font-semibold text-right w-10" style={{ fontWeight: c.optio ? 700 : 600 }}>{c.grade}</span>
            <span className="text-gray-500 text-right w-10">{c.credit}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs" style={{ fontFamily: 'Poppins' }}>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Issued</span>
        <span className="text-gray-600 font-medium">06 / 12 / 2026</span>
      </div>
    </div>
  </div>
)

const Transfer = () => {
  const ref = useSectionView('transfer', PAGE)
  return (
    <section ref={ref} className="py-16 sm:py-24 px-4 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
          <div className="order-2 md:order-1">
            <TranscriptMockup />
          </div>
          <div className="order-1 md:order-2">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              Class credit transfers to your high school.
            </h2>
            <p className="text-lg text-gray-600 mb-6 leading-relaxed" style={{ fontFamily: 'Poppins' }}>
              When you finish an Optio class, we send your local high school an official transcript showing the class you completed.
            </p>
            <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  Transfer Guarantee
                </h3>
              </div>
              <p className="text-gray-700 leading-relaxed text-sm" style={{ fontFamily: 'Poppins' }}>
                If your local school won't accept the class, we'll refund you in full. Take it risk-free.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const Testimonials = () => {
  const ref = useSectionView('testimonials', PAGE)
  return (
    <section ref={ref} className="py-16 sm:py-24 px-4 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-12" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
          What families are saying
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
              <svg className="w-8 h-8 text-optio-pink/40 mb-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9.983 3v7.391c0 5.704-3.731 9.57-8.983 10.609l-.995-2.151c2.432-.917 3.995-3.638 3.995-5.849h-4v-10h9.983zm14.017 0v7.391c0 5.704-3.748 9.571-9 10.609l-.996-2.151c2.433-.917 3.996-3.638 3.996-5.849h-3.983v-10h9.983z" />
              </svg>
              <blockquote className="text-gray-700 text-lg leading-relaxed mb-5" style={{ fontFamily: 'Poppins' }}>
                "{t.quote}"
              </blockquote>
              <figcaption className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center text-white font-bold" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  {t.name.charAt(0)}
                </div>
                <div>
                  <div className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins' }}>{t.name}</div>
                  <div className="text-sm text-gray-500" style={{ fontFamily: 'Poppins' }}>{t.context}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

const FaqItem = ({ q, a, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between text-left py-5 gap-4 hover:text-optio-purple transition-colors"
      >
        <span className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>{q}</span>
        <svg
          className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <p className="pb-5 text-gray-600 leading-relaxed" style={{ fontFamily: 'Poppins' }}>
          {a}
        </p>
      )}
    </div>
  )
}

const Faq = () => {
  const ref = useSectionView('faq', PAGE)
  return (
    <section ref={ref} className="py-16 sm:py-24 px-4 bg-white">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-10" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
          Common questions
        </h2>
        <div>
          {FAQS.map((f, i) => (
            <FaqItem key={f.q} q={f.q} a={f.a} defaultOpen={i === 0} />
          ))}
        </div>
      </div>
    </section>
  )
}

const FinalCta = ({ onClaim }) => {
  const ref = useSectionView('final_cta', PAGE)
  const track = useCtaTracker(PAGE)
  return (
    <section ref={ref} className="py-20 sm:py-28 px-4 bg-gradient-to-br from-optio-purple to-optio-pink text-white">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl sm:text-5xl font-bold mb-5 leading-tight" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
          Try your first class free.
        </h2>
        <p className="text-lg sm:text-xl text-white/90 mb-10 leading-relaxed" style={{ fontFamily: 'Poppins' }}>
          See what a personalized high school class actually looks like. We'll send the details to your inbox.
        </p>
        <button
          type="button"
          onClick={() => { track('final_get_free_class'); onClaim() }}
          className="bg-white text-optio-purple font-bold px-10 py-5 rounded-full text-xl shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all"
          style={{ fontFamily: 'Poppins', fontWeight: 700 }}
        >
          Get your free class
        </button>
      </div>
    </section>
  )
}

const ClassesPage = () => {
  const [modalOpen, setModalOpen] = useState(false)

  // Auto-open the lead-capture modal on first visit so the free-class offer
  // is the first thing a visitor engages with. Once seen (closed or submitted),
  // we don't pop it again on this device.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let seen = false
    try { seen = !!window.localStorage.getItem(MODAL_SEEN_KEY) } catch {}
    if (seen) return
    const timer = setTimeout(() => {
      setModalOpen(true)
      captureEvent('marketing_modal_auto_opened', { page: PAGE })
    }, AUTO_OPEN_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  const markSeen = () => {
    try { window.localStorage.setItem(MODAL_SEEN_KEY, '1') } catch {}
  }

  const openModal = () => setModalOpen(true)
  const closeModal = () => {
    setModalOpen(false)
    markSeen()
  }

  return (
    <MarketingLayout>
      <Helmet>
        <title>High School Classes That Transfer | Optio</title>
        <meta name="description" content="Real high school classes built around passion projects. Accepted by your local school. Your first class is free." />
        <meta property="og:title" content="High School Classes That Transfer | Optio" />
        <meta property="og:description" content="Real high school classes built around passion projects. First class free." />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://www.optioeducation.com/classes" />
      </Helmet>

      <Hero onClaim={openModal} />
      <SubjectCatalog onClaim={openModal} />
      <HowItWorks />
      <Transfer />
      {/* <Testimonials /> hidden until we have real testimonials */}
      <Faq />
      <FinalCta onClaim={openModal} />

      <FreeClassModal open={modalOpen} onClose={closeModal} source="classes_lp" />
    </MarketingLayout>
  )
}

export default ClassesPage
