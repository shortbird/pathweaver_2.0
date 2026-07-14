import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import { RevealSection, RevealItem } from '../../components/marketing/RevealSection'
import { useSectionView, useCtaTracker } from '../../components/marketing/useMarketingAnalytics'
import InlineContactForm from '../../components/marketing/InlineContactForm'
import WascBadge from '../../components/accreditation/WascBadge'

const PAGE = 'academy'
const ACADEMY_EMAIL = 'tanner@optioeducation.com'

const IMAGES = {
  hero: 'https://images.pexels.com/photos/8423048/pexels-photo-8423048.jpeg?auto=compress&cs=tinysrgb&w=1920',
  selfPaced: 'https://images.pexels.com/photos/4145354/pexels-photo-4145354.jpeg?auto=compress&cs=tinysrgb&w=800',
  mentor: 'https://images.pexels.com/photos/10419957/pexels-photo-10419957.jpeg?auto=compress&cs=tinysrgb&w=800',
  record: 'https://images.pexels.com/photos/7692559/pexels-photo-7692559.jpeg?auto=compress&cs=tinysrgb&w=800',
}

const CheckIcon = () => (
  <svg className="w-5 h-5 text-optio-purple flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const FAQS = [
  {
    q: 'Is the diploma real? Will colleges accept it?',
    a: 'Yes. Optio Academy is accredited by the Accrediting Commission for Schools, Western Association of Schools and Colleges (ACS WASC), the same commission that accredits thousands of public and private schools. Your student earns an official transcript and diploma that colleges and employers recognize nationwide.',
  },
  {
    q: 'What about friends and socialization?',
    a: 'Optio Academy students spend more time out in the real world than students sitting in a classroom. Sports teams, volunteering, jobs, clubs, and community projects are not extracurriculars here; they are part of school itself, and they keep students connected to people of all ages. Their mentor actively encourages that involvement.',
  },
  {
    q: 'How much do I need to do as a parent?',
    a: 'Far less than homeschooling. Your student\'s mentor carries the accountability: goals, check-ins, follow-through, and teacher review of every piece of work. You get full visibility into their journal, portfolio, and progress toward credits, so you always know how things are going without having to run the school day yourself.',
  },
  {
    q: 'How does my student earn credit without tests and seat time?',
    a: 'Credit is based on evidence of learning, not hours in a chair. Students document their work on the Optio platform, licensed teachers review it, and credit is awarded to an official transcript. A finished game, a training log, a business plan: real work is the exam.',
  },
  {
    q: 'Can my student transfer back to a traditional school later?',
    a: 'Yes, anytime. Your student\'s credits live on an official, accredited transcript that transfers like any other school\'s. We never ask families to sign away the right to leave.',
  },
  {
    q: 'When can my student start?',
    a: 'Any time of year. Because the program is self-paced, there is no semester to wait for. After the discovery call and enrollment paperwork, your student is matched with their mentor and starts right away.',
  },
]

const TESTIMONIALS = [
  {
    quote: 'High school just wasn\'t challenging enough. I had so many projects I wanted to work on, but I was stuck in a classroom filling out worksheets. Switching to Optio lets me take on real, challenging work I\'m actually excited about, and earn my diploma at the same time.',
    name: 'Clare B.',
    context: 'Optio Student',
  },
  {
    quote: 'We\'ve always homeschooled our seven kids because we wanted them to get the best education possible, and Optio has been a perfect fit. Our kids get one-on-one mentorship from their Optio teacher, and the teacher helps them build their learning around the things they already love.',
    name: 'Paige H.',
    context: 'Optio Parent',
  },
  {
    quote: 'My son loves that he can work in any order and that it isn\'t graded, and I\'ve watched him use the AI steps generator to break down tasks on his own. He was excited to get an accurate read on his progress, and I know he\'s learning a lot more than he would be just clicking through an online course.',
    name: 'Andrea F.',
    context: 'Optio Parent',
  },
]

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
        <p className="pb-5 text-gray-600 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
          {a}
        </p>
      )}
    </div>
  )
}

