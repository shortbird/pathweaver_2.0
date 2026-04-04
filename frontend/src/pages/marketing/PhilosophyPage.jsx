import React, { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import { RevealSection, RevealItem } from '../../components/marketing/RevealSection'
import { useSectionView } from '../../components/marketing/useMarketingAnalytics'
import InlineContactForm from '../../components/marketing/InlineContactForm'

const PAGE = 'philosophy'

const DEWEY_QUOTE = "Education is not preparation for life; education is life itself."

const SDT_DATA = {
  choice: {
    label: 'Choice',
    subtitle: 'Autonomy',
    color: '#6D469B',
    desc: 'Students pick their own projects, decide how to show what they\'ve learned, and choose what evidence to share. There\'s no single right path through Optio. This is the piece that changes everything.',
    schoolStatus: 'Rarely present in traditional schools',
  },
  competence: {
    label: 'Competence',
    subtitle: 'Growth',
    color: '#F59E0B',
    desc: 'The work meets students where they are and pushes them just enough. When a challenge is too easy, students check out. When it\'s overwhelming, they shut down. The sweet spot in between is where real growth happens.',
    schoolStatus: 'Present in most traditional schools',
  },
  connection: {
    label: 'Connection',
    subtitle: 'Relatedness',
    color: '#EF597B',
    desc: 'Students see themselves in what they\'re learning. The work connects to who they are, and family and mentors get to be part of it. Education stops being something that happens to you and becomes something you share.',
    schoolStatus: 'Present in most traditional schools',
  },
  center: {
    label: 'Self-Determination',
    subtitle: 'Intrinsic Motivation',
    color: '#FFFFFF',
    desc: 'When choice, competence, and connection are all present and in balance, something changes. Students stop needing external motivation. They become genuinely self-determined learners who pursue growth because they want to, not because someone is making them.',
    schoolStatus: 'The goal of Optio\'s entire design',
  },
}

const SdtSection = ({ sectionRef }) => {
  const [active, setActive] = useState('choice')
  const order = ['choice', 'competence', 'connection', 'center']

  const handleToggle = (key) => {
    setActive(key)
  }

  const handlePrev = () => {
    const idx = order.indexOf(active)
    setActive(order[(idx - 1 + order.length) % order.length])
  }

  const handleNext = () => {
    const idx = order.indexOf(active)
    setActive(order[(idx + 1) % order.length])
  }

  return (
    <section ref={sectionRef} className="py-20 sm:py-32 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <RevealSection>
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-optio-pink uppercase tracking-wider mb-3" style={{ fontFamily: 'Poppins' }}>Self-Determination Theory</p>
            <h2
              className="text-3xl sm:text-4xl font-bold mb-4"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              Three Things Every Learner Needs
            </h2>
            <p className="text-lg text-white/60 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Decades of research on what actually motivates people to learn. Tap each element to learn more.
            </p>
          </div>
        </RevealSection>

        {/* Venn Diagram */}
        <RevealSection>
          <div className="flex justify-center mb-8">
            <div className="relative w-[320px] h-[320px] sm:w-[440px] sm:h-[420px]">
              {/* Choice circle (top center) */}
              <button
                onClick={() => handleToggle('choice')}
                className={`absolute w-[200px] h-[200px] sm:w-[260px] sm:h-[260px] rounded-full border-2 transition-all duration-300 flex items-center justify-center cursor-pointer z-[1] ${
                  active === 'choice'
                    ? 'bg-optio-purple/30 border-optio-purple shadow-lg shadow-optio-purple/20'
                    : 'bg-optio-purple/10 border-optio-purple/40 hover:bg-optio-purple/20 hover:border-optio-purple/60'
                }`}
                style={{ top: '0', left: '50%', transform: 'translateX(-50%)' }}
              >
                <div className="text-center" style={{ marginTop: '-30%' }}>
                  <p className="text-lg sm:text-xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Choice</p>
                  <p className="text-[10px] font-bold text-optio-purple/70 mt-1 sm:hidden" style={{ fontFamily: 'Poppins' }}>tap to explore</p>
                  <p className="text-[10px] font-bold text-optio-purple/70 mt-1 hidden sm:block" style={{ fontFamily: 'Poppins' }}>click to explore</p>
                </div>
              </button>

              {/* Competence circle (bottom-left) */}
              <button
                onClick={() => handleToggle('competence')}
                className={`absolute w-[200px] h-[200px] sm:w-[260px] sm:h-[260px] rounded-full border-2 transition-all duration-300 flex items-center justify-center cursor-pointer z-[1] ${
                  active === 'competence'
                    ? 'bg-amber-500/30 border-amber-400 shadow-lg shadow-amber-500/20'
                    : 'bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/20 hover:border-amber-500/60'
                }`}
                style={{ bottom: '0', left: '0' }}
              >
                <div className="text-center" style={{ marginTop: '20%', marginLeft: '-15%' }}>
                  <p className="text-lg sm:text-xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Competence</p>
                  <p className="text-[10px] font-bold text-amber-400/70 mt-1 sm:hidden" style={{ fontFamily: 'Poppins' }}>tap to explore</p>
                  <p className="text-[10px] font-bold text-amber-400/70 mt-1 hidden sm:block" style={{ fontFamily: 'Poppins' }}>click to explore</p>
                </div>
              </button>

              {/* Connection circle (bottom-right) */}
              <button
                onClick={() => handleToggle('connection')}
                className={`absolute w-[200px] h-[200px] sm:w-[260px] sm:h-[260px] rounded-full border-2 transition-all duration-300 flex items-center justify-center cursor-pointer z-[1] ${
                  active === 'connection'
                    ? 'bg-optio-pink/30 border-optio-pink shadow-lg shadow-optio-pink/20'
                    : 'bg-optio-pink/10 border-optio-pink/40 hover:bg-optio-pink/20 hover:border-optio-pink/60'
                }`}
                style={{ bottom: '0', right: '0' }}
              >
                <div className="text-center" style={{ marginTop: '20%', marginRight: '-15%' }}>
                  <p className="text-lg sm:text-xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Connection</p>
                  <p className="text-[10px] font-bold text-optio-pink/70 mt-1 sm:hidden" style={{ fontFamily: 'Poppins' }}>tap to explore</p>
                  <p className="text-[10px] font-bold text-optio-pink/70 mt-1 hidden sm:block" style={{ fontFamily: 'Poppins' }}>click to explore</p>
                </div>
              </button>

              {/* Center tappable area */}
              <button
                onClick={() => handleToggle('center')}
                className={`absolute z-10 w-[70px] h-[70px] sm:w-[90px] sm:h-[90px] rounded-full transition-all duration-300 flex items-center justify-center cursor-pointer ${
                  active === 'center'
                    ? 'bg-white/25 shadow-lg shadow-white/10'
                    : 'bg-white/10 hover:bg-white/20'
                }`}
                style={{ top: '50%', left: '50%', transform: 'translate(-50%, -20%)' }}
              >
                <p className="text-sm sm:text-base font-bold text-white uppercase tracking-widest" style={{ fontFamily: 'Poppins' }}>S.D.</p>
              </button>
            </div>
          </div>
        </RevealSection>

        {/* Active element detail with arrows */}
        <div className="max-w-2xl mx-auto mb-10">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrev}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center flex-shrink-0 transition-colors"
              aria-label="Previous"
            >
              <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-white/10 min-h-[140px] flex flex-col justify-center">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: SDT_DATA[active].color }}></div>
                <h3 className="text-xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  {SDT_DATA[active].label} <span className="text-white/50 font-medium text-base">({SDT_DATA[active].subtitle})</span>
                </h3>
              </div>
              <p className="text-sm text-white/80 leading-relaxed mb-3" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                {SDT_DATA[active].desc}
              </p>
              <p className="text-xs text-white/40 italic" style={{ fontFamily: 'Poppins' }}>
                {SDT_DATA[active].schoolStatus}
              </p>
            </div>

            <button
              onClick={handleNext}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center flex-shrink-0 transition-colors"
              aria-label="Next"
            >
              <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Dot indicators */}
          <div className="flex justify-center gap-2 mt-4">
            {order.map((key) => (
              <button
                key={key}
                onClick={() => handleToggle(key)}
                className={`w-2 h-2 rounded-full transition-all ${active === key ? 'w-6 bg-white/80' : 'bg-white/30 hover:bg-white/50'}`}
                aria-label={SDT_DATA[key].label}
              />
            ))}
          </div>
        </div>

        {/* Bottom text */}
        <RevealSection>
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-lg text-white/70 leading-relaxed mb-4" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              When all three elements are in balance, students motivate themselves. Traditional schools do a reasonable job with competence and connection, but they rarely give students meaningful choice over their own learning.
            </p>
            <p className="text-lg text-white/90 font-semibold" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
              Optio was built to restore that missing element.
            </p>
          </div>
        </RevealSection>
      </div>
    </section>
  )
}

