import React, { forwardRef } from 'react'
import {
  BriefcaseIcon,
  PuzzlePieceIcon,
  SparklesIcon,
  ChartBarIcon,
  UsersIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'
import FeatureCard from './FeatureCard'

const PlatformCapabilitiesSection = forwardRef(({ isVisible = true }, ref) => {

  // Positions for ecosystem diagram nodes (percentage from center)
  const nodePositions = [
    { top: '5%', left: '50%', label: 'AI', icon: SparklesIcon },
    { top: '25%', left: '85%', label: 'Analytics', icon: ChartBarIcon },
    { top: '70%', left: '85%', label: 'Parent', icon: UsersIcon },
    { top: '90%', left: '50%', label: 'Observer', icon: EyeIcon },
    { top: '70%', left: '15%', label: 'Gamified', icon: PuzzlePieceIcon },
    { top: '25%', left: '15%', label: 'Portfolio', icon: BriefcaseIcon },
  ]

  return (
    <section
      ref={ref}
      className={`py-20 bg-white transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2
            className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            More Than Just an LMS
          </h2>
          <p
            className="text-lg text-gray-600 max-w-2xl mx-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            A complete ecosystem for student-driven learning
          </p>
        </div>

        {/* Two-column layout: Animated Diagram + Features */}
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Animated Ecosystem Diagram */}
          <div className="flex items-center justify-center">
            {/* Square container for proper line alignment */}
            <div className="relative w-[320px] h-[320px] sm:w-[400px] sm:h-[400px]">
              {/* Background glow */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 sm:w-64 sm:h-64 bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 rounded-full blur-3xl"></div>
              </div>

              {/* Connection lines (SVG) */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 400 400"
              >
                {/* Lines from center (200,200) to each node - matching their % positions */}
                {/* AI: top 5%, left 50% → y=20, x=200 */}
                <line x1="200" y1="200" x2="200" y2="20" stroke="#9333ea" strokeOpacity="0.3" strokeWidth="2" strokeDasharray="8 6" strokeLinecap="round" className="ecosystem-line" />
                {/* Analytics: top 25%, left 85% → y=100, x=340 */}
                <line x1="200" y1="200" x2="340" y2="100" stroke="#9333ea" strokeOpacity="0.3" strokeWidth="2" strokeDasharray="8 6" strokeLinecap="round" className="ecosystem-line" style={{ animationDelay: '0.2s' }} />
                {/* Parent: top 70%, left 85% → y=280, x=340 */}
                <line x1="200" y1="200" x2="340" y2="280" stroke="#ec4899" strokeOpacity="0.3" strokeWidth="2" strokeDasharray="8 6" strokeLinecap="round" className="ecosystem-line" style={{ animationDelay: '0.4s' }} />
                {/* Observer: top 90%, left 50% → y=360, x=200 */}
                <line x1="200" y1="200" x2="200" y2="360" stroke="#ec4899" strokeOpacity="0.3" strokeWidth="2" strokeDasharray="8 6" strokeLinecap="round" className="ecosystem-line" style={{ animationDelay: '0.6s' }} />
                {/* Gamified: top 70%, left 15% → y=280, x=60 */}
                <line x1="200" y1="200" x2="60" y2="280" stroke="#ec4899" strokeOpacity="0.3" strokeWidth="2" strokeDasharray="8 6" strokeLinecap="round" className="ecosystem-line" style={{ animationDelay: '0.8s' }} />
                {/* Portfolio: top 25%, left 15% → y=100, x=60 */}
                <line x1="200" y1="200" x2="60" y2="100" stroke="#9333ea" strokeOpacity="0.3" strokeWidth="2" strokeDasharray="8 6" strokeLinecap="round" className="ecosystem-line" style={{ animationDelay: '1s' }} />
              </svg>

              {/* Center Student Node */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center">
                <img
                  src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/homepage/kid_small.jpg"
                  alt="Student"
                  className="w-28 h-28 sm:w-36 sm:h-36 rounded-full object-cover ecosystem-glow"
                />
                <span
                  className="mt-2 text-xs sm:text-sm font-semibold text-gray-700"
                  style={{ fontFamily: 'Poppins' }}
                >
                  Student
                </span>
              </div>

              {/* Surrounding Capability Nodes */}
              {nodePositions.map((node, index) => {
                const Icon = node.icon
                return (
                  <div
                    key={index}
                    className="absolute z-10 flex flex-col items-center -translate-x-1/2 -translate-y-1/2 ecosystem-node"
                    style={{
                      top: node.top,
                      left: node.left,
                      animationDelay: `${index * 0.15}s`,
                    }}
                  >
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white border-2 border-gray-100 shadow-md flex items-center justify-center hover:scale-110 hover:border-optio-purple/30 transition-all duration-300 cursor-default">
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-optio-purple" />
                    </div>
                    <span
                      className="mt-1 text-[10px] sm:text-xs font-medium text-gray-600 whitespace-nowrap"
                      style={{ fontFamily: 'Poppins' }}
                    >
                      {node.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right: Feature Grid */}
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Auto-Building Portfolio */}
            <FeatureCard
              title="Auto-Building Portfolio"
              description="Every project automatically captured and organized."
              isVisible={isVisible}
              index={0}
            >
              <div className="flex gap-1 mb-3">
                <div className="w-12 h-9 rounded bg-gradient-to-br from-optio-purple/20 to-optio-pink/20 border border-optio-purple/30"></div>
                <div className="w-12 h-9 rounded bg-gradient-to-br from-optio-purple/15 to-optio-pink/15 border border-optio-purple/20 -ml-3 mt-1"></div>
                <div className="w-12 h-9 rounded bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 border border-optio-purple/10 -ml-3 mt-2"></div>
              </div>
            </FeatureCard>

            {/* Gamified Learning */}
            <FeatureCard
              title="Gamified Learning"
              description="Quests and XP keep students engaged and motivated."
              isVisible={isVisible}
              index={1}
            >
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-2 flex-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full w-3/4 bg-gradient-to-r from-optio-purple to-optio-pink rounded-full"></div>
                  </div>
                  <span className="text-[10px] font-bold text-optio-purple">+50 XP</span>
                </div>
                <div className="flex gap-1">
                  <div className="w-5 h-5 rounded bg-yellow-400/80 flex items-center justify-center text-[8px]">&#9733;</div>
                  <div className="w-5 h-5 rounded bg-yellow-400/80 flex items-center justify-center text-[8px]">&#9733;</div>
                  <div className="w-5 h-5 rounded bg-gray-200 flex items-center justify-center text-[8px] text-gray-400">&#9733;</div>
                </div>
              </div>
            </FeatureCard>

            {/* AI Learning Tools */}
            <FeatureCard
              title="AI Learning Tools"
              description="Optional AI to help students direct their own learning."
              isVisible={isVisible}
              index={2}
            >
              <div className="mb-3 flex items-start gap-2">
                <div className="px-2 py-1 rounded-lg bg-gray-100 text-[10px] text-gray-600 max-w-[100px]">
                  How do I start?
                </div>
                <div className="px-2 py-1 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-[10px] text-white flex items-center gap-1">
                  <SparklesIcon className="w-3 h-3" />
                  Try this...
                </div>
              </div>
            </FeatureCard>

            {/* Progress Analytics */}
            <FeatureCard
              title="Progress Analytics"
              description="Track growth across five learning pillars."
              isVisible={isVisible}
              index={3}
            >
              <div className="mb-3 flex items-end gap-1 h-10">
                <div className="w-4 bg-blue-400/70 rounded-t" style={{ height: '60%' }}></div>
                <div className="w-4 bg-green-400/70 rounded-t" style={{ height: '80%' }}></div>
                <div className="w-4 bg-yellow-400/70 rounded-t" style={{ height: '45%' }}></div>
                <div className="w-4 bg-red-400/70 rounded-t" style={{ height: '90%' }}></div>
                <div className="w-4 bg-purple-400/70 rounded-t" style={{ height: '70%' }}></div>
              </div>
            </FeatureCard>

            {/* Parent Dashboard */}
            <FeatureCard
              title="Admin Dashboard"
              description="Manage classes, track progress, and communicate with parents."
              isVisible={isVisible}
              index={4}
            >
              <div className="mb-3 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400"></div>
                  <div className="h-2 flex-1 bg-gray-100 rounded"></div>
                  <span className="text-[9px] text-gray-400">Today</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-optio-purple"></div>
                  <div className="h-2 w-3/4 bg-gray-100 rounded"></div>
                  <span className="text-[9px] text-gray-400">Tue</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-optio-pink"></div>
                  <div className="h-2 w-1/2 bg-gray-100 rounded"></div>
                  <span className="text-[9px] text-gray-400">Mon</span>
                </div>
              </div>
            </FeatureCard>

            {/* Observer Access */}
            <FeatureCard
              title="Observer Access"
              description="Let grandparents and mentors follow along."
              isVisible={isVisible}
              index={5}
            >
              <div className="mb-3 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xs">&#128100;</div>
                <div className="flex-1">
                  <div className="h-2 w-20 bg-gray-200 rounded mb-1"></div>
                  <div className="h-1.5 w-14 bg-gray-100 rounded"></div>
                </div>
                <EyeIcon className="w-4 h-4 text-optio-purple/60" />
              </div>
            </FeatureCard>
          </div>
        </div>
      </div>

      {/* Custom animations */}
      <style>{`
        @keyframes glow-pulse {
          0%, 100% {
            box-shadow: 0 0 20px 4px rgba(147, 51, 234, 0.3), 0 0 40px 8px rgba(236, 72, 153, 0.15);
          }
          50% {
            box-shadow: 0 0 30px 8px rgba(147, 51, 234, 0.4), 0 0 60px 16px rgba(236, 72, 153, 0.2);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translate(-50%, -50%) translateY(0px);
          }
          50% {
            transform: translate(-50%, -50%) translateY(-8px);
          }
        }

        @keyframes dash-flow {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -28; }
        }

        .ecosystem-glow {
          animation: glow-pulse 3s ease-in-out infinite;
        }

        .ecosystem-node {
          animation: float 4s ease-in-out infinite;
        }

        .ecosystem-line {
          animation: dash-flow 1.5s linear infinite;
        }
      `}</style>
    </section>
  )
})

PlatformCapabilitiesSection.displayName = 'PlatformCapabilitiesSection'

export default PlatformCapabilitiesSection
