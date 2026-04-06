import React from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import { RevealSection, RevealItem } from '../../components/marketing/RevealSection'
import { useSectionView, useCtaTracker } from '../../components/marketing/useMarketingAnalytics'
import InlineContactForm from '../../components/marketing/InlineContactForm'

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
        <title>How It Works | Optio</title>
        <meta name="description" content="See how Optio turns student interests into personalized quests, builds portfolios automatically, and connects families through an activity feed with observer access and bounties." />
        <meta property="og:title" content="How It Works | Optio" />
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
              Most students learn more outside of school than inside it. Optio makes all of that learning visible, shareable, and official.
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
                Pick a Project. Make It Yours.
              </h2>
              <p className="text-gray-600 mb-6 text-lg" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                On Optio, students learn through "Quests," which are just projects built around things they actually care about. Instead of lectures and tests, they do real work on real topics.
              </p>
              <div className="space-y-3">
                {[
                  'Love music? Your piano lessons become the foundation of a music class',
                  'Into gaming? Build your own game and earn a technology credit',
                  'Play sports? Your season becomes a PE credit with fitness tracking',
                  'Pick from a library of ideas or create something totally your own',
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
                Document What You Did
              </h2>
              <p className="text-gray-600 mb-6 text-lg" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                As students work on their projects, they document what they're doing and learning. Photos, reflections, files, and videos. This is the proof that real learning happened.
              </p>
              <div className="space-y-3">
                {[
                  'Upload photos, videos, documents, and reflections',
                  'Each piece of work connects to a skill area',
                  'Document once. No busywork or redundant assignments',
                  'Your work is the proof. No tests required',
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
                It All Becomes a Portfolio
              </h2>
              <p className="text-gray-600 mb-6 text-lg" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Everything students document automatically becomes a shareable portfolio. No manual uploading, no extra steps. As they complete projects, their portfolio grows on its own.
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
                  {/* Radar chart */}
                  <div className="flex justify-center mb-6">
                    <div className="relative w-48 h-48 sm:w-56 sm:h-56">
                    {/* Icon overlays */}
                    {[
                      { color: '#AF56E5', bg: '#F2E7F9', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" /></svg> },
                      { color: '#3DA24A', bg: '#E3F6E5', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg> },
                      { color: '#2469D1', bg: '#DDF1FC', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5m14.8.8l-1.57.393M9.75 3.104a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3m-14.8-.8l-.393.393M14.25 3.104c.251.023.501.05.75.082M5 14.5l-.393.393m0 0L3.5 16c-.7.7-.3 1.9.7 2.1 2.5.5 5.1.7 7.8.7s5.3-.2 7.8-.7c1-.2 1.4-1.4.7-2.1l-1.1-1.1" /></svg> },
                      { color: '#E65C5C', bg: '#FBE5E5', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg> },
                      { color: '#FF9028', bg: '#FFF0E1', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg> },
                    ].map((d, i) => {
                      const angle = (Math.PI * 2 * i / 5) - Math.PI / 2
                      const pct = 95 / 100
                      const left = `${50 + 50 * pct * Math.cos(angle)}%`
                      const top = `${50 + 50 * pct * Math.sin(angle)}%`
                      return (
                        <div key={i} className="absolute w-7 h-7 rounded-full flex items-center justify-center -translate-x-1/2 -translate-y-1/2 border" style={{ left, top, backgroundColor: d.bg, borderColor: d.color, color: d.color }}>
                          {d.icon}
                        </div>
                      )
                    })}
                    <svg viewBox="0 0 200 200" className="w-full h-full">
                      {/* Grid rings */}
                      {[80, 60, 40, 20].map((r) => (
                        <polygon key={r} points={[0,1,2,3,4].map((i) => {
                          const angle = (Math.PI * 2 * i / 5) - Math.PI / 2
                          return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`
                        }).join(' ')} fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
                      ))}
                      {/* Axis lines */}
                      {[0,1,2,3,4].map((i) => {
                        const angle = (Math.PI * 2 * i / 5) - Math.PI / 2
                        return <line key={i} x1="100" y1="100" x2={100 + 80 * Math.cos(angle)} y2={100 + 80 * Math.sin(angle)} stroke="#e5e7eb" strokeWidth="0.5" />
                      })}
                      {/* Data polygon */}
                      <polygon
                        points={[
                          { val: 0.80 }, // Art
                          { val: 0.60 }, // Communication
                          { val: 0.35 }, // STEM
                          { val: 0.45 }, // Civics
                          { val: 0.25 }, // Wellness
                        ].map((d, i) => {
                          const angle = (Math.PI * 2 * i / 5) - Math.PI / 2
                          return `${100 + 80 * d.val * Math.cos(angle)},${100 + 80 * d.val * Math.sin(angle)}`
                        }).join(' ')}
                        fill="url(#radarGradient)"
                        fillOpacity="0.3"
                        stroke="#6D469B"
                        strokeWidth="2"
                      />
                      {/* Data points */}
                      {[0.80, 0.60, 0.35, 0.45, 0.25].map((val, i) => {
                        const angle = (Math.PI * 2 * i / 5) - Math.PI / 2
                        return <circle key={i} cx={100 + 80 * val * Math.cos(angle)} cy={100 + 80 * val * Math.sin(angle)} r="3" fill="#6D469B" />
                      })}
                      <defs>
                        <linearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#6D469B" />
                          <stop offset="100%" stopColor="#EF597B" />
                        </linearGradient>
                      </defs>
                    </svg>
                    </div>
                  </div>
                  {/* Legend */}
                  <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mb-4">
                    {[
                      { label: 'Art', color: '#AF56E5', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" /></svg> },
                      { label: 'Communication', color: '#3DA24A', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg> },
                      { label: 'STEM', color: '#2469D1', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 3v4.586l-4.293 4.293A1 1 0 006.414 13.5h11.172a1 1 0 00.707-1.707L14 7.586V3m-4 0h4m-4 0H8m6 0h2M7 21h10a2 2 0 002-2v-5H5v5a2 2 0 002 2z" /></svg> },
                      { label: 'Civics', color: '#E65C5C', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg> },
                      { label: 'Wellness', color: '#FF9028', icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg> },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded flex items-center justify-center" style={{ color: item.color }}>
                          {item.icon}
                        </div>
                        <span className="text-[10px] text-gray-500 font-medium" style={{ fontFamily: 'Poppins' }}>{item.label}</span>
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
                Share It With the People Who Matter
              </h2>
              <p className="text-gray-600 mb-6 text-lg" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Think of it like a private Instagram for learning. Parents, grandparents, mentors, and other trusted adults get a feed of your student's latest work. They can see progress as it happens.
              </p>
              <div className="space-y-3">
                {[
                  'Updates appear as students complete work',
                  'Parents decide exactly who can see what',
                  'Family members can leave encouragement and comments',
                  'Familiar and easy to use for everyone in the family',
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
                Parents can invite grandparents, mentors, and other trusted adults to follow along. These "Observers" see the activity feed and can even post real-world challenges called "Bounties" for students to complete.
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
              Turn It Into Official Credit
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-12" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              When students are ready, all that documented learning can become real, accredited credit. Official transcripts, high school diplomas, and even college credit.
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                title: 'Transfer Credit',
                desc: 'Already in school? Take a class through Optio on something you care about and transfer the credit back to your high school transcript.',
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                ),
              },
              {
                title: 'Full Diploma',
                desc: 'Want to leave traditional school? Design your entire high school education with a dedicated teacher guiding you.',
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
