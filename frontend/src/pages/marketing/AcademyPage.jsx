import React from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import { RevealSection } from '../../components/marketing/RevealSection'
import { useSectionView, useCtaTracker } from '../../components/marketing/useMarketingAnalytics'
import InlineContactForm from '../../components/marketing/InlineContactForm'

const PAGE = 'academy'
const ACADEMY_EMAIL = 'tanner@optioeducation.com'

const SECTION_LINKS = [
  { id: 'at-a-glance', label: 'Quick Facts' },
  { id: 'program', label: 'The Program' },
  { id: 'tuition', label: 'Tuition' },
  { id: 'admissions', label: 'How to Join' },
  { id: 'safety', label: 'Safety' },
  { id: 'contact', label: 'Contact' },
]

const Check = ({ className = 'w-5 h-5 text-optio-purple' }) => (
  <svg className={`${className} flex-shrink-0 mt-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const SectionAnchor = ({ id, kicker, kickerColor, title, subtitle, children, sectionRef, bg = 'bg-white' }) => (
  <section id={id} ref={sectionRef} className={`py-16 sm:py-20 ${bg} scroll-mt-20`}>
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <RevealSection>
        <div className="mb-8">
          {kicker && (
            <p
              className={`text-sm font-semibold uppercase tracking-wider mb-3 ${kickerColor || 'text-optio-purple'}`}
              style={{ fontFamily: 'Poppins' }}
            >
              {kicker}
            </p>
          )}
          <h2
            className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            {title}
          </h2>
          {subtitle && (
            <p className="text-lg text-gray-600 max-w-3xl" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              {subtitle}
            </p>
          )}
        </div>
        {children}
      </RevealSection>
    </div>
  </section>
)

const AcademyPage = () => {
  const trackCta = useCtaTracker(PAGE)

  const heroRef = useSectionView('hero', PAGE)
  const overviewRef = useSectionView('at_a_glance', PAGE)
  const programRef = useSectionView('program', PAGE)
  const tuitionRef = useSectionView('tuition', PAGE)
  const admissionsRef = useSectionView('admissions', PAGE)
  const safetyRef = useSectionView('safety', PAGE)
  const contactRef = useSectionView('contact', PAGE)

  return (
    <MarketingLayout>
      <Helmet>
        <title>Optio Academy | A Fully Online Private School</title>
        <meta
          name="description"
          content="Optio Academy is a fully online private school. Live daily one-on-one instruction with a dedicated teacher, close mentorship and accountability, and a personalized path to a diploma."
        />
        <meta property="og:title" content="Optio Academy | Fully Online Private School" />
        <meta
          property="og:description"
          content="A fully online private school built on live daily one-on-one teacher instruction, close mentorship, and real accountability."
        />
        <meta property="og:url" content="https://www.optioeducation.com/academy" />
        <link rel="canonical" href="https://www.optioeducation.com/academy" />
      </Helmet>

      {/* ========== HERO ========== */}
      <section ref={heroRef} className="py-16 sm:py-24 bg-gradient-to-r from-optio-purple to-optio-pink text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <RevealSection>
            <p
              className="text-sm sm:text-base font-semibold uppercase tracking-[0.2em] text-white/80 mb-4"
              style={{ fontFamily: 'Poppins' }}
            >
              A Fully Online Private School
            </p>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              Optio Academy
            </h1>
            <p
              className="text-xl sm:text-2xl text-white/85 max-w-3xl mx-auto leading-relaxed mb-8"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              A real high school, built around your student. Live, one-on-one instruction with a
              dedicated teacher every day. Ongoing mentorship, close accountability, and a
              personalized path to a diploma.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="#get-info"
                onClick={() => trackCta('hero_get_in_touch')}
                className="bg-white text-optio-purple px-7 py-3 rounded-full text-base font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                style={{ fontFamily: 'Poppins' }}
              >
                Get in Touch
              </a>
              <a
                href="#at-a-glance"
                onClick={() => trackCta('hero_quick_facts')}
                className="bg-white/10 backdrop-blur-sm border border-white/30 text-white px-7 py-3 rounded-full text-base font-semibold hover:bg-white/20 transition-all duration-200"
                style={{ fontFamily: 'Poppins' }}
              >
                See Quick Facts
              </a>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== AT A GLANCE / QUICK FACTS ========== */}
      <section id="at-a-glance" ref={overviewRef} className="py-16 sm:py-20 bg-white scroll-mt-20">
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

          <RevealSection delay={100}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
              {[
                {
                  label: 'School Type',
                  value: 'Full-time private school',
                  detail: 'Optio Academy is your student\'s primary school, where they earn high school credit toward a diploma.',
                },
                {
                  label: 'Grade Levels',
                  value: 'Grades 9 – 12',
                  detail: 'High school program leading to an Optio Academy diploma.',
                },
                {
                  label: 'How It\'s Delivered',
                  value: 'Fully online',
                  detail: 'Live daily one-on-one instruction with a dedicated teacher who guides your student, reviews their work, and keeps them on track.',
                },
                {
                  label: 'School Year',
                  value: 'September – May',
                  detail: 'School year starts September 1. Full-time enrollment.',
                },
                {
                  label: 'Tuition',
                  value: '$8,000 per year',
                  detail: 'One comprehensive rate. No additional required fees.',
                },
              ].map((fact) => (
                <div
                  key={fact.label}
                  className="bg-gray-50 rounded-xl border border-gray-200 p-5"
                >
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
              ))}
            </div>
          </RevealSection>

          {/* In-page nav */}
          <RevealSection delay={300}>
            <div className="flex flex-wrap gap-2 justify-center">
              {SECTION_LINKS.map((link) => (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  onClick={() => trackCta(`anchor_${link.id}`)}
                  className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:border-optio-purple hover:text-optio-purple transition-colors"
                  style={{ fontFamily: 'Poppins' }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== EDUCATIONAL PROGRAM ========== */}
      <SectionAnchor
        id="program"
        sectionRef={programRef}
        kicker="The Program"
        title="A Dedicated Teacher, Every Single Day"
        subtitle="Every Optio Academy student works directly with a dedicated teacher through live, one-on-one instruction every weekday — setting goals, learning new material together, and reviewing progress. That close, daily relationship is the heart of the program and keeps your student supported, challenged, and accountable."
        bg="bg-gray-50"
      >
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              A Typical Week
            </h3>
            <ul className="space-y-3">
              {[
                'Live one-on-one instruction with a dedicated teacher every weekday',
                'Guided project work with goals, deadlines, and check-ins set by the teacher',
                'Regular progress reviews and online showcases that keep students accountable',
                'A real-time portfolio the teacher and family follow as work happens',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check />
                  <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              What Students Learn
            </h3>
            <p className="text-sm text-gray-600 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Coursework is mapped to five core pillars that cover the full high school curriculum.
            </p>
            <ul className="space-y-2">
              {[
                { name: 'STEM', desc: 'Science, technology, engineering, math' },
                { name: 'Communication', desc: 'Writing, language arts, public speaking' },
                { name: 'Civics', desc: 'Social studies, government, history' },
                { name: 'Wellness', desc: 'Physical education, health, nutrition' },
                { name: 'Art', desc: 'Visual arts, music, performance, design' },
              ].map((pillar) => (
                <li key={pillar.name} className="flex items-start gap-3">
                  <span className="text-sm font-bold text-optio-purple w-32 flex-shrink-0" style={{ fontFamily: 'Poppins' }}>
                    {pillar.name}
                  </span>
                  <span className="text-sm text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    {pillar.desc}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            The Teacher Is the Difference
          </h3>
          <p className="text-gray-700 leading-relaxed mb-4" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            Every weekday, your student meets live, one-on-one, with the same dedicated teacher.
            Together they set goals, review the previous day's work, learn new concepts, and map out
            what comes next. Your student is never left to figure it out alone — the teacher stays
            involved throughout the week, monitors progress, and holds them accountable for their
            goals. It's the kind of individual attention and follow-through most students never get
            in a classroom of thirty.
          </p>
          <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            Between sessions, students work on personalized projects their teacher helps design and
            reviews — coursework that turns what they love into real credit. Build a game and earn a
            computer science credit. Train for a half-marathon and earn PE. Run a community
            fundraiser and earn civics. Real interests, real credit, real diploma — with a teacher
            guiding every step.
          </p>
        </div>
      </SectionAnchor>

      {/* ========== TUITION & FEES ========== */}
      <SectionAnchor
        id="tuition"
        sectionRef={tuitionRef}
        kicker="Tuition"
        title="One Price. Everything Included."
        subtitle="$8,000 a year covers everything Optio Academy does for your student. No surprise fees, no add-ons, no separate charges for materials or testing."
      >
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-gradient-to-br from-optio-purple to-optio-pink rounded-2xl p-6 sm:p-8 text-white shadow-lg">
            <p className="text-sm font-semibold uppercase tracking-wider text-white/80 mb-2" style={{ fontFamily: 'Poppins' }}>
              Annual Tuition
            </p>
            <p className="text-5xl sm:text-6xl font-bold mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              $8,000
            </p>
            <p className="text-white/85 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              per student, per school year
            </p>
            <p className="text-sm text-white/90 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Payment plans available. Reach out if your family needs different terms.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-2" style={{ fontFamily: 'Poppins' }}>
              Required Add-On Fees
            </p>
            <p className="text-5xl sm:text-6xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              $0
            </p>
            <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              during the school year
            </p>
            <p className="text-sm text-gray-600 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Live daily one-on-one instruction, all curriculum, the Optio platform, and your
              student's transcript — all included. No enrollment fee, no materials fee, no testing fee.
            </p>
          </div>
        </div>

        <div className="bg-optio-purple/5 border border-optio-purple/20 rounded-xl p-5">
          <p className="text-sm text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            Every family gets the exact same program at the exact same price. No different tiers,
            no premium add-ons.
          </p>
        </div>
      </SectionAnchor>

      {/* ========== ADMISSIONS ========== */}
      <SectionAnchor
        id="admissions"
        sectionRef={admissionsRef}
        kicker="How to Join"
        title="Enrolling Is Simple"
        subtitle="Rolling admissions — you can start at the beginning of the school year, or mid-year if space allows. Optio Academy is open to every student regardless of race, color, national origin, religion, or background."
      >
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              The Steps
            </h3>
            <ol className="space-y-3 list-decimal list-inside">
              {[
                'Reach out using the form below, or email us directly.',
                'Have a discovery call with Optio Academy and your student.',
                'Review the enrollment paperwork — we walk you through it.',
                'Live daily one-on-one instruction begins on the start date you choose.',
              ].map((step) => (
                <li key={step} className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  <span className="ml-1">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              What You Should Know
            </h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <Check />
                <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  <span className="font-semibold">You can leave anytime.</span> If Optio isn't
                  working, you're free to transfer to another school. We never ask families to sign
                  that away.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <Check />
                <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  <span className="font-semibold">Records stay private.</span> Your student's
                  educational records are protected under federal privacy law (FERPA) and never
                  shared without your permission.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <Check />
                <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  <span className="font-semibold">No surprises up front.</span> Before you enroll,
                  you'll see tuition, fees (there are none), the curriculum level, and the refund
                  policy in writing.
                </p>
              </li>
            </ul>
          </div>
        </div>
      </SectionAnchor>

      {/* ========== SAFETY ========== */}
      <SectionAnchor
        id="safety"
        sectionRef={safetyRef}
        kicker="Safety & Privacy"
        title="Your Student's Safety Is Built In"
        subtitle="Optio Academy is online, but the safety standards are the same ones you'd expect from any real school — and in some ways stronger."
        bg="bg-gray-50"
      >
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              Background-Checked Teachers
            </h3>
            <p className="text-gray-700 leading-relaxed">
              Every Optio Academy teacher and mentor passes a nationwide, fingerprint-based criminal
              background check before working with students — and stays in continuous monitoring for
              as long as they're with us. No exceptions.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              Mandatory Reporters
            </h3>
            <p className="text-gray-700 leading-relaxed">
              All Optio Academy staff are trained mandatory reporters. If a teacher sees a sign that
              a student might be in danger, they are required by law — and trained — to report it
              immediately to the proper authorities.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              Online Safety & Data Privacy
            </h3>
            <p className="text-gray-700 leading-relaxed">
              The Optio platform uses encrypted connections, secure logins, and follows the federal
              standards for protecting student data (FERPA and COPPA). We never sell student
              information. Parents have full control over their student's account.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              AI Tutor With Guardrails
            </h3>
            <p className="text-gray-700 leading-relaxed">
              Students have access to an AI study buddy that's content-filtered for K – 12. Every
              conversation is logged and visible to parents through the family dashboard. Help is
              always there — and so is oversight.
            </p>
          </div>
        </div>
      </SectionAnchor>

      {/* ========== ACCREDITATION (light) ========== */}
      <section id="accreditation" className="py-12 bg-white scroll-mt-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 sm:p-8">
              <p
                className="text-sm font-semibold uppercase tracking-wider text-optio-purple mb-3"
                style={{ fontFamily: 'Poppins' }}
              >
                Accreditation
              </p>
              <h3 className="text-2xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Accreditation in Progress
              </h3>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Optio Academy is pursuing institutional accreditation for the 2026 – 2027 school
                year. As soon as our accreditation is final, we'll post the accrediting body and the
                effective date here.
              </p>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== CONTACT ========== */}
      <SectionAnchor
        id="contact"
        sectionRef={contactRef}
        kicker="Contact"
        title="Talk to Us"
        bg="bg-gray-50"
      >
        <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
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
                Optio Academy is operated by Optio, LLC.
              </p>
            </div>
          </div>
        </div>
      </SectionAnchor>

      {/* ========== INLINE CONTACT FORM ========== */}
      <InlineContactForm
        source="academy"
        heading="Interested in Optio Academy?"
        subheading="Tell us a little about your student and we'll be in touch."
        placeholder="Grade level, interests, and anything else you'd like us to know"
      />
    </MarketingLayout>
  )
}

export default AcademyPage