const PhilosophyPage = () => {
  const heroRef = useSectionView('hero', PAGE)
  const problemRef = useSectionView('missing_piece', PAGE)
  const choiceRef = useSectionView('power_of_choice', PAGE)
  const teacherRef = useSectionView('teacher_role', PAGE)
  const xpRef = useSectionView('xp_not_grades', PAGE)
  const sdtRef = useSectionView('sdt_pillars', PAGE)
  const testRef = useSectionView('ultimate_test', PAGE)

  return (
    <MarketingLayout>
      <Helmet>
        <title>Our Philosophy | Optio</title>
        <meta name="description" content="The Process Is The Goal. A philosophy of education rooted in autonomy, consequences, and the belief that learning matters today." />
        <meta property="og:title" content="Our Philosophy | Optio" />
        <meta property="og:description" content="Education rooted in autonomy, consequences, and the belief that learning matters today. Built on the research of Dr. Tanner Bowman and the tradition of John Dewey." />
        <meta property="og:url" content="https://www.optioeducation.com/philosophy" />
        <link rel="canonical" href="https://www.optioeducation.com/philosophy" />
      </Helmet>

      {/* ========== HERO ========== */}
      <section ref={heroRef} className="min-h-[70vh] flex items-center justify-center bg-gradient-to-br from-optio-purple via-optio-purple-dark to-optio-pink text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-20 sm:py-32">
          <RevealSection>
            <h1
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-8 leading-none tracking-tight"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              The Process<br />Is The Goal
            </h1>
            <p
              className="text-xl sm:text-2xl text-white/80 max-w-2xl mx-auto leading-relaxed"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              Centuries of research have taught us what motivates humans to learn. Optio is a philosophy of education rooted in autonomy, consequences, and the belief that learning matters today.
            </p>
          </RevealSection>
        </div>
      </section>

      {/* ========== INTRODUCTION ========== */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <p className="text-xl sm:text-2xl text-gray-700 leading-relaxed text-center" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Optio was built on a simple observation: students who get to make real decisions about their education are more motivated, more engaged, and more resilient than students who don't. Everything we do flows from that idea.
            </p>
          </RevealSection>
        </div>
      </section>

      {/* ========== THE MISSING PIECE ========== */}
      <section ref={problemRef} className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <RevealSection className="order-1">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-8" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                The Missing Piece
              </h2>
              <div className="space-y-6">
                <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Traditional schools cover plenty of subjects, and most students can find something they're good at or something they care about. What's missing is simpler than you'd think: <strong className="text-gray-900">students rarely get to make meaningful choices about their own learning.</strong>
                </p>
                <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Dr. Tanner Bowman, founder of Optio, spent 10 years as a full-time public high school teacher. He experimented with giving students unusual levels of autonomy in his classroom: letting them choose their own projects, set their own deadlines, even making attendance optional. Students who were labeled "unmotivated" by other teachers were thriving in his class.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  It wasn't about the subject or some special teaching trick. <strong className="text-gray-900">It was the autonomy.</strong> When students owned their learning, they showed up differently. His research backed up what he saw every day: intrinsic motivation grows when students get to make real decisions.
                </p>
              </div>
            </RevealSection>

            {/* Right side: visual comparison mockup */}
            <RevealSection delay={200} className="order-2">
              <div className="space-y-4">
                <div className="bg-white rounded-xl p-5 border border-gray-200">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3" style={{ fontFamily: 'Poppins' }}>Traditional classroom</p>
                  <div className="space-y-2">
                    {['Read chapter 7', 'Answer questions 1-15', 'Study for Friday test', 'Write 500-word essay on assigned topic'].map((item) => (
                      <div key={item} className="flex items-center gap-2 text-sm text-gray-400">
                        <div className="w-4 h-4 rounded border border-gray-300 flex-shrink-0"></div>
                        <span style={{ fontFamily: 'Poppins' }}>{item}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-300 mt-3 italic" style={{ fontFamily: 'Poppins' }}>Every student gets the same assignments every year</p>
                </div>

                <div className="bg-gradient-to-br from-optio-purple/5 to-optio-pink/5 rounded-xl p-5 border border-optio-purple/20">
                  <p className="text-xs font-semibold text-optio-purple uppercase tracking-wider mb-3" style={{ fontFamily: 'Poppins' }}>On Optio</p>
                  <div className="space-y-2">
                    {['Choose a topic you care about', 'Design your own project', 'Document your process', 'Share what you created'].map((item) => (
                      <div key={item} className="flex items-center gap-2 text-sm text-gray-700">
                        <div className="w-4 h-4 rounded bg-optio-purple/20 flex items-center justify-center flex-shrink-0">
                          <svg className="w-2.5 h-2.5 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <span style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-optio-purple/60 mt-3 italic" style={{ fontFamily: 'Poppins' }}>Every student's project looks different because every student is different</p>
                </div>
              </div>
            </RevealSection>
          </div>

          {/* Callout */}
          <div className="max-w-3xl mx-auto mt-10">
            <RevealSection>
              <div className="bg-white rounded-2xl p-8 sm:p-10 border border-gray-200 shadow-sm">
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 leading-snug" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  Optio is what happens when you build a school focused on putting students in the driver's seat.
                </p>
              </div>
            </RevealSection>

          </div>
        </div>
      </section>

      {/* ========== THE POWER OF CHOICE ========== */}
      <section ref={choiceRef} className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <RevealSection className="order-2 lg:order-1">
              <img
                src="https://images.pexels.com/photos/8084059/pexels-photo-8084059.jpeg?auto=compress&cs=tinysrgb&w=800"
                alt="Confident young student"
                className="w-full rounded-2xl shadow-lg object-cover aspect-[3/4]"
                loading="lazy"
              />
            </RevealSection>

            <RevealSection delay={200} className="order-1 lg:order-2">
              <h2
                className="text-3xl sm:text-4xl font-bold text-gray-900 mb-8"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Choice and Consequences
              </h2>
              <div className="space-y-6">
                <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Optio students decide what to study, how to approach it, what to create as evidence, and when to do the work.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  That freedom comes with something most schools avoid: <strong className="text-gray-900">real consequences.</strong>
                </p>
                <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Students who put in the work earn their diploma. Students who don't, don't. We won't soften that or erase it. <strong className="text-gray-900">Consequences are how you know your choices actually mattered.</strong>
                </p>
                <div className="border-l-4 border-optio-purple pl-6 py-2">
                  <p className="text-xl text-gray-900 leading-snug font-bold mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                    If you're not experiencing consequences, you're not making real choices.
                  </p>
                  <p className="text-lg text-gray-600 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    Public school will give you a diploma for showing up. You'll earn one from us for doing something meaningful.
                  </p>
                </div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ========== THE ROLE OF THE OPTIO TEACHER ========== */}
      <section ref={teacherRef} className="py-20 sm:py-32 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <h2
              className="text-3xl sm:text-4xl font-bold text-gray-900 mb-8"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              The Role of the Optio Teacher
            </h2>
          </RevealSection>

          <div className="space-y-6">
            <RevealSection>
              <img
                src="https://images.pexels.com/photos/6147253/pexels-photo-6147253.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt="Mentor and student in conversation"
                className="w-full rounded-2xl shadow-lg object-cover aspect-[21/9] mb-8"
                loading="lazy"
              />
            </RevealSection>

            <RevealSection>
              <p className="text-lg text-gray-600 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Optio teachers look nothing like what you picture when you hear the word "teacher."
              </p>
            </RevealSection>

            <RevealSection>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Every student gets paired with one dedicated teacher. Their job isn't to deliver content or assign grades. It's to <strong className="text-gray-900">help the student take charge of their own learning</strong> and ride in the passenger seat while the student drives.
              </p>
            </RevealSection>

            <RevealSection>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                When a student hits a wall, the teacher doesn't tear it down for them. Students tackle challenges on their own, and the teacher steps in when they're genuinely stuck.
              </p>
            </RevealSection>

            <RevealSection>
              <div className="flex flex-col sm:flex-row items-center gap-6 bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 sm:p-8 my-4">
                <img
                  src="https://images.pexels.com/photos/11641541/pexels-photo-11641541.jpeg?auto=compress&cs=tinysrgb&w=400"
                  alt="Statue of Marcus Aurelius"
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover object-top flex-shrink-0 border-4 border-white/10 shadow-lg"
                />
                <div>
                  <p className="text-lg sm:text-xl text-white italic leading-relaxed mb-3" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    "The impediment to action advances action. What stands in the way becomes the way."
                  </p>
                  <p className="text-sm text-white/50 font-semibold" style={{ fontFamily: 'Poppins' }}>
                    Marcus Aurelius, Meditations (c. 170 AD)
                  </p>
                </div>
              </div>
            </RevealSection>

            <RevealSection>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Support and accountability go together. An Optio teacher will celebrate a student's best work and be straight with them when they're coasting.
              </p>
            </RevealSection>

            <RevealSection>
              <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>An Optio teacher...</h3>
              <div className="grid sm:grid-cols-2 gap-4 my-4">
                {[
                  { label: 'Helps you find your direction', desc: 'What are you interested in? What do you want to build? Let\'s figure it out.' },
                  { label: 'Gives honest feedback', desc: 'Real reactions to real work. No participation trophies.' },
                  { label: 'Checks in regularly', desc: 'Always available, never hovering.' },
                  { label: 'Holds you to your commitments', desc: 'You set the goals. Your teacher helps you keep them.' },
                ].map((item) => (
                  <div key={item.label} className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                    <p className="font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>{item.label}</p>
                    <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ========== XP, NOT GRADES ========== */}
      <section ref={xpRef} className="py-20 sm:py-32 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-14">
              <h2
                className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                XP, Not Grades
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Grades reward completion. XP rewards growth.
              </p>
            </div>
          </RevealSection>

          <div className="grid lg:grid-cols-2 gap-8 mb-12">
            {/* Letter Grades */}
            <RevealItem index={0}>
              <div className="bg-white rounded-2xl p-8 border border-gray-200 h-full">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center">
                    <span className="text-2xl font-bold text-gray-400" style={{ fontFamily: 'Poppins' }}>A-F</span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-400" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Letter Grades</h3>
                </div>
                <div className="space-y-4">
                  {[
                    { question: 'What students ask:', answer: '"Is this good enough?"' },
                    { question: 'What they optimize for:', answer: 'Minimum effort to hit the grade' },
                    { question: 'What gets rewarded:', answer: 'Completion and compliance' },
                    { question: 'What happens at the goal:', answer: 'Students stop. They got what they came for.' },
                    { question: 'What falling short means:', answer: 'Punishment. A permanent mark.' },
                  ].map((item) => (
                    <div key={item.question}>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>{item.question}</p>
                      <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            </RevealItem>

            {/* XP System */}
            <RevealItem index={1}>
              <div className="bg-gradient-to-br from-optio-purple to-optio-pink rounded-2xl p-8 text-white h-full">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
                    <span className="text-2xl font-bold" style={{ fontFamily: 'Poppins' }}>XP</span>
                  </div>
                  <h3 className="text-xl font-bold" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Experience Points</h3>
                </div>
                <div className="space-y-4">
                  {[
                    { question: 'What students ask:', answer: '"What else can I learn?"' },
                    { question: 'What they optimize for:', answer: 'Depth, curiosity, and personal growth' },
                    { question: 'What gets rewarded:', answer: 'Effort, exploration, and evidence of real learning' },
                    { question: 'What happens at the goal:', answer: 'The process is the goal. We continue learning.' },
                    { question: 'What falling short means:', answer: 'You\'re not done yet. Keep working.' },
                  ].map((item) => (
                    <div key={item.question}>
                      <p className="text-xs font-semibold text-white/60 uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>{item.question}</p>
                      <p className="text-sm text-white/90" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            </RevealItem>
          </div>

          <RevealSection>
            <div className="max-w-3xl mx-auto space-y-6">
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Think about the question every student eventually asks in a traditional classroom: <strong className="text-gray-900">"What do I have to do to get an A?"</strong> That question tells you everything. The student isn't curious. They're calculating the minimum.
              </p>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                With XP, there's no ceiling. Every piece of work earns experience. Every project adds to your total. The question changes from "is this good enough?" to <strong className="text-gray-900">"what else can I do?"</strong>
              </p>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Grades make students want to finish learning. XP makes students want to keep going.
              </p>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== THREE THINGS EVERY LEARNER NEEDS ========== */}
      <SdtSection sectionRef={sdtRef} />

      {/* ========== WHAT WE EVALUATE ========== */}
      <section ref={testRef} className="py-20 sm:py-32 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <h2
              className="text-3xl sm:text-4xl font-bold text-gray-900 mb-12 text-center"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              What We Actually Evaluate
            </h2>
          </RevealSection>

          <div className="grid sm:grid-cols-2 gap-6">
            {[
              { label: 'Curiosity', desc: 'Are they asking questions because they want to know, not because they have to?', icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> },
              { label: 'Effort', desc: 'Did they push themselves, or did they do the minimum to check a box?', icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
              { label: 'Growth', desc: 'Can they do something today that they couldn\'t do last month?', icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg> },
              { label: 'Reflection', desc: 'Can they articulate what they learned and why it mattered to them?', icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
            ].map((item, i) => (
              <RevealItem key={item.label} index={i}>
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-100 h-full">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 text-optio-purple flex items-center justify-center mb-4">
                    {item.icon}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>{item.label}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
                </div>
              </RevealItem>
            ))}
          </div>

          <RevealSection>
            <p className="text-center text-gray-500 mt-10" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              No percentages. No letter grades. No class rank. Just evidence that a student is growing.
            </p>
          </RevealSection>
        </div>
      </section>

      {/* ========== LEARNING FOR EVERYONE ========== */}
      <section className="py-20 sm:py-32 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <RevealSection>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Built for Every Kind of Learner
              </h2>
              <div className="space-y-6">
                <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Optio was designed from the ground up using Universal Design for Learning principles. That means the platform works equally well for students of all abilities, not as an afterthought or an accommodation, but by default.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  When you measure progress instead of test scores, and personalization instead of standardization, the whole concept of "learning disability" starts to shift. A student who struggles with timed tests might thrive when they can demonstrate what they know through a video, a project, or a conversation with their teacher.
                </p>
                <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Optio doesn't ask students to fit into a system. The system fits around the student.
                </p>
              </div>
            </RevealSection>

            <RevealSection delay={200}>
              <div className="space-y-4">
                {[
                  { label: 'Multiple ways to show learning', desc: 'Photos, videos, writing, audio, projects, conversations. Students choose how to demonstrate what they know.' },
                  { label: 'Self-paced by design', desc: 'No timed tests, no falling behind the class. Students move at the speed that works for them.' },
                  { label: 'Strengths over deficits', desc: 'XP accumulates based on what students can do, not what they can\'t. Every student has a path forward.' },
                  { label: 'Teacher who knows them', desc: 'A dedicated 1-on-1 teacher relationship means support is always tailored, never generic.' },
                ].map((item) => (
                  <div key={item.label} className="bg-white rounded-xl p-5 border border-gray-100">
                    <p className="font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>{item.label}</p>
                    <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ========== DEWEY CLOSING ========== */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="flex flex-col sm:flex-row items-center gap-6 bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-2xl p-6 sm:p-8 border border-optio-purple/10">
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/e/ef/John_Dewey_cph.3a51565.jpg"
                alt="John Dewey"
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover object-top flex-shrink-0 border-4 border-white shadow-lg"
              />
              <div>
                <p className="text-lg sm:text-xl text-gray-800 italic leading-relaxed mb-3" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  "{DEWEY_QUOTE}"
                </p>
                <p className="text-sm text-gray-500 font-semibold" style={{ fontFamily: 'Poppins' }}>
                  John Dewey, My Pedagogic Creed (1897)
                </p>
              </div>
            </div>
            <p className="text-center text-gray-500 mt-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Optio is rooted in this tradition. The work of John Dewey and the research of Dr. Tanner Bowman.
            </p>
          </RevealSection>
        </div>
      </section>

      {/* ========== CONTACT FORM ========== */}
      <InlineContactForm
        source="philosophy"
        heading="Interested in Learning More?"
        subheading="We'd love to hear from you."
        placeholder="What resonated with you? What questions do you have?"
      />
    </MarketingLayout>
  )
}

export default PhilosophyPage