const AcademyPage = () => {
  const trackCta = useCtaTracker(PAGE)

  const heroRef = useSectionView('hero', PAGE)
  const accreditationRef = useSectionView('accreditation', PAGE)
  const factsRef = useSectionView('quick_facts', PAGE)
  const howRef = useSectionView('how_it_works', PAGE)
  const dayRef = useSectionView('day_in_life', PAGE)
  const thriveRef = useSectionView('who_thrives', PAGE)
  const pillarsRef = useSectionView('pillars', PAGE)
  const voicesRef = useSectionView('testimonials', PAGE)
  const headRef = useSectionView('head_of_school', PAGE)
  const faqRef = useSectionView('faq', PAGE)
  const contactRef = useSectionView('contact', PAGE)

  return (
    <MarketingLayout>
      <Helmet>
        <title>Optio Academy | A WASC-Accredited Online Private School</title>
        <meta
          name="description"
          content="Optio Academy is a WASC-accredited, fully online private school. Students learn at their own pace, guided by a dedicated mentor, and graduate with an accredited high school diploma."
        />
        <meta property="og:title" content="Optio Academy | WASC-Accredited Online Private School" />
        <meta
          property="og:description"
          content="A fully online private school where students learn at their own pace with a dedicated mentor and graduate with a WASC-accredited diploma."
        />
        <meta property="og:url" content="https://www.optioeducation.com/academy" />
        <link rel="canonical" href="https://www.optioeducation.com/academy" />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQS.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          })}
        </script>
      </Helmet>

      {/* ========== HERO ========== */}
      <section ref={heroRef} className="relative overflow-hidden min-h-[60vh] flex items-end">
        <div className="absolute inset-0">
          <img src={IMAGES.hero} alt="" className="w-full h-full object-cover" style={{ objectPosition: 'center 30%' }} />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/95 via-gray-900/60 via-50% to-transparent" />
        </div>
        <div className="relative max-w-5xl mx-auto px-4 pb-12 sm:pb-16 pt-32 sm:pt-40 text-center text-white">
          <h1
            className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 leading-tight drop-shadow-lg"
            style={{ fontFamily: 'Poppins', fontWeight: 700, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
          >
            Optio Academy
          </h1>
          <p
            className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed mb-8 drop-shadow-md"
            style={{ fontFamily: 'Poppins', fontWeight: 500, textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
          >
            A high school built around your student. They learn at their own pace, guided by a
            dedicated mentor, and graduate with an accredited diploma earned through work they
            actually care about.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="#get-info"
              onClick={() => trackCta('hero_discovery_call')}
              className="bg-white text-optio-purple px-7 py-3 rounded-full text-base font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              style={{ fontFamily: 'Poppins' }}
            >
              Schedule a Discovery Call
            </a>
            <a
              href="#how-it-works"
              onClick={() => trackCta('hero_how_it_works')}
              className="bg-white/10 backdrop-blur-sm border border-white/30 text-white px-7 py-3 rounded-full text-base font-semibold hover:bg-white/20 transition-all duration-200"
              style={{ fontFamily: 'Poppins' }}
            >
              See How It Works
            </a>
          </div>
        </div>
      </section>

      {/* ========== ACCREDITATION ========== */}
      <section id="accreditation" ref={accreditationRef} className="py-16 sm:py-20 bg-white scroll-mt-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-10">
              <p
                className="text-sm font-semibold uppercase tracking-wider text-optio-purple mb-3"
                style={{ fontFamily: 'Poppins' }}
              >
                Accreditation
              </p>
              <h2
                className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                A Real Diploma, Recognized Nationwide
              </h2>
              <p
                className="text-lg text-gray-600 max-w-3xl mx-auto"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                Optio Academy is accredited by the Accrediting Commission for Schools, Western
                Association of Schools and Colleges (ACS WASC). Your student's transcript and
                diploma are official and accepted by colleges and employers across the country.
              </p>
            </div>
          </RevealSection>
          <RevealSection delay={150}>
            <WascBadge variant="large" />
          </RevealSection>
        </div>
      </section>

      {/* ========== QUICK FACTS ========== */}
      <section id="quick-facts" ref={factsRef} className="py-16 sm:py-20 bg-gray-50 scroll-mt-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <p
              className="text-sm font-semibold uppercase tracking-wider text-optio-purple mb-3"
              style={{ fontFamily: 'Poppins' }}
            >
              Quick Facts
            </p>
            <h2
              className="text-3xl sm:text-4xl font-bold text-gray-900 mb-8"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              What Optio Academy Is
            </h2>
          </RevealSection>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                label: 'School Type',
                value: 'Full-time private school',
                detail: 'Optio Academy is your student\'s primary school, where they earn high school credit toward an accredited diploma.',
              },
              {
                label: 'Grade Levels',
                value: 'Grades 9 - 12',
                detail: 'High school program leading to a WASC-accredited Optio Academy diploma.',
              },
              {
                label: 'How Learning Works',
                value: 'Self-paced',
                detail: 'Students move through their classes at their own speed on the Optio platform, turning their interests into real coursework.',
              },
              {
                label: 'Mentorship',
                value: 'A dedicated mentor',
                detail: 'Every student is matched with a mentor who meets with them one-on-one, sets goals, and keeps them on track.',
              },
              {
                label: 'Accreditation',
                value: 'ACS WASC',
                detail: 'Accredited by the Accrediting Commission for Schools, Western Association of Schools and Colleges.',
              },
              {
                label: 'Enrollment',
                value: 'Rolling admissions',
                detail: 'Because the program is self-paced, students can start any time of year.',
              },
            ].map((fact, i) => (
              <RevealItem key={fact.label} index={i}>
                <div className="bg-white rounded-xl border border-gray-200 p-5 h-full">
                  <p
                    className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2"
                    style={{ fontFamily: 'Poppins' }}
                  >
                    {fact.label}
                  </p>
                  <p
                    className="text-lg font-bold text-gray-900 mb-2"
                    style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                  >
                    {fact.value}
                  </p>
                  <p
                    className="text-sm text-gray-600 leading-relaxed"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    {fact.detail}
                  </p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section id="how-it-works" ref={howRef} className="py-16 sm:py-20 bg-white scroll-mt-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-14">
              <p
                className="text-sm font-semibold uppercase tracking-wider text-optio-purple mb-3"
                style={{ fontFamily: 'Poppins' }}
              >
                The Program
              </p>
              <h2
                className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Self-Paced Learning With Real Support
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Your student sets the pace. Their mentor makes sure the pace holds. Everything they
                do becomes part of an official record.
              </p>
            </div>
          </RevealSection>

          {/* Feature 1: Self-paced learning */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16 sm:mb-20">
            <RevealSection>
              <img src={IMAGES.selfPaced} alt="Student working at their own pace" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
            </RevealSection>
            <RevealSection delay={200}>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Learning That Moves at Your Student's Speed
              </h3>
              <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                There are no bell schedules and no waiting for the rest of the class. Students work
                through their classes on the Optio platform at the pace that fits them, going deep
                where they're passionate and taking extra time where they need it.
              </p>
              <div className="space-y-3">
                {[
                  'Turn real interests into real classes: build a game for computer science, train for a race for PE',
                  'Move quickly through material they know, slow down where it counts',
                  'Work from anywhere, on a schedule that fits your family',
                  'Progress is measured by what they produce, not hours in a seat',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3"><CheckIcon /><p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p></div>
                ))}
              </div>
            </RevealSection>
          </div>

          {/* Feature 2: Dedicated mentor */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16 sm:mb-20">
            <RevealSection delay={200} className="order-2 lg:order-1">
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                A Mentor Who Knows Your Student
              </h3>
              <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Self-paced never means alone. Every student is matched with a dedicated mentor who
                meets with them one-on-one, helps them set goals, reviews their work, and holds
                them accountable. It's the individual attention most students never get in a
                classroom of thirty.
              </p>
              <div className="space-y-3">
                {[
                  'Regular one-on-one check-ins with the same mentor all year',
                  'Goals and deadlines set together, then followed up on',
                  'Guidance on projects, classes, and what to tackle next',
                  'Parents stay in the loop on progress and plans',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3"><CheckIcon /><p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p></div>
                ))}
              </div>
            </RevealSection>
            <RevealSection className="order-1 lg:order-2">
              <img src={IMAGES.mentor} alt="Mentor working with a student" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
            </RevealSection>
          </div>

          {/* Feature 3: Official record */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <RevealSection>
              <img src={IMAGES.record} alt="Graduate holding a diploma" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
            </RevealSection>
            <RevealSection delay={200}>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Everything Counts Toward the Diploma
              </h3>
              <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Every project, class, and accomplishment is documented on the Optio platform and
                reviewed by licensed teachers. The result is an official transcript, a portfolio of
                real work, and a WASC-accredited diploma.
              </p>
              <div className="space-y-3">
                {[
                  'Official transcript issued by Optio Academy',
                  'A portfolio that shows what your student can actually do',
                  'Work reviewed and credit awarded by licensed teachers',
                  'A diploma colleges and employers recognize nationwide',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3"><CheckIcon /><p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p></div>
                ))}
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ========== DAY IN THE LIFE ========== */}
      <section id="day-in-the-life" ref={dayRef} className="py-16 sm:py-20 bg-gradient-to-br from-optio-purple/5 via-white to-optio-pink/5 scroll-mt-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-12">
              <p
                className="text-sm font-semibold uppercase tracking-wider text-optio-purple mb-3"
                style={{ fontFamily: 'Poppins' }}
              >
                Day in the Life
              </p>
              <h2
                className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Same Day. Two Very Different Schools.
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Follow one student through a school day, hour by hour, and see what changes when the
                bells, the bubble sheets, and the busywork disappear.
              </p>
            </div>
          </RevealSection>

          {/* Column headers (desktop) */}
          <RevealSection delay={100}>
            <div className="hidden md:grid md:grid-cols-[88px_1fr_1fr] gap-4 mb-4">
              <div />
              <p className="text-center text-sm font-semibold uppercase tracking-wider text-gray-400" style={{ fontFamily: 'Poppins' }}>
                Traditional School
              </p>
              <p className="text-center text-sm font-semibold uppercase tracking-wider text-optio-purple" style={{ fontFamily: 'Poppins' }}>
                Optio Academy
              </p>
            </div>
          </RevealSection>

          <div className="space-y-4">
            {[
              {
                time: '8:00',
                school: 'First bell. Seven periods to go, and I\'m already behind.',
                optio: 'Check my goals over breakfast. I pick what to tackle first. My day, my order.',
              },
              {
                time: '9:00',
                school: 'Algebra worksheets for 45 minutes, then the bell cuts the lesson off mid-thought and everyone shuffles to the next room.',
                optio: 'Two uninterrupted hours building the physics engine for my video game. This is my computer science class, and nothing interrupts it.',
              },
              {
                time: '11:15',
                school: 'Stuck on a problem. Raise a hand, wait, and split one teacher\'s attention thirty ways.',
                optio: 'Stuck on a collision bug. I text my Optio mentor with a question and get unstuck in minutes.',
              },
              {
                time: '12:30',
                school: 'Cafeteria lunch, then test prep: another practice bubble sheet for a standardized test nobody will remember.',
                optio: 'Volunteer shift at the animal shelter. Real work with real stakes, logged with photos on the drive home. It counts toward my civics credit.',
              },
              {
                time: '2:00',
                school: 'Two more periods of watching the clock, memorizing answers for Friday\'s quiz.',
                optio: 'Weekly video chat with my mentor. We review what I shipped, celebrate the wins, and set next week\'s goals.',
              },
              {
                time: '3:30',
                school: 'Bus home, then two hours of homework stacked on top of a seven-hour day.',
                optio: 'Six-mile training run for the half marathon I chose. That\'s my PE class, logged in Optio.',
              },
              {
                time: '7:00',
                school: 'Still grinding through homework. Tomorrow: the exact same schedule, bell for bell.',
                optio: 'Cooked dinner for the family and added it to my learning journal. Tomorrow looks completely different, and that\'s the point.',
              },
            ].map((row, i) => (
              <RevealItem key={row.time} index={i}>
                <div className="grid md:grid-cols-[88px_1fr_1fr] gap-3 md:gap-4 items-stretch">
                  <div className="flex md:justify-center">
                    <div className="bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-bold rounded-full px-3 py-1.5 text-center shadow-sm self-start w-[72px]" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                      {row.time}
                    </div>
                  </div>
                  <div className="bg-gray-100 rounded-xl border border-gray-200 p-4 sm:p-5">
                    <p className="md:hidden text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1" style={{ fontFamily: 'Poppins' }}>
                      Traditional School
                    </p>
                    <p className="text-sm text-gray-500 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                      {row.school}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl border border-optio-purple/25 shadow-sm p-4 sm:p-5">
                    <p className="md:hidden text-xs font-semibold uppercase tracking-wider text-optio-purple mb-1" style={{ fontFamily: 'Poppins' }}>
                      Optio Academy
                    </p>
                    <p className="text-sm text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                      {row.optio}
                    </p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </div>

          <RevealSection delay={200}>
            <p className="text-center text-gray-600 mt-12 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              By the end of the day, one student has a stack of worksheets. The other has working
              code, a shelter shift, six training miles, and a home-cooked meal, all documented
              evidence on an official transcript.
            </p>
          </RevealSection>
        </div>
      </section>

      {/* ========== WHO THRIVES HERE ========== */}
      <section id="who-thrives" ref={thriveRef} className="py-16 sm:py-20 bg-white scroll-mt-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-12">
              <p
                className="text-sm font-semibold uppercase tracking-wider text-optio-purple mb-3"
                style={{ fontFamily: 'Poppins' }}
              >
                Is This Your Student?
              </p>
              <h2
                className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Who Thrives at Optio Academy
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Our students have one thing in common: their lives are bigger than a school desk.
              </p>
            </div>
          </RevealSection>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                title: 'The Athlete or Performer',
                desc: 'Training, rehearsals, and competitions happen during school hours. Here, the training is school: it earns credit, and the schedule bends around it.',
              },
              {
                title: 'The Builder',
                desc: 'The kid who codes, composes, films, or makes things for hours, then sits bored in class. Their projects become their classes.',
              },
              {
                title: 'The Young Entrepreneur',
                desc: 'Already running a small business, a channel, or a side hustle. That real-world work becomes real coursework on a real transcript.',
              },
              {
                title: 'The Family on the Move',
                desc: 'Travel, relocation, or a schedule no traditional school can follow. School goes wherever your family goes, without losing momentum.',
              },
              {
                title: 'The Student School Failed',
                desc: 'Bright but checked out, anxious, or lost in a class of thirty. A pace they control and one adult who truly knows them changes everything.',
              },
              {
                title: 'The Homeschooler Ready for a Diploma',
                desc: 'Keep the freedom your family loves and add structure, mentorship, and a WASC-accredited diploma at the end of it.',
              },
            ].map((profile, i) => (
              <RevealItem key={profile.title} index={i}>
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 h-full">
                  <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                    {profile.title}
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    {profile.desc}
                  </p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== WHAT STUDENTS LEARN ========== */}
      <section id="pillars" ref={pillarsRef} className="py-16 sm:py-20 bg-gray-50 scroll-mt-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-12">
              <p
                className="text-sm font-semibold uppercase tracking-wider text-optio-purple mb-3"
                style={{ fontFamily: 'Poppins' }}
              >
                Curriculum
              </p>
              <h2
                className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                A Full High School Curriculum
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Classes map to five pillars that together cover everything a high school education
                should. Within each pillar, students shape the work around what they love.
              </p>
            </div>
          </RevealSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { name: 'STEM', desc: 'Science, technology, engineering, math' },
              { name: 'Communication', desc: 'Writing, language arts, public speaking' },
              { name: 'Civics', desc: 'Social studies, government, history' },
              { name: 'Wellness', desc: 'Physical education, health, nutrition' },
              { name: 'Art', desc: 'Visual arts, music, performance, design' },
            ].map((pillar, i) => (
              <RevealItem key={pillar.name} index={i}>
                <div className="bg-white rounded-xl border border-gray-200 p-5 h-full text-center">
                  <p className="text-lg font-bold text-optio-purple mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                    {pillar.name}
                  </p>
                  <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    {pillar.desc}
                  </p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== TESTIMONIALS ========== */}
      <section id="testimonials" ref={voicesRef} className="py-16 sm:py-20 bg-white scroll-mt-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-12">
              <p
                className="text-sm font-semibold uppercase tracking-wider text-optio-purple mb-3"
                style={{ fontFamily: 'Poppins' }}
              >
                From Our Families
              </p>
              <h2
                className="text-3xl sm:text-4xl font-bold text-gray-900"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Hear It From Students and Parents
              </h2>
            </div>
          </RevealSection>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <RevealItem key={t.name} index={i}>
                <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-2xl p-6 sm:p-8 border border-optio-purple/10 h-full flex flex-col">
                  <p className="text-base sm:text-lg text-gray-700 italic leading-relaxed mb-4 flex-1" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    "{t.quote}"
                  </p>
                  <p>
                    <span className="font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>{t.name}</span>
                    <span className="text-sm text-gray-500 ml-2" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{t.context}</span>
                  </p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== MEET THE HEAD OF SCHOOL ========== */}
      <section id="head-of-school" ref={headRef} className="py-16 sm:py-20 bg-gray-50 scroll-mt-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-10">
              <p
                className="text-sm font-semibold uppercase tracking-wider text-optio-purple mb-3"
                style={{ fontFamily: 'Poppins' }}
              >
                Meet the Head of School
              </p>
              <h2
                className="text-3xl sm:text-4xl font-bold text-gray-900"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                A Note From Dr. Bowman
              </h2>
            </div>
          </RevealSection>
          <RevealSection delay={150}>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-10">
              <div className="space-y-4 text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                <p>
                  I keep meeting incredible young people whose school day has almost nothing to do
                  with what they're actually capable of. They build, train, create, and lead in
                  their real lives, then sit through classes that were never designed for them. I
                  started Optio Academy to close that gap: a school where the remarkable things
                  students already do count, officially.
                </p>
                <p>
                  We are intentionally a small school. Every student is known by name, every mentor
                  knows what their students are working toward, and every family's first
                  conversation is with me, not an admissions office. If you're wondering whether
                  Optio Academy is right for your student, ask me directly. I'd love to talk.
                </p>
              </div>
              <div className="mt-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-1 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex-shrink-0">
                    <img
                      src="/images/head-of-school.png"
                      alt="Dr. Tanner Bowman, Head of School"
                      className="w-20 h-20 rounded-full bg-white"
                    />
                  </div>
                  <div>
                    <img
                      src="/images/signature-head-of-school.png"
                      alt="Signature of Dr. Tanner Bowman"
                      className="h-12 w-auto mb-2"
                    />
                    <p className="font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                      Dr. Tanner Bowman
                    </p>
                    <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                      Head of School, Optio Academy
                    </p>
                  </div>
                </div>
                <a
                  href={`mailto:${ACADEMY_EMAIL}`}
                  onClick={() => trackCta('head_of_school_email')}
                  className="inline-flex items-center justify-center bg-gradient-to-r from-optio-purple to-optio-pink text-white px-6 py-3 rounded-full font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                  style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                >
                  Email Dr. Bowman
                </a>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== FAQ ========== */}
      <section id="faq" ref={faqRef} className="py-16 sm:py-20 bg-white scroll-mt-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-10">
              <p
                className="text-sm font-semibold uppercase tracking-wider text-optio-purple mb-3"
                style={{ fontFamily: 'Poppins' }}
              >
                FAQ
              </p>
              <h2
                className="text-3xl sm:text-4xl font-bold text-gray-900"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Questions Every Family Asks
              </h2>
            </div>
          </RevealSection>
          <RevealSection delay={100}>
            <div>
              {FAQS.map((f, i) => (
                <FaqItem key={f.q} q={f.q} a={f.a} defaultOpen={i === 0} />
              ))}
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== CONTACT ========== */}
      <section id="contact" ref={contactRef} className="py-16 sm:py-20 bg-white scroll-mt-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="mb-8">
              <p
                className="text-sm font-semibold uppercase tracking-wider text-optio-purple mb-3"
                style={{ fontFamily: 'Poppins' }}
              >
                Contact
              </p>
              <h2
                className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Talk to Us
              </h2>
            </div>
          </RevealSection>

          <RevealSection delay={100}>
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 sm:p-8">
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                    Head of School
                  </h3>
                  <p className="text-gray-700 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    Dr. Tanner Bowman
                  </p>
                  <a
                    href={`mailto:${ACADEMY_EMAIL}`}
                    onClick={() => trackCta('contact_email')}
                    className="text-optio-purple hover:text-optio-pink transition-colors"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    {ACADEMY_EMAIL}
                  </a>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                    Related Documents
                  </h3>
                  <ul className="space-y-1">
                    <li>
                      <Link
                        to="/academy-agreement"
                        onClick={() => trackCta('academy_agreement')}
                        className="text-optio-purple hover:text-optio-pink transition-colors text-sm"
                        style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                      >
                        Participant & Parent Agreement
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/academy-handbook"
                        onClick={() => trackCta('academy_handbook')}
                        className="text-optio-purple hover:text-optio-pink transition-colors text-sm"
                        style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                      >
                        Participant Handbook
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/privacy"
                        onClick={() => trackCta('privacy')}
                        className="text-optio-purple hover:text-optio-pink transition-colors text-sm"
                        style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                      >
                        Privacy Policy
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/terms"
                        onClick={() => trackCta('terms')}
                        className="text-optio-purple hover:text-optio-pink transition-colors text-sm"
                        style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                      >
                        Terms of Service
                      </Link>
                    </li>
                  </ul>
                  <p className="text-xs text-gray-400 mt-4" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    Optio Academy is operated by Optio, LLC. Optio Academy admits students of any
                    race, color, national origin, religion, or background, and extends to all
                    students every right, privilege, program, and activity of the school.
                  </p>
                </div>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== INLINE CONTACT FORM ========== */}
      <InlineContactForm
        source="academy"
        heading="Schedule a Discovery Call"
        subheading="Tell us a little about your student and we'll reach out to set up a time to talk."
        placeholder="Grade level, interests, and anything else you'd like us to know"
      />
    </MarketingLayout>
  )
}

export default AcademyPage
