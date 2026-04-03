import React from 'react'
import { Helmet } from 'react-helmet-async'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import { RevealSection, RevealItem } from '../../components/marketing/RevealSection'
import { useSectionView } from '../../components/marketing/useMarketingAnalytics'
import InlineContactForm from '../../components/marketing/InlineContactForm'

const PAGE = 'philosophy'

const DEWEY_QUOTE = "Education is not preparation for life; education is life itself."

const PhilosophyPage = () => {
  const heroRef = useSectionView('hero', PAGE)
  const problemRef = useSectionView('missing_piece', PAGE)
  const choiceRef = useSectionView('power_of_choice', PAGE)
  const teacherRef = useSectionView('teacher_role', PAGE)
  const sdtRef = useSectionView('sdt_pillars', PAGE)
  const languageRef = useSectionView('language', PAGE)
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
              A philosophy of education rooted in autonomy, consequences, and the belief that learning matters today.
            </p>
          </RevealSection>
        </div>
      </section>

      {/* ========== THE MISSING PIECE ========== */}
      <section ref={problemRef} className="py-20 sm:py-32 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <h2
              className="text-3xl sm:text-4xl font-bold text-gray-900 mb-8"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              The Missing Piece
            </h2>
          </RevealSection>

          <div className="space-y-6">
            <RevealSection>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Traditional schools teach plenty of subjects. Students can feel competent. They can find topics they connect with. But most schools don't give students one critical thing: <strong className="text-gray-900">meaningful choice over their own learning.</strong>
              </p>
            </RevealSection>

            <RevealSection>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Dr. Tanner Bowman spent 10 years as a full-time public high school teacher. He experimented with giving students unusual levels of autonomy in his classroom: letting them choose their own projects, set their own deadlines, even making attendance optional. Students who were labeled "unmotivated" by other teachers were thriving in his class.
              </p>
            </RevealSection>

            <RevealSection>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                The difference wasn't the subject. It wasn't the teaching style. <strong className="text-gray-900">It was the autonomy.</strong> When students had real ownership over their learning, they showed up differently. His research confirmed what he was seeing: intrinsic motivation increases directly alongside autonomy.
              </p>
            </RevealSection>

            <RevealSection>
              <div className="bg-gray-50 rounded-2xl p-8 sm:p-10 my-8">
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 leading-snug" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  Optio is what happens when you build an entire school around that idea.
                </p>
              </div>
            </RevealSection>

            <RevealSection>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                This builds on a tradition that goes back over a century. John Dewey argued in his Pedagogic Creed (1897) that education is not preparation for life, it is life itself. "The process is the goal" is how we live that out.
              </p>
            </RevealSection>

            <RevealSection>
              <div className="flex flex-col sm:flex-row items-center gap-6 bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-2xl p-6 sm:p-8 border border-optio-purple/10 my-8">
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/John_Dewey_in_1902.jpg/440px-John_Dewey_in_1902.jpg"
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
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ========== THE POWER OF CHOICE ========== */}
      <section ref={choiceRef} className="py-20 sm:py-32 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <h2
              className="text-3xl sm:text-4xl font-bold text-gray-900 mb-8"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              The Power of Choice
            </h2>
          </RevealSection>

          <div className="space-y-6">
            <RevealSection>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                At Optio, students make real choices. What to study. How to approach it. What evidence to create. When to work.
              </p>
            </RevealSection>

            <RevealSection>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                And with real choices come <strong className="text-gray-900">real consequences.</strong>
              </p>
            </RevealSection>

            <RevealSection>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                If a student puts in the work, they earn their diploma. If they don't, they don't. We don't soften that. We don't erase it. <strong className="text-gray-900">Consequences are proof that your choices actually mattered.</strong>
              </p>
            </RevealSection>

            <RevealSection>
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 sm:p-10 text-white my-8">
                <p className="text-xl sm:text-2xl font-bold leading-snug mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  If you're not experiencing consequences, you're not learning.
                </p>
                <p className="text-xl sm:text-2xl font-bold leading-snug text-white/70" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                  If you're not making meaningful decisions about your education, you're not intrinsically motivated. You're just following instructions.
                </p>
              </div>
            </RevealSection>

            <RevealSection>
              <div className="border-l-4 border-optio-purple pl-6 py-2 my-8">
                <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Public school will give you a diploma for showing up. You'll earn one from us for doing something meaningful.
                </p>
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
              <p className="text-lg text-gray-600 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Not a lecturer. Not a grader. Not someone standing at the front of a room.
              </p>
            </RevealSection>

            <RevealSection>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Every Optio student is paired with a dedicated teacher. One teacher, one student. Your teacher's job is to <strong className="text-gray-900">put you in the driver's seat of your own education</strong>, and then support you from behind.
              </p>
            </RevealSection>

            <RevealSection>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                They don't remove obstacles for you. They know that <strong className="text-gray-900">the obstacle is not in the way, the obstacle is the way.</strong> They let you tackle challenges yourself, and step in when you actually need them.
              </p>
            </RevealSection>

            <RevealSection>
              <p className="text-lg text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                They provide support and accountability. They celebrate your wins and they're honest when you're falling short.
              </p>
            </RevealSection>

            <RevealSection>
              <div className="grid sm:grid-cols-2 gap-4 my-8">
                {[
                  { label: 'Helps you choose your direction', desc: 'What do you want to learn? How do you want to approach it?' },
                  { label: 'Reviews your work honestly', desc: 'Real feedback, not participation trophies.' },
                  { label: 'Checks in regularly', desc: 'Not hovering. Not hand-holding. Available.' },
                  { label: 'Holds you accountable', desc: 'Your choices matter. Your teacher makes sure you know that.' },
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

      {/* ========== THREE THINGS EVERY LEARNER NEEDS ========== */}
      <section ref={sdtRef} className="py-20 sm:py-32 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-16">
              <p className="text-sm font-semibold text-optio-pink uppercase tracking-wider mb-3" style={{ fontFamily: 'Poppins' }}>Self-Determination Theory</p>
              <h2
                className="text-3xl sm:text-4xl font-bold mb-4"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Three Things Every Learner Needs
              </h2>
              <p className="text-lg text-white/60 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Research shows intrinsic motivation flourishes when three psychological needs are met. Most schools cover two. We start with the one they miss.
              </p>
            </div>
          </RevealSection>

          {/* Choice - Primary, larger */}
          <RevealSection>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 sm:p-10 border border-white/10 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center text-lg font-bold">1</div>
                <div>
                  <p className="text-xs font-semibold text-optio-pink uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>The one most schools miss</p>
                  <h3 className="text-2xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Choice (Autonomy)</h3>
                </div>
              </div>
              <p className="text-lg text-white/80 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Students make meaningful decisions about their learning. They choose which projects to pursue, how to demonstrate their understanding, and what evidence to share. We never dictate a single path. This is what changes everything.
              </p>
            </div>
          </RevealSection>

          <div className="grid sm:grid-cols-2 gap-6 mb-12">
            <RevealItem index={0}>
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-white/10 h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center text-base font-bold">2</div>
                  <h3 className="text-xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Competency</h3>
                </div>
                <p className="text-sm text-white/70 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Real challenges with real consequences create real growth. The work meets students where they are. Not too easy, not impossible. Just enough to stretch.
                </p>
              </div>
            </RevealItem>
            <RevealItem index={1}>
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-white/10 h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center text-base font-bold">3</div>
                  <h3 className="text-xl font-bold text-white" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Connection</h3>
                </div>
                <p className="text-sm text-white/70 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Learning feels personal. Students see themselves in the work. Family and mentors participate. Education becomes something you share, not something done to you.
                </p>
              </div>
            </RevealItem>
          </div>

          <RevealSection>
            <p className="text-center text-white/50 text-lg" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              When all three align, motivation sustains itself. <strong className="text-white/80">But it starts with choice.</strong>
            </p>
          </RevealSection>
        </div>
      </section>

      {/* ========== THE LANGUAGE WE USE ========== */}
      <section ref={languageRef} className="py-20 sm:py-32 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <h2
              className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4 text-center"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              The Language We Use
            </h2>
            <p className="text-lg text-gray-600 text-center mb-12" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Words shape how students see themselves. We choose ours carefully.
            </p>
          </RevealSection>

          <div className="space-y-4">
            {[
              { bad: '"This will help you in the future"', good: '"This is helping you grow right now"' },
              { bad: '"Employers will be impressed"', good: '"Create something that matters to you"' },
              { bad: '"Build your resume"', good: '"Build your skills and confidence"' },
              { bad: '"Prove yourself"', good: '"Discover yourself"' },
              { bad: '"Get ahead"', good: '"Grow forward"' },
              { bad: '"Compete"', good: '"Explore together"' },
            ].map((pair, i) => (
              <RevealItem key={i} index={i}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>We don't say</p>
                    <p className="text-base text-gray-400 line-through" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{pair.bad}</p>
                  </div>
                  <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-xl p-4 border border-optio-purple/15">
                    <p className="text-xs text-optio-purple mb-1 font-semibold uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>We say</p>
                    <p className="text-base text-gray-900 font-semibold" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>{pair.good}</p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== THE ULTIMATE TEST ========== */}
      <section ref={testRef} className="py-20 sm:py-32 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <RevealSection>
            <h2
              className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              The Ultimate Test
            </h2>
            <p className="text-lg text-gray-600 mb-12" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Before anything goes live on Optio, we ask:
            </p>
          </RevealSection>

          <div className="space-y-6 text-left max-w-xl mx-auto">
            {[
              'Does this celebrate the process or the outcome?',
              'Does this create internal or external motivation?',
              'Does this make learning feel like joy or obligation?',
              'Does this honor where the learner is right now?',
              'Does this sound like a friend encouraging you or a system evaluating you?',
            ].map((question, i) => (
              <RevealItem key={i} index={i}>
                <div className="flex items-start gap-4">
                  <span
                    className="text-2xl sm:text-3xl font-bold text-optio-purple/30 flex-shrink-0 w-8"
                    style={{ fontFamily: 'Poppins', fontWeight: 700 }}
                  >
                    {i + 1}
                  </span>
                  <p className="text-lg text-gray-800 leading-relaxed pt-1" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    {question}
                  </p>
                </div>
              </RevealItem>
            ))}
          </div>

          <RevealSection>
            <p className="text-gray-500 mt-10" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              If it doesn't pass all five, we rewrite it.
            </p>
          </RevealSection>
        </div>
      </section>

      {/* ========== CLOSING ========== */}
      <section className="py-20 sm:py-28 bg-gradient-to-br from-optio-purple via-optio-purple-dark to-optio-pink text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <RevealSection>
            <p
              className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-8"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              The diploma is not the goal. It's the beautiful byproduct of a meaningful learning journey.
            </p>
            <p className="text-white/60 text-sm" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Rooted in the work of John Dewey and the research of Dr. Tanner Bowman.
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
