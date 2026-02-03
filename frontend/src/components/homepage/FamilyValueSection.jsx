import React, { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpenIcon,
  PlayIcon,
  FolderIcon,
  AcademicCapIcon,
  EyeIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import FeatureCard from './FeatureCard'

const FamilyValueSection = forwardRef(({ isVisible = true, testimonial = null }, ref) => {
  // Curriculum sources that feed into portfolio (with fixed positions)
  const curriculumSources = [
    { name: 'Khan Academy', color: 'bg-blue-400', top: '5%', left: '50%' },
    { name: 'Community Sports', color: 'bg-green-400', top: '25%', left: '88%' },
    { name: 'Travel Experiences', color: 'bg-yellow-400', top: '70%', left: '88%' },
    { name: 'Entrepreneurship', color: 'bg-emerald-400', top: '95%', left: '50%' },
    { name: 'Co-op Classes', color: 'bg-purple-400', top: '70%', left: '12%' },
    { name: 'Music Lessons', color: 'bg-pink-400', top: '25%', left: '12%' },
  ]

  return (
    <section
      ref={ref}
      className={`py-20 bg-gradient-to-b from-optio-purple/5 to-optio-pink/5 transition-all duration-700 ${
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
            The Same Powerful Tools For Your Family
          </h2>
          <p
            className="text-lg text-gray-600 max-w-3xl mx-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Track every curriculum, class, and learning experience in one place. Everything flows into a professional portfolio.
          </p>
        </div>

        {/* Two-column layout: Features + Visual */}
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-12">
          {/* Left: Feature Grid */}
          <div className="grid sm:grid-cols-2 gap-4 order-2 lg:order-1">
            {/* One Central Hub */}
            <FeatureCard
              title="One Central Hub"
              description="Connect any curriculum, co-op, or class. See everything in one dashboard."
              isVisible={isVisible}
              index={0}
            >
              <div className="mb-3 flex items-center gap-1">
                <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center text-[8px] font-bold text-blue-600">M</div>
                <div className="w-6 h-6 rounded bg-green-100 flex items-center justify-center text-[8px] font-bold text-green-600">I</div>
                <div className="w-6 h-6 rounded bg-yellow-100 flex items-center justify-center text-[8px] font-bold text-yellow-600">O</div>
                <div className="text-gray-400 text-xs">...</div>
                <div className="w-8 h-8 rounded bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center">
                  <FolderIcon className="w-4 h-4 text-white" />
                </div>
              </div>
            </FeatureCard>

            {/* Learning Journal */}
            <FeatureCard
              title="Learning Journal"
              description="Capture spontaneous learning moments. Organize into topics that evolve into quests."
              isVisible={isVisible}
              index={1}
            >
              <div className="mb-3 flex items-center gap-1.5">
                <div className="flex flex-col gap-0.5">
                  <div className="w-16 h-2 rounded bg-optio-purple/20"></div>
                  <div className="w-12 h-1.5 rounded bg-gray-200"></div>
                </div>
                <div className="text-optio-purple text-lg">+</div>
                <div className="px-1.5 py-0.5 rounded bg-emerald-100 text-[8px] text-emerald-700 font-medium">New moment</div>
              </div>
            </FeatureCard>

            {/* Diploma Path */}
            <FeatureCard
              title="Official Diploma Path"
              description="Same accredited pathway that organizations use. Real credentials."
              isVisible={isVisible}
              index={2}
            >
              <div className="mb-3 flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-100 to-yellow-200 flex items-center justify-center border border-yellow-300">
                  <AcademicCapIcon className="w-6 h-6 text-yellow-700" />
                </div>
                <div className="flex-1">
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full w-2/3 bg-gradient-to-r from-optio-purple to-optio-pink rounded-full"></div>
                  </div>
                  <span className="text-[9px] text-gray-500 mt-0.5 block">Progress toward diploma</span>
                </div>
              </div>
            </FeatureCard>

            {/* Family Dashboard */}
            <FeatureCard
              title="Parent Dashboard"
              description="See learning rhythm across all kids. No grades, just growth."
              isVisible={isVisible}
              index={3}
            >
              <div className="mb-3 flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                    <UserIcon className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className="w-1 h-4 bg-green-400 rounded-full mt-1"></div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-pink-100 flex items-center justify-center">
                    <UserIcon className="w-3.5 h-3.5 text-pink-600" />
                  </div>
                  <div className="w-1 h-6 bg-green-400 rounded-full mt-1"></div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                    <UserIcon className="w-3.5 h-3.5 text-purple-600" />
                  </div>
                  <div className="w-1 h-3 bg-yellow-400 rounded-full mt-1"></div>
                </div>
              </div>
            </FeatureCard>

            {/* Observer Access */}
            <FeatureCard
              title="Observer Access"
              description="Grandparents and mentors can follow along and cheer progress."
              isVisible={isVisible}
              index={4}
            >
              <div className="mb-3 flex items-center gap-2">
                <div className="flex -space-x-2">
                  <div className="w-7 h-7 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center">
                    <UserIcon className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="w-7 h-7 rounded-full bg-gray-300 border-2 border-white flex items-center justify-center">
                    <UserIcon className="w-4 h-4 text-gray-600" />
                  </div>
                </div>
                <EyeIcon className="w-4 h-4 text-optio-purple/60" />
                <div className="px-2 py-0.5 rounded bg-green-100 text-[9px] text-green-700 font-medium">Viewing</div>
              </div>
            </FeatureCard>

            {/* Personalized Quests */}
            <FeatureCard
              title="Personalized Quests"
              description="Create learning adventures around your child's interests. Or choose from our library."
              isVisible={isVisible}
              index={5}
            >
              <div className="mb-3 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center text-white text-sm">&#9733;</div>
                <div className="flex-1">
                  <div className="text-[9px] font-medium text-gray-700">Photography Quest</div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-0.5">
                    <div className="h-full w-1/3 bg-optio-purple rounded-full"></div>
                  </div>
                </div>
              </div>
            </FeatureCard>
          </div>

          {/* Right: Curriculum Funnel Visual */}
          <div className="flex items-center justify-center order-1 lg:order-2">
            <div className="relative w-[320px] h-[320px] sm:w-[380px] sm:h-[380px]">
              {/* Background glow */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 sm:w-56 sm:h-56 bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 rounded-full blur-3xl"></div>
              </div>

              {/* Connecting lines (SVG) */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 100 100"
              >
                {/* Lines from center to each curriculum source */}
                <line x1="50" y1="50" x2="50" y2="5" stroke="#9333ea" strokeOpacity="0.2" strokeWidth="0.5" strokeDasharray="2 2" className="curriculum-line" />
                <line x1="50" y1="50" x2="88" y2="25" stroke="#9333ea" strokeOpacity="0.2" strokeWidth="0.5" strokeDasharray="2 2" className="curriculum-line" style={{ animationDelay: '0.15s' }} />
                <line x1="50" y1="50" x2="88" y2="70" stroke="#9333ea" strokeOpacity="0.2" strokeWidth="0.5" strokeDasharray="2 2" className="curriculum-line" style={{ animationDelay: '0.3s' }} />
                <line x1="50" y1="50" x2="50" y2="95" stroke="#9333ea" strokeOpacity="0.2" strokeWidth="0.5" strokeDasharray="2 2" className="curriculum-line" style={{ animationDelay: '0.45s' }} />
                <line x1="50" y1="50" x2="12" y2="70" stroke="#9333ea" strokeOpacity="0.2" strokeWidth="0.5" strokeDasharray="2 2" className="curriculum-line" style={{ animationDelay: '0.6s' }} />
                <line x1="50" y1="50" x2="12" y2="25" stroke="#9333ea" strokeOpacity="0.2" strokeWidth="0.5" strokeDasharray="2 2" className="curriculum-line" style={{ animationDelay: '0.75s' }} />
              </svg>

              {/* Curriculum sources floating around */}
              {curriculumSources.map((source, index) => (
                <div
                  key={index}
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2 curriculum-float"
                  style={{
                    top: source.top,
                    left: source.left,
                    animationDelay: `${index * 0.2}s`,
                  }}
                >
                  <div className={`px-3 py-1.5 rounded-full ${source.color} text-white text-xs font-medium shadow-md whitespace-nowrap`}>
                    {source.name}
                  </div>
                </div>
              ))}

              {/* Center: Optio Portfolio */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-white shadow-xl border-2 border-optio-purple/20 flex flex-col items-center justify-center portfolio-pulse">
                  <img
                    src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg"
                    alt="Optio"
                    className="w-10 h-10 sm:w-12 sm:h-12 mb-1"
                  />
                  <span className="text-xs sm:text-sm font-bold text-gray-700" style={{ fontFamily: 'Poppins' }}>
                    Portfolio
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Testimonial */}
        {testimonial && (
          <div className="max-w-3xl mx-auto mb-12">
            <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100">
              <p
                className="text-gray-700 italic text-lg mb-4"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                "{testimonial.quote}"
              </p>
              <div className="flex items-center gap-3">
                {testimonial.avatar && (
                  <img
                    src={testimonial.avatar}
                    alt={testimonial.author}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                )}
                <div>
                  <p
                    className="font-semibold text-gray-900"
                    style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                  >
                    {testimonial.author}
                  </p>
                  <p
                    className="text-sm text-gray-500"
                    style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                  >
                    {testimonial.role}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            to="/register"
            className="inline-flex items-center justify-center bg-gradient-primary text-white px-8 py-4 rounded-lg font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all min-h-[44px] w-full sm:w-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            <BookOpenIcon className="mr-2 w-5 h-5" />
            Start Free
          </Link>
          <Link
            to="/demo"
            className="inline-flex items-center justify-center bg-white border-2 border-optio-purple text-optio-purple hover:bg-optio-purple hover:text-white px-8 py-4 rounded-lg font-bold transition-all min-h-[44px] w-full sm:w-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            <PlayIcon className="mr-2 w-5 h-5" />
            Try Demo First
          </Link>
        </div>
      </div>

      {/* Custom animations */}
      <style>{`
        @keyframes curriculum-float {
          0%, 100% {
            transform: translate(-50%, -50%) translateY(0px);
          }
          50% {
            transform: translate(-50%, -50%) translateY(-8px);
          }
        }

        @keyframes portfolio-pulse {
          0%, 100% {
            box-shadow: 0 10px 40px -10px rgba(147, 51, 234, 0.3);
          }
          50% {
            box-shadow: 0 15px 50px -10px rgba(147, 51, 234, 0.4);
          }
        }

        @keyframes line-dash {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -8; }
        }

        .curriculum-float {
          animation: curriculum-float 4s ease-in-out infinite;
        }

        .portfolio-pulse {
          animation: portfolio-pulse 3s ease-in-out infinite;
        }

        .curriculum-line {
          animation: line-dash 2s linear infinite;
        }
      `}</style>
    </section>
  )
})

FamilyValueSection.displayName = 'FamilyValueSection'

export default FamilyValueSection
