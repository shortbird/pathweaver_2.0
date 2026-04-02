import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import { RevealSection, RevealItem } from '../../components/marketing/RevealSection'
import { useSectionView, useCtaTracker } from '../../components/marketing/useMarketingAnalytics'
import ContactInfoModal from '../../components/ContactInfoModal'

const PAGE = 'how_it_works'

const OPTIO_ICON = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg'

const HowItWorksPage = () => {
  const [contactOpen, setContactOpen] = useState(false)
  const trackCta = useCtaTracker(PAGE)

  const heroRef = useSectionView('hero', PAGE)
  const overviewRef = useSectionView('overview', PAGE)
  const questsRef = useSectionView('quests', PAGE)
  const evidenceRef = useSectionView('evidence', PAGE)
  const portfolioRef = useSectionView('portfolio', PAGE)
  const feedRef = useSectionView('activity_feed', PAGE)
  const observerRef = useSectionView('observers', PAGE)
  const bountiesRef = useSectionView('bounties', PAGE)
  const credentialsRef = useSectionView('credentials', PAGE)
  const ctaRef = useSectionView('final_cta', PAGE)

  return (
    <MarketingLayout>
      <Helmet>
        <title>How It Works | Optio Education</title>
        <meta name="description" content="See how Optio turns student interests into personalized quests, builds portfolios automatically, and connects families through an activity feed with observer access and bounties." />
        <meta property="og:title" content="How It Works | Optio Education" />
        <meta property="og:description" content="Personalized quests, automatic portfolios, family activity feed, observer access, and bounties. See the full Optio platform flow." />
        <meta property="og:url" content="https://www.optioeducation.com/how-it-works" />
        <link rel="canonical" href="https://www.optioeducation.com/how-it-works" />
      </Helmet>

      {/* ========== HERO ========== */}
      <section ref={heroRef} className="py-16 sm:py-24 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <RevealSection>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mb-6">
              <img src={OPTIO_ICON} alt="Optio" className="w-10 h-10" />
            </div>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              How Optio Works
            </h1>
            <p
              className="text-xl sm:text-2xl text-white/80 max-w-3xl mx-auto leading-relaxed"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              Students pursue real interests. Their work becomes evidence. Evidence builds a portfolio. Family and mentors cheer them on -- and can even post challenges.
            </p>
          </RevealSection>
        </div>
      </section>

      {/* ========== VISUAL FLOW OVERVIEW ========== */}
      <section ref={overviewRef} className="py-12 sm:py-16 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-0">
            {[
              { label: 'Quests', color: 'from-blue-500 to-indigo-600' },
              { label: 'Evidence', color: 'from-emerald-500 to-teal-600' },
              { label: 'Portfolio', color: 'from-optio-purple to-optio-pink' },
              { label: 'Activity Feed', color: 'from-amber-500 to-orange-500' },
              { label: 'Observers & Bounties', color: 'from-rose-500 to-pink-600' },
              { label: 'Credentials', color: 'from-yellow-500 to-amber-600' },
            ].map((step, i) => (
              <React.Fragment key={step.label}>
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br ${step.color} text-white flex items-center justify-center text-sm sm:text-base font-bold shadow-md`}>
                    {i + 1}
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-gray-700 mt-2 text-center whitespace-nowrap" style={{ fontFamily: 'Poppins' }}>
                    {step.label}
                  </p>
                </div>
                {i < 5 && (
                  <svg className="w-6 h-6 text-gray-300 flex-shrink-0 hidden sm:block mx-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ========== STEP 1: QUESTS ========== */}
      <section ref={questsRef} className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <RevealSection>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-lg font-bold">1</div>
                <span className="text-sm font-semibold text-blue-600 uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>The Starting Point</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Learning Starts With Interests
              </h2>
              <p className="text-gray-600 mb-6 text-lg" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Students don't sit through pre-made courses. They pursue Quests -- personalized learning adventures built around things they actually care about.
              </p>
              <div className="space-y-3">
                {[
                  'A music lover studies music theory through their piano practice',
                  'A gamer learns programming by building their own game',
                  'A nature enthusiast earns science credit through field research',
                  'Students can create their own quests or choose from a library',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
            <RevealSection delay={200}>
              {/* Quest card mockup */}
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 text-white">
                  <p className="text-sm font-medium opacity-80">Active Quest</p>
                  <h3 className="text-2xl font-bold" style={{ fontFamily: 'Poppins' }}>Photography & Visual Storytelling</h3>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1">
                      <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full w-3/5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-1000"></div>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-gray-600" style={{ fontFamily: 'Poppins' }}>340 / 500 XP</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { task: 'Photograph 5 local landmarks', xp: 50, done: true },
                      { task: 'Write artist statement', xp: 75, done: true },
                      { task: 'Study composition techniques', xp: 60, done: false },
                      { task: 'Create photo essay on community', xp: 100, done: false },
                    ].map((task) => (
                      <div key={task.task} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-50">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${task.done ? 'bg-green-500' : 'border-2 border-gray-300'}`}>
                          {task.done && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className={`flex-1 text-sm ${task.done ? 'text-gray-500 line-through' : 'text-gray-800'}`} style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{task.task}</span>
                        <span className="text-xs font-semibold text-optio-purple" style={{ fontFamily: 'Poppins' }}>{task.xp} XP</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ========== STEP 2: EVIDENCE (Learning Moments) ========== */}
      <section ref={evidenceRef} className="py-16 sm:py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <RevealSection delay={200} className="order-2 lg:order-1">
              {/* Evidence mockup */}
              <div className="space-y-4">
                {[
                  {
                    type: 'Photo',
                    title: 'Golden hour at the old bridge',
                    desc: 'Experimented with rule of thirds and natural lighting. The shadows were perfect around 6pm.',
                    pillar: 'Art',
                    pillarColor: 'bg-pink-100 text-pink-700',
                    time: '2 hours ago',
                  },
                  {
                    type: 'Reflection',
                    title: 'What I learned about composition',
                    desc: 'After studying Ansel Adams, I realized I was centering everything. Tried off-center framing today and the results were way more interesting.',
                    pillar: 'Communication',
                    pillarColor: 'bg-blue-100 text-blue-700',
                    time: 'Yesterday',
                  },
                  {
                    type: 'File',
                    title: 'Photo essay draft v2',
                    desc: 'Revised version with 12 photos organized by theme. Added captions with historical context.',
                    pillar: 'Art',
                    pillarColor: 'bg-pink-100 text-pink-700',
                    time: '3 days ago',
                  },
                ].map((item) => (
                  <div key={item.title} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${item.pillarColor}`}>{item.pillar}</span>
                      <span className="text-xs text-gray-400" style={{ fontFamily: 'Poppins' }}>{item.time}</span>
                    </div>
                    <h4 className="font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>{item.title}</h4>
                    <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
            <RevealSection className="order-1 lg:order-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center text-lg font-bold">2</div>
                <span className="text-sm font-semibold text-emerald-600 uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>Doing The Work</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Work Creates Evidence
              </h2>
              <p className="text-gray-600 mb-6 text-lg" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                As students complete tasks, they create Learning Moments -- photos, reflections, files, and projects that serve as evidence of personalized learning.
              </p>
              <div className="space-y-3">
                {[
                  'Photos, videos, documents, and reflections',
                  'Each piece maps to one of five learning pillars',
                  'Students document once -- no busywork',
                  'Evidence is tied to specific quest tasks',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ========== STEP 3: PORTFOLIO ========== */}
      <section ref={portfolioRef} className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <RevealSection>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center text-lg font-bold">3</div>
                <span className="text-sm font-semibold text-optio-purple uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>Automatic Organization</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Evidence Builds a Portfolio
              </h2>
              <p className="text-gray-600 mb-6 text-lg" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                All that evidence automatically flows into a professional portfolio. No manual uploading, no extra steps. The portfolio grows as the student learns.
              </p>
              <div className="space-y-3">
                {[
                  'Organized by quest, pillar, and time period',
                  'Shareable with colleges, employers, or family',
                  'Visual showcase of real work, not just grades',
                  'Grows automatically as students complete tasks',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-optio-purple flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
            <RevealSection delay={200}>
              {/* Portfolio mockup */}
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-optio-purple to-optio-pink p-6 text-white">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold">E</div>
                    <div>
                      <h3 className="text-lg font-bold" style={{ fontFamily: 'Poppins' }}>Emma's Portfolio</h3>
                      <p className="text-sm opacity-80">Photography & Visual Storytelling</p>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  {/* Pillar bars */}
                  <div className="space-y-3 mb-6">
                    {[
                      { pillar: 'Art', pct: 80, color: 'from-pink-400 to-rose-500' },
                      { pillar: 'Communication', pct: 60, color: 'from-blue-400 to-indigo-500' },
                      { pillar: 'STEM', pct: 35, color: 'from-emerald-400 to-teal-500' },
                      { pillar: 'Civics', pct: 45, color: 'from-amber-400 to-orange-500' },
                      { pillar: 'Wellness', pct: 25, color: 'from-purple-400 to-violet-500' },
                    ].map((p) => (
                      <div key={p.pillar} className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-gray-500 w-24 text-right" style={{ fontFamily: 'Poppins' }}>{p.pillar}</span>
                        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full bg-gradient-to-r ${p.color} rounded-full`} style={{ width: `${p.pct}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[1,2,3,4,5,6].map((i) => (
                      <div key={i} className="aspect-square rounded-lg bg-gray-100 flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ========== STEP 4: ACTIVITY FEED ========== */}
      <section ref={feedRef} className="py-16 sm:py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <RevealSection delay={200} className="order-2 lg:order-1">
              {/* Feed mockup */}
              <div className="bg-gray-50 rounded-2xl p-4 sm:p-6 border border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center">
                    <img src={OPTIO_ICON} alt="" className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Poppins' }}>Activity Feed</span>
                </div>
                <div className="space-y-3">
                  {[
                    { user: 'Emma', action: 'completed a task', detail: '"Photograph 5 local landmarks"', xp: '+50 XP', time: '2h ago', avatar: 'E' },
                    { user: 'Grandma Sue', action: 'posted a bounty', detail: '"Help organize my photo albums"', xp: '75 XP reward', time: '5h ago', avatar: 'S', isBounty: true },
                    { user: 'Emma', action: 'submitted evidence', detail: 'Photo essay draft with 12 images', xp: '+75 XP', time: '1d ago', avatar: 'E' },
                    { user: 'Uncle Dave', action: 'left encouragement', detail: '"These photos are incredible! So proud of you."', time: '1d ago', avatar: 'D', isComment: true },
                  ].map((item, i) => (
                    <div key={i} className={`bg-white rounded-xl p-4 border ${item.isBounty ? 'border-amber-200 bg-amber-50' : item.isComment ? 'border-green-200 bg-green-50' : 'border-gray-100'}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                          item.isBounty ? 'bg-amber-500' : item.isComment ? 'bg-green-500' : 'bg-gradient-to-br from-optio-purple to-optio-pink'
                        }`}>
                          {item.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                            <span className="font-semibold text-gray-900">{item.user}</span>{' '}
                            <span className="text-gray-500">{item.action}</span>
                          </p>
                          <p className="text-sm text-gray-700 mt-0.5" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.detail}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400">{item.time}</span>
                            {item.xp && <span className="text-xs font-semibold text-optio-purple">{item.xp}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </RevealSection>
            <RevealSection className="order-1 lg:order-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center text-lg font-bold">4</div>
                <span className="text-sm font-semibold text-amber-600 uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>Social Learning</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                A Feed The Whole Family Follows
              </h2>
              <p className="text-gray-600 mb-6 text-lg" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                The portfolio appears as a social media-style activity feed. Parents, grandparents, mentors, and other trusted adults can follow along and engage with student learning in real time.
              </p>
              <div className="space-y-3">
                {[
                  'Real-time updates as students complete work',
                  'Parents control exactly who has access',
                  'Observers can leave encouragement and comments',
                  'Feels familiar -- like a private Instagram for learning',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p>
                  </div>
                ))}
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ========== STEP 5: OBSERVERS & BOUNTIES ========== */}
      <section ref={observerRef} className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <RevealSection>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 text-white flex items-center justify-center text-lg font-bold">5</div>
                <span className="text-sm font-semibold text-rose-600 uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>Family Engagement</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Observers and Bounties
              </h2>
              <p className="text-gray-600 mb-6 text-lg" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Parents invite trusted adults as Observers. Observers can view the activity feed, cheer progress, and post Bounties -- real-world challenges that earn XP.
              </p>
              <div className="space-y-4">
                <div className="bg-white rounded-xl p-5 border border-gray-200">
                  <h4 className="font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>Observer Access</h4>
                  <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    Grandparents, aunts, uncles, mentors, and family friends get view-only access. They see learning happen in real time and can leave encouragement. Parents control who gets access.
                  </p>
                </div>
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-200">
                  <h4 className="font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>Bounties</h4>
                  <p className="text-sm text-gray-600 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                    Observers can post Bounties -- real-world tasks that specific students can complete for XP. It turns everyday help into a learning opportunity.
                  </p>
                  <div className="bg-white rounded-lg p-4 border border-amber-100">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">G</div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900" style={{ fontFamily: 'Poppins' }}>Grandma Sue posted a bounty</p>
                        <p className="text-sm text-gray-700 mt-1" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                          "Help me organize my photo albums from the 1980s. Sort them by year and label the people in each photo."
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">75 XP reward</span>
                          <span className="text-xs text-gray-400">Available to: Emma, Jake</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </RevealSection>
            <RevealSection delay={200}>
              {/* Observer access diagram */}
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8">
                <h3 className="text-lg font-bold text-gray-900 mb-6 text-center" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Who Can See What</h3>
                <div className="space-y-4">
                  {[
                    { role: 'Student', access: 'Full access to their own quests, tasks, portfolio, and feed', color: 'bg-gradient-to-r from-optio-purple to-optio-pink', icon: 'S' },
                    { role: 'Parent', access: 'Dashboard view of all children, controls observer access, manages dependents', color: 'bg-gradient-to-r from-blue-500 to-indigo-600', icon: 'P' },
                    { role: 'Observer', access: 'View-only activity feed, can comment and post bounties', color: 'bg-gradient-to-r from-emerald-500 to-teal-600', icon: 'O' },
                    { role: 'Advisor', access: 'Guides student learning, reviews and approves task completions', color: 'bg-gradient-to-r from-amber-500 to-orange-500', icon: 'A' },
                  ].map((item) => (
                    <div key={item.role} className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full ${item.color} text-white flex items-center justify-center text-sm font-bold flex-shrink-0`}>
                        {item.icon}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>{item.role}</p>
                        <p className="text-xs text-gray-500" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.access}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ========== STEP 6: CREDENTIALS ========== */}
      <section ref={credentialsRef} className="py-16 sm:py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <RevealSection>
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-amber-600 text-white flex items-center justify-center text-lg font-bold">6</div>
              <span className="text-sm font-semibold text-amber-600 uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>The Outcome</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              Real Credentials From Real Learning
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-12" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              All that personalized learning can earn official, accredited credentials. WASC-accredited transcripts, high school diplomas, and dual-enrollment college credit.
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                title: 'Transfer Credit',
                desc: 'Take individual classes through Optio and transfer official credit to your current school.',
                price: '$249 / credit',
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                ),
              },
              {
                title: 'Full Diploma',
                desc: 'Self-direct your entire high school education through Optio Academy with a dedicated teacher.',
                price: '$8,000 / year',
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14l9-5-9-5-9 5 9 5z" />
                    <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
                  </svg>
                ),
              },
              {
                title: 'College Credit',
                desc: 'Earn transferable college credit through dual enrollment while completing high school coursework.',
                price: 'Included',
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                ),
              },
            ].map((item, i) => (
              <RevealItem key={item.title} index={i}>
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 h-full flex flex-col">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-amber-100 to-yellow-100 text-amber-600 mb-4 mx-auto">
                    {item.icon}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>{item.title}</h3>
                  <p className="text-sm text-gray-600 mb-4 flex-1" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
                  <p className="text-lg font-bold text-optio-purple" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>{item.price}</p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== THE PHILOSOPHY ========== */}
      <section className="py-16 sm:py-20 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <RevealSection>
            <h2 className="text-3xl sm:text-4xl font-bold mb-6" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              The Process Is The Goal
            </h2>
            <p className="text-xl text-white/80 leading-relaxed max-w-3xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              Optio isn't about reaching a destination or impressing others. It's about who you become through the journey of discovery, creation, and growth. Learning matters today -- not just for some future outcome.
            </p>
          </RevealSection>
        </div>
      </section>

      {/* ========== FINAL CTA ========== */}
      <section ref={ctaRef} className="py-16 sm:py-20 bg-gradient-to-r from-optio-purple to-optio-pink">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            Ready to See It In Action?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            Start free. Build your first quest. See the portfolio grow.
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
            <button
              onClick={() => { trackCta('final_get_info'); setContactOpen(true) }}
              className="bg-transparent border-2 border-white text-white hover:bg-white/10 px-8 py-4 rounded-lg font-bold text-lg transition-all inline-flex items-center justify-center"
              style={{ fontFamily: 'Poppins' }}
            >
              Get More Info
            </button>
          </div>
          <p className="text-white/70 text-sm mt-8" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            Questions? Email{' '}
            <a href="mailto:support@optioeducation.com" className="underline hover:no-underline text-white/90">
              support@optioeducation.com
            </a>
          </p>
        </div>
      </section>

      <ContactInfoModal isOpen={contactOpen} onClose={() => setContactOpen(false)} contactType="demo" />
    </MarketingLayout>
  )
}

export default HowItWorksPage
