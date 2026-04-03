import React from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import { RevealSection, RevealItem } from '../../components/marketing/RevealSection'
import { useSectionView, useCtaTracker } from '../../components/marketing/useMarketingAnalytics'
import InlineContactForm from '../../components/marketing/InlineContactForm'
import PhilosophyTeaser from '../../components/marketing/PhilosophyTeaser'

const PAGE = 'how_it_works'

const OPTIO_ICON = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg'

const HowItWorksPage = () => {
  const trackCta = useCtaTracker(PAGE)

  const heroRef = useSectionView('hero', PAGE)
  const questsRef = useSectionView('quests', PAGE)
  const evidenceRef = useSectionView('evidence', PAGE)
  const portfolioRef = useSectionView('portfolio', PAGE)
  const feedRef = useSectionView('activity_feed', PAGE)
  const observerRef = useSectionView('observers', PAGE)
  const bountiesRef = useSectionView('bounties', PAGE)
  const credentialsRef = useSectionView('credentials', PAGE)
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
      <section ref={heroRef} className="py-16 sm:py-24 bg-gradient-to-r from-optio-purple to-optio-pink text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <RevealSection>
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
              Students pursue real interests. Their work becomes evidence. Evidence builds a portfolio. Family and mentors cheer them on and can even post challenges.
            </p>
          </RevealSection>
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
                Students don't sit through pre-made courses. They pursue Quests: personalized learning adventures built around things they actually care about.
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
                    task: 'Photograph 5 local landmarks',
                    evidence: 'Experimented with rule of thirds and natural lighting. The shadows were perfect around 6pm.',
                    pillar: 'Art',
                    pillarColor: 'bg-pink-100 text-pink-700',
                    attachments: '5 photos attached',
                  },
                  {
                    task: 'Study composition techniques',
                    evidence: 'After studying Ansel Adams, I realized I was centering everything. Tried off-center framing today and the results were way more interesting.',
                    pillar: 'Communication',
                    pillarColor: 'bg-blue-100 text-blue-700',
                    attachments: '1 document attached',
                  },
                  {
                    task: 'Create photo essay on community',
                    evidence: 'Revised version with 12 photos organized by theme. Added captions with historical context.',
                    pillar: 'Art',
                    pillarColor: 'bg-pink-100 text-pink-700',
                    attachments: '12 photos, 1 document attached',
                  },
                ].map((item) => (
                  <div key={item.task} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>Task</p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${item.pillarColor}`}>{item.pillar}</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>{item.task}</p>
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                          <p className="text-xs font-semibold text-optio-purple mb-1" style={{ fontFamily: 'Poppins' }}>Evidence</p>
                          <p className="text-sm text-gray-600 leading-relaxed" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.evidence}</p>
                          <div className="flex items-center gap-1.5 mt-2">
                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            <span className="text-xs text-gray-400" style={{ fontFamily: 'Poppins' }}>{item.attachments}</span>
                          </div>
                        </div>
                      </div>
                    </div>
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
                As students complete tasks, they create Learning Moments: photos, reflections, files, and projects that serve as evidence of personalized learning.
              </p>
              <div className="space-y-3">
                {[
                  'Photos, videos, documents, and reflections',
                  'Each piece maps to one of five learning pillars',
                  'Students document once. No busywork',
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
                    {[
                      'https://images.pexels.com/photos/1366919/pexels-photo-1366919.jpeg?auto=compress&cs=tinysrgb&w=200',
                      'https://images.pexels.com/photos/1624496/pexels-photo-1624496.jpeg?auto=compress&cs=tinysrgb&w=200',
                      'https://images.pexels.com/photos/2662116/pexels-photo-2662116.jpeg?auto=compress&cs=tinysrgb&w=200',
                      'https://images.pexels.com/photos/1266810/pexels-photo-1266810.jpeg?auto=compress&cs=tinysrgb&w=200',
                      'https://images.pexels.com/photos/3408744/pexels-photo-3408744.jpeg?auto=compress&cs=tinysrgb&w=200',
                      'https://images.pexels.com/photos/1108099/pexels-photo-1108099.jpeg?auto=compress&cs=tinysrgb&w=200',
                    ].map((img, i) => (
                      <div key={i} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                        <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
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
                  <img src={OPTIO_ICON} alt="" className="w-7 h-7" />
                  <span className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Poppins' }}>Activity Feed</span>
                </div>
                <div className="space-y-3">
                  {[
                    { user: 'Emma', action: 'completed a task', detail: '"Photograph 5 local landmarks"', xp: '+50 XP', time: '2h ago', photo: 'https://images.pexels.com/photos/3783725/pexels-photo-3783725.jpeg?auto=compress&cs=tinysrgb&w=100' },
                    { user: 'Grandma Sue', action: 'posted a bounty', detail: '"Help organize my photo albums"', xp: '75 XP reward', time: '5h ago', photo: 'https://images.pexels.com/photos/3768114/pexels-photo-3768114.jpeg?auto=compress&cs=tinysrgb&w=100', isBounty: true },
                    { user: 'Emma', action: 'submitted evidence', detail: 'Photo essay draft with 12 images', xp: '+75 XP', time: '1d ago', photo: 'https://images.pexels.com/photos/3783725/pexels-photo-3783725.jpeg?auto=compress&cs=tinysrgb&w=100' },
                    { user: 'Uncle Dave', action: 'left encouragement', detail: '"These photos are incredible! So proud of you."', time: '1d ago', photo: 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=100', isComment: true },
                  ].map((item, i) => (
                    <div key={i} className={`bg-white rounded-xl p-4 border ${item.isBounty ? 'border-amber-200 bg-amber-50' : item.isComment ? 'border-green-200 bg-green-50' : 'border-gray-100'}`}>
                      <div className="flex items-start gap-3">
                        <img src={item.photo} alt={item.user} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
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
                  'Feels familiar, like a private Instagram for learning',
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
          <RevealSection>
            <div className="text-center mb-12">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 text-white flex items-center justify-center text-lg font-bold">5</div>
                <span className="text-sm font-semibold text-rose-600 uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>Family Engagement</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Observers and Bounties
              </h2>
              <p className="text-gray-600 text-lg max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Parents invite grandparents, mentors, and trusted adults as Observers. They follow the activity feed, cheer progress, and can post Bounties for students to complete.
              </p>
            </div>
          </RevealSection>

          <div className="grid sm:grid-cols-2 gap-4 mb-8 max-w-2xl mx-auto">
            {[
              { role: 'Parent', desc: 'Controls who has observer access. Manages the family account.', color: 'border-t-blue-500' },
              { role: 'Observer', desc: 'Views the activity feed. Leaves encouragement. Posts bounties.', color: 'border-t-emerald-500' },
            ].map((item, i) => (
              <RevealItem key={item.role} index={i}>
                <div className={`bg-white rounded-xl p-5 border border-gray-100 shadow-sm border-t-4 ${item.color}`}>
                  <h4 className="font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>{item.role}</h4>
                  <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
                </div>
              </RevealItem>
            ))}
          </div>

          <RevealSection>
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-5 sm:p-6 border border-amber-200 max-w-2xl mx-auto">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-3" style={{ fontFamily: 'Poppins' }}>Example Bounty</p>
              <div className="flex items-start gap-3">
                <img src="https://images.pexels.com/photos/3768114/pexels-photo-3768114.jpeg?auto=compress&cs=tinysrgb&w=100" alt="Grandma Sue" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
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
          </RevealSection>
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
                price: '$250 / credit',
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
                price: '$250 / credit',
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
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

      {/* ========== INLINE CONTACT FORM ========== */}
      <InlineContactForm
        source="demo"
        heading="Get More Info"
        subheading="Drop your info and we'll reach out with everything you need."
        placeholder="What are you most interested in learning about?"
      />

    </MarketingLayout>
  )
}

export default HowItWorksPage
