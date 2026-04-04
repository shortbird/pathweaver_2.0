import React from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import { RevealSection, RevealItem } from '../../components/marketing/RevealSection'
import { useSectionView, useCtaTracker } from '../../components/marketing/useMarketingAnalytics'
import InlineContactForm from '../../components/marketing/InlineContactForm'

const PAGE = 'for_schools'

const IMAGES = {
  hero: 'https://images.pexels.com/photos/5621957/pexels-photo-5621957.jpeg?auto=compress&cs=tinysrgb&w=1920',
  engagement: 'https://images.pexels.com/photos/8423048/pexels-photo-8423048.jpeg?auto=compress&cs=tinysrgb&w=800',
  management: 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=800',
  parent: 'https://images.pexels.com/photos/7799601/pexels-photo-7799601.jpeg?auto=compress&cs=tinysrgb&w=800',
}

const CheckIcon = () => (
  <svg className="w-5 h-5 text-optio-purple flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const ForSchoolsPage = () => {
  const trackCta = useCtaTracker(PAGE)

  const heroRef = useSectionView('hero', PAGE)
  const whoRef = useSectionView('who_its_for', PAGE)
  const outcomesRef = useSectionView('outcomes', PAGE)
  const featuresRef = useSectionView('features', PAGE)
  const howRef = useSectionView('how_it_works', PAGE)
  const pricingRef = useSectionView('pricing', PAGE)
  return (
    <MarketingLayout>
      <Helmet>
        <title>For Schools & Organizations | Optio</title>
        <meta name="description" content="Improve student outcomes through self-directed learning. Optio helps schools boost academic engagement, student well-being, and real-world skill development." />
        <meta property="og:title" content="For Schools & Organizations | Optio" />
        <meta property="og:description" content="Student-directed learning that improves academic outcomes, mental health, and well-being. For microschools, online schools, learning centers, and traditional schools." />
        <meta property="og:url" content="https://www.optioeducation.com/for-schools" />
        <link rel="canonical" href="https://www.optioeducation.com/for-schools" />
      </Helmet>

      {/* ========== HERO ========== */}
      <section ref={heroRef} className="relative overflow-hidden min-h-[55vh] flex items-end">
        <div className="absolute inset-0">
          <img src={IMAGES.hero} alt="" className="w-full h-full object-cover" style={{ objectPosition: 'center 40%' }} />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/95 via-gray-900/60 via-50% to-transparent" />
        </div>
        <div className="relative max-w-5xl mx-auto px-4 pb-12 sm:pb-16 pt-32 sm:pt-40 text-center text-white">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 leading-tight drop-shadow-lg" style={{ fontFamily: 'Poppins', fontWeight: 700, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
            Better Outcomes Through Student-Directed Learning
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed mb-8 drop-shadow-md" style={{ fontFamily: 'Poppins', fontWeight: 500, textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
            When students pursue their own interests, they show up differently. Stronger academics, better mental health, and skills that transfer to real life.
          </p>
          <a
            href="#get-info"
            onClick={() => trackCta('hero_get_info')}
            className="inline-block bg-white text-optio-purple font-semibold px-8 py-3 rounded-full text-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
            style={{ fontFamily: 'Poppins', fontWeight: 600 }}
          >
            Get More Info
          </a>
        </div>
      </section>

      {/* ========== WHO IT'S FOR ========== */}
      <section ref={whoRef} className="py-16 sm:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Built For Every Kind of School
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Whether you run a 5-student microschool or a 500-student district program, Optio adapts to your model.
              </p>
            </div>
          </RevealSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { type: 'Microschools', desc: 'Personalized learning with portfolio tracking and optional accreditation through our accredited partners', icon: '5-30 students' },
              { type: 'Online Schools', desc: 'Student-directed curriculum that keeps remote learners engaged and building real skills', icon: '10-500+ students' },
              { type: 'Learning Centers', desc: 'Co-ops, tutoring centers, and after-school programs with optional accreditation pathways', icon: '10-200 students' },
              { type: 'Traditional Schools', desc: 'Supplement existing programs with personalized, interest-driven learning that improves outcomes', icon: '50-500+ students' },
            ].map((item, i) => (
              <RevealItem key={item.type} index={i}>
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 h-full">
                  <p className="text-xs font-semibold text-optio-purple uppercase tracking-wider mb-2" style={{ fontFamily: 'Poppins' }}>{item.icon}</p>
                  <h3 className="text-lg font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>{item.type}</h3>
                  <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== STUDENT OUTCOMES ========== */}
      <section ref={outcomesRef} className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Why Student-Directed Learning Works
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                When students have agency over what and how they learn, the results speak for themselves.
              </p>
            </div>
          </RevealSection>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                title: 'Stronger Academics',
                desc: 'Students who learn through their interests develop deeper understanding and retain more. They write better, think more critically, and connect ideas across subjects because the learning matters to them.',
                img: 'https://images.pexels.com/photos/5428012/pexels-photo-5428012.jpeg?auto=compress&cs=tinysrgb&w=400',
              },
              {
                title: 'Better Mental Health',
                desc: 'Removing the pressure of grades, compliance, and one-size-fits-all pacing reduces anxiety and burnout. Students feel capable and in control of their own growth.',
                img: 'https://images.pexels.com/photos/5622142/pexels-photo-5622142.jpeg?auto=compress&cs=tinysrgb&w=400',
              },
              {
                title: 'Real-World Skills',
                desc: 'Quest-based learning builds skills that transfer beyond school: project management, self-discipline, communication, and creative problem-solving through work students actually care about.',
                img: 'https://images.pexels.com/photos/8033875/pexels-photo-8033875.jpeg?auto=compress&cs=tinysrgb&w=400',
              },
            ].map((item, i) => (
              <RevealItem key={item.title} index={i}>
                <div className="bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm h-full">
                  <div className="aspect-[16/9] overflow-hidden">
                    <img src={item.img} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>{item.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== THE OPTIO PHILOSOPHY ========== */}
      <section className="py-16 sm:py-24 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-14">
              <p className="text-sm font-semibold text-optio-pink uppercase tracking-wider mb-3" style={{ fontFamily: 'Poppins' }}>The Optio Philosophy</p>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                The Process Is The Goal
              </h2>
              <p className="text-xl text-white/70 max-w-3xl mx-auto leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Learning is not about reaching a destination or impressing others. It's about who students become through the journey of discovery, creation, and growth.
              </p>
            </div>
          </RevealSection>

          <div className="grid sm:grid-cols-3 gap-6 mb-12">
            {[
              {
                title: 'Choice',
                subtitle: 'Autonomy',
                desc: 'Students make meaningful decisions about their learning. They choose which quests to pursue, how to demonstrate understanding, and what evidence to share. We never dictate a single path.',
              },
              {
                title: 'Competence',
                subtitle: 'Growth',
                desc: 'Challenges meet students where they are. Tasks stretch them just enough to feel accomplishment without overwhelming them. Progress is based on mastery, not compliance.',
              },
              {
                title: 'Connection',
                subtitle: 'Relatedness',
                desc: 'Learning feels relevant to who students are and who they are becoming. They see themselves in the content. Family and mentors participate. Education becomes a shared experience.',
              },
            ].map((item, i) => (
              <RevealItem key={item.title} index={i}>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/10 h-full">
                  <p className="text-xs font-semibold text-optio-pink uppercase tracking-wider mb-1" style={{ fontFamily: 'Poppins' }}>{item.subtitle}</p>
                  <h3 className="text-xl font-bold text-white mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>{item.title}</h3>
                  <p className="text-sm text-white/70 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
                </div>
              </RevealItem>
            ))}
          </div>

          <RevealSection>
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-white/60 text-sm leading-relaxed mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                These three pillars come from Self-Determination Theory, decades of research showing that intrinsic motivation flourishes when students have autonomy, feel competent, and connect personally with their learning. When all three align, motivation becomes self-sustaining.
              </p>
              <div className="grid sm:grid-cols-2 gap-4 text-left max-w-lg mx-auto">
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <p className="text-xs text-white/40 mb-1" style={{ fontFamily: 'Poppins' }}>Traditional approach</p>
                  <p className="text-sm text-white/50 line-through" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>"This will help you in the future"</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4 border border-optio-pink/30">
                  <p className="text-xs text-optio-pink mb-1" style={{ fontFamily: 'Poppins' }}>Optio approach</p>
                  <p className="text-sm text-white" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>"This is helping you grow right now"</p>
                </div>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== HOW OPTIO WORKS IN YOUR SCHOOL ========== */}
      <section ref={featuresRef} className="py-16 sm:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                How Optio Works in Your School
              </h2>
            </div>
          </RevealSection>

          {/* Feature 1: Personalized Learning */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16 sm:mb-20">
            <RevealSection>
              <img src={IMAGES.engagement} alt="Student showing creative work" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
            </RevealSection>
            <RevealSection delay={200}>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Interest-Driven Quests
              </h3>
              <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Students learn through personalized Quests built around their real interests. A music lover studies theory through their piano practice. A gamer learns programming by building a game. Learning becomes something they want to do.
              </p>
              <div className="space-y-3">
                {[
                  'Students choose or create their own learning adventures',
                  'XP system across five learning pillars replaces traditional grades',
                  'Automatic portfolio captures work as students complete tasks',
                  'Advisors guide and support without controlling the path',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckIcon />
                    <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
          </div>

          {/* Feature 2: Student Management */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16 sm:mb-20">
            <RevealSection delay={200} className="order-2 lg:order-1">
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Program Management Made Simple
              </h3>
              <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Run your entire program from a single dashboard. Enroll students, assign advisors, track progress, and see engagement across your whole organization.
              </p>
              <div className="space-y-3">
                {[
                  'Enroll and manage student cohorts',
                  'Track progress across all learners in real-time',
                  'Assign advisors to individual students',
                  'Organization-wide analytics and reporting',
                  'Custom branding for your program',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckIcon />
                    <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
            <RevealSection className="order-1 lg:order-2">
              <img src={IMAGES.management} alt="Team collaboration" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
            </RevealSection>
          </div>

          {/* Feature 3: Family Engagement */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <RevealSection>
              <img src={IMAGES.parent} alt="Family learning together" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
            </RevealSection>
            <RevealSection delay={200}>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Built-in Family Engagement
              </h3>
              <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Every family automatically gets a parent dashboard with a social media-style activity feed of their student's learning. Extended family can follow along as Observers and even post Bounties to encourage real-world learning.
              </p>
              <div className="space-y-3">
                {[
                  'Parent dashboard for every family, no extra setup',
                  'Activity feed shows learning as it happens',
                  'Observer access for grandparents and mentors',
                  'Bounty system turns family participation into XP',
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

      {/* ========== GETTING STARTED ========== */}
      <section ref={howRef} className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <RevealSection>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              Getting Started Is Simple
            </h2>
            <p className="text-lg text-gray-600 mb-12" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              You can be up and running in a day.
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-4 gap-6">
            {[
              { img: 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=400', title: 'Create Your Org', desc: 'Set up your organization with custom branding' },
              { img: 'https://images.pexels.com/photos/8613089/pexels-photo-8613089.jpeg?auto=compress&cs=tinysrgb&w=400', title: 'Enroll Students', desc: 'Add students individually or in bulk' },
              { img: 'https://images.pexels.com/photos/4145354/pexels-photo-4145354.jpeg?auto=compress&cs=tinysrgb&w=400', title: 'Launch Quests', desc: 'Use our library or create your own curriculum' },
              { img: 'https://images.pexels.com/photos/7692559/pexels-photo-7692559.jpeg?auto=compress&cs=tinysrgb&w=400', title: 'Watch Them Thrive', desc: 'Track engagement, portfolios, and growth' },
            ].map((item, i) => (
              <RevealItem key={item.title} index={i}>
                <div className="text-center">
                  <div className="aspect-square overflow-hidden rounded-xl mb-3 bg-gray-100">
                    <img src={item.img} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>{item.title}</h3>
                  <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== PRICING TEASER ========== */}
      <section ref={pricingRef} className="py-16 sm:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="bg-white rounded-2xl p-8 sm:p-10 border border-gray-200 shadow-lg text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Pricing That Scales With You
              </h2>
              <p className="text-gray-600 mb-6 max-w-xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                The platform is free to use for tracking and portfolios. Credential services are priced per student based on your program size. Contact us for a custom quote.
              </p>
              <a
                href="#get-info"
                onClick={() => trackCta('pricing_get_info')}
                className="inline-flex items-center justify-center bg-gradient-to-r from-optio-purple to-optio-pink text-white px-8 py-4 rounded-lg font-bold text-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
                style={{ fontFamily: 'Poppins' }}
              >
                Get a Custom Quote
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== INLINE CONTACT FORM ========== */}
      <InlineContactForm
        source="sales"
        heading="Tell Us About Your Program"
        subheading="Drop your info and we'll reach out to discuss how Optio fits your school."
        placeholder="Tell us about your program. How many students? What are your goals?"
      />

    </MarketingLayout>
  )
}

export default ForSchoolsPage
