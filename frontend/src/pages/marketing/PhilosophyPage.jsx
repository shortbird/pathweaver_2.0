import React, { useState, useEffect, lazy, Suspense } from 'react'
import { Helmet } from 'react-helmet-async'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import { RevealSection } from '../../components/marketing/RevealSection'
import InlineContactForm from '../../components/marketing/InlineContactForm'
import MobileMindMap from '../../components/philosophy/MobileMindMap'
import PhilosophySEOFallback from '../../components/philosophy/PhilosophySEOFallback'
import { fetchPhilosophyMap } from '../../services/philosophyService'

// Lazy-load MindMap so React Flow bundle isn't loaded on mobile
const MindMap = lazy(() => import('../../components/philosophy/MindMap'))

const useMediaQuery = (maxWidth) => {
  const [matches, setMatches] = useState(
    typeof window !== 'undefined' ? window.innerWidth < maxWidth : false
  )

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${maxWidth - 1}px)`)
    const handler = (e) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    setMatches(mql.matches)
    return () => mql.removeEventListener('change', handler)
  }, [maxWidth])

  return matches
}

const PhilosophyPage = () => {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const isMobile = useMediaQuery(768)

  useEffect(() => {
    fetchPhilosophyMap()
      .then(({ nodes: n, edges: e }) => {
        setNodes(n)
        setEdges(e)
      })
      .catch((err) => {
        console.error('Failed to load philosophy map:', err)
        setError('Failed to load content')
      })
      .finally(() => setLoading(false))
  }, [])

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
      <section className="min-h-[60vh] flex items-center justify-center bg-gradient-to-br from-optio-purple via-optio-purple-dark to-optio-pink text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-16 sm:py-24">
          <RevealSection>
            <h1
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-8 leading-none tracking-tight"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              The Process<br />Is The Goal
            </h1>
            <p
              className="text-xl sm:text-2xl text-white/80 max-w-2xl mx-auto leading-relaxed mb-8"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              Centuries of research have taught us what motivates humans to learn. Explore our philosophy below.
            </p>
            <div className="flex items-center justify-center gap-2 text-white/50">
              <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              <span className="text-sm" style={{ fontFamily: 'Poppins' }}>
                {isMobile ? 'Tap to explore' : 'Click nodes to explore'}
              </span>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== MIND MAP ========== */}
      <section className={isMobile ? 'bg-gray-50 min-h-screen' : 'bg-gray-50'}>
        {loading && (
          <div className="flex items-center justify-center py-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-32">
            <p className="text-gray-500" style={{ fontFamily: 'Poppins' }}>{error}</p>
          </div>
        )}

        {!loading && !error && nodes.length > 0 && (
          <>
            {isMobile ? (
              <MobileMindMap nodes={nodes} edges={edges} />
            ) : (
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
                  </div>
                }
              >
                <div style={{ height: 'calc(100vh - 80px)' }}>
                  <MindMap initialNodes={nodes} initialEdges={edges} />
                </div>
              </Suspense>
            )}

            {/* SEO fallback */}
            <PhilosophySEOFallback nodes={nodes} />
          </>
        )}
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
