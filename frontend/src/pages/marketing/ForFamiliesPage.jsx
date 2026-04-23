import React from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import MarketingLayout from '../../components/marketing/MarketingLayout'
import { RevealSection, RevealItem } from '../../components/marketing/RevealSection'
import { useSectionView, useCtaTracker } from '../../components/marketing/useMarketingAnalytics'
import InlineContactForm from '../../components/marketing/InlineContactForm'

const PAGE = 'for_families'

const IMAGES = {
  hero: 'https://images.pexels.com/photos/7799601/pexels-photo-7799601.jpeg?auto=compress&cs=tinysrgb&w=1920',
  journal: 'https://images.pexels.com/photos/4145354/pexels-photo-4145354.jpeg?auto=compress&cs=tinysrgb&w=800',
  portfolio: 'https://images.pexels.com/photos/8423048/pexels-photo-8423048.jpeg?auto=compress&cs=tinysrgb&w=800',
  observer: 'https://images.pexels.com/photos/5960687/pexels-photo-5960687.jpeg?auto=compress&cs=tinysrgb&w=800',
}

const CheckIcon = () => (
  <svg className="w-5 h-5 text-optio-purple flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const ForFamiliesPage = () => {
  const trackCta = useCtaTracker(PAGE)

  const heroRef = useSectionView('hero', PAGE)
  const problemRef = useSectionView('problem', PAGE)
  const featuresRef = useSectionView('features', PAGE)
  const observerRef = useSectionView('observer_access', PAGE)
  const testimonialRef = useSectionView('testimonial', PAGE)
  const diplomaRef = useSectionView('diploma', PAGE)
  return (
    <MarketingLayout>
      <Helmet>
        <title>For Families | Optio</title>
        <meta name="description" content="Track your kids' learning, build portfolios automatically, and turn it into official credit. For homeschool families and public school families alike." />
        <meta property="og:title" content="For Families | Optio" />
        <meta property="og:description" content="Your kids are learning amazing things. Optio tracks it, builds portfolios, and can turn it into official credit." />
        <meta property="og:url" content="https://www.optioeducation.com/for-families" />
        <link rel="canonical" href="https://www.optioeducation.com/for-families" />
      </Helmet>

      {/* ========== HERO ========== */}
      <section ref={heroRef} className="relative overflow-hidden min-h-[55vh] flex items-end">
        <div className="absolute inset-0">
          <img src={IMAGES.hero} alt="" className="w-full h-full object-cover" style={{ objectPosition: 'center 20%' }} />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/95 via-gray-900/60 via-50% to-transparent" />
        </div>
        <div className="relative max-w-5xl mx-auto px-4 pb-12 sm:pb-16 pt-32 sm:pt-40 text-center text-white">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 leading-tight drop-shadow-lg" style={{ fontFamily: 'Poppins', fontWeight: 700, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
            Your Kids Are Learning Amazing Things. Now It Can Count.
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed mb-8 drop-shadow-md" style={{ fontFamily: 'Poppins', fontWeight: 500, textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
            No matter how your family learns, Optio tracks it all. Build a record of your kids' learning and share it with loved ones.
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

      {/* ========== THE PROBLEM ========== */}
      <section ref={problemRef} className="py-16 sm:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Sound Familiar?
              </h2>
            </div>
          </RevealSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { problem: 'So much learning, no record of it', detail: 'Piano lessons, sports, coding projects, volunteering. None of it shows up on a transcript.', img: 'https://images.pexels.com/photos/669615/pexels-photo-669615.jpeg?auto=compress&cs=tinysrgb&w=400' },
              { problem: 'No way to show what they can do', detail: 'Your kids are doing incredible things but colleges and employers only see grades.', img: 'https://images.pexels.com/photos/3791136/pexels-photo-3791136.jpeg?auto=compress&cs=tinysrgb&w=400' },
              { problem: 'Family can\'t see progress', detail: 'Grandparents and relatives ask what the kids are learning and you have no easy way to share.', img: 'https://images.pexels.com/photos/3931399/pexels-photo-3931399.jpeg?auto=compress&cs=tinysrgb&w=400' },
            ].map((item, i) => (
              <RevealItem key={i} index={i}>
                <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                  <div className="aspect-[16/9] overflow-hidden">
                    <img src={item.img} alt={item.problem} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-gray-800 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>{item.problem}</p>
                    <p className="text-sm text-gray-500" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.detail}</p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== OPTIO FIXES THAT ========== */}
      <section ref={featuresRef} className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                One Place for All Their Learning
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Whether it happens in school, at home, or out in the world, Optio captures it all.
              </p>
            </div>
          </RevealSection>

          {/* Feature 1: Learning Journal */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16 sm:mb-20">
            <RevealSection>
              <img src={IMAGES.journal} alt="Student journaling" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
            </RevealSection>
            <RevealSection delay={200}>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Capture Every Learning Moment
              </h3>
              <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Did your kid just spend three hours building something amazing? Snap a photo, write a quick note, and it's recorded. Piano recitals, science experiments, volunteer work. Quick entries that add up to a complete picture of who your child is becoming.
              </p>
              <div className="space-y-3">
                {['Quick capture from your phone or desktop', 'Organize into topics that evolve into quests', 'Attach photos, videos, and files as evidence', 'Connect any curriculum or outside class'].map((item) => (
                  <div key={item} className="flex items-start gap-3"><CheckIcon /><p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p></div>
                ))}
              </div>
            </RevealSection>
          </div>

          {/* Feature 2: Automatic Portfolio */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16 sm:mb-20">
            <RevealSection delay={200} className="order-2 lg:order-1">
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Portfolios That Build Themselves
              </h3>
              <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Every project, reflection, and achievement your kids document automatically becomes part of a professional portfolio. No scrapbooking required. When it's time to apply to colleges or jobs, it's all there.
              </p>
              <div className="space-y-3">
                {['Social media-style activity feed of learning', 'Evidence of real projects, not just grades', 'Share with colleges, employers, or family', 'Parent controls who can view'].map((item) => (
                  <div key={item} className="flex items-start gap-3"><CheckIcon /><p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p></div>
                ))}
              </div>
            </RevealSection>
            <RevealSection className="order-1 lg:order-2">
              <img src={IMAGES.portfolio} alt="Student portfolio" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
            </RevealSection>
          </div>
        </div>
      </section>

      {/* ========== OBSERVER ACCESS + BOUNTIES ========== */}
      <section ref={observerRef} className="py-16 sm:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <RevealSection>
              <img src={IMAGES.observer} alt="Family supporting student" className="rounded-2xl shadow-xl w-full aspect-[4/3] object-cover" loading="lazy" />
            </RevealSection>
            <RevealSection delay={200}>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                The Whole Family Can Participate
              </h3>
              <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Invite grandparents, mentors, and other trusted adults to follow your kids' learning journey. They can see updates, leave encouragement, and even post real-world challenges for your kids to complete.
              </p>
              <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-xl p-5 border border-optio-purple/15 mb-6">
                <p className="font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>Example: A "Bounty" from Grandma</p>
                <p className="text-gray-600 text-sm" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                  Grandma posts a challenge: "Help me organize my photo albums." Only available to her grandkids. They earn points for completing it, learn real skills, and Grandma gets help.
                </p>
              </div>
              <div className="space-y-3">
                {['You control exactly who can see your kids\' work', 'Observers get a view-only feed, not admin access', 'Challenges from family turn everyday tasks into learning', 'Education becomes something the whole family participates in'].map((item) => (
                  <div key={item} className="flex items-start gap-3"><CheckIcon /><p className="text-gray-700" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p></div>
                ))}
              </div>
            </RevealSection>
          </div>

          {/* Testimonial */}
          <RevealSection ref={testimonialRef}>
            <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-2xl p-6 sm:p-8 border border-optio-purple/10 max-w-3xl mx-auto mt-12">
              <p className="text-base sm:text-lg text-gray-700 italic mb-4 leading-relaxed text-center" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                "My husband and I feel like Optio was created just for us. We homeschool our 7 kids and this is the perfect platform to track all the unique types of learning we do in our family."
              </p>
              <p className="text-center">
                <span className="font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>Paige H.</span>
                <span className="text-sm text-gray-500 ml-2" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>Homeschool Parent, Utah</span>
              </p>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ========== FOR YOUNGER LEARNERS ========== */}
      <section className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Great for Younger Learners Too
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Kids are natural learners. Optio gives them a place to capture what they're discovering and share it with the people who care most.
              </p>
            </div>
          </RevealSection>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                title: 'Learning Journal',
                desc: 'Built a fort? Identified a bird? Finished a book? Snap a photo and write about it. Every adventure becomes part of their story.',
                img: 'https://images.pexels.com/photos/5622142/pexels-photo-5622142.jpeg?auto=compress&cs=tinysrgb&w=400',
              },
              {
                title: 'Family Activity Feed',
                desc: 'Grandparents, aunts, uncles, and mentors can follow along and cheer progress. Like a private social media feed just for your family.',
                img: 'https://images.pexels.com/photos/5960687/pexels-photo-5960687.jpeg?auto=compress&cs=tinysrgb&w=400',
              },
              {
                title: 'Challenges from Family',
                desc: 'Grandma can post a challenge: "Help me organize my garden." Kids earn points for completing it and learn real skills along the way.',
                img: 'https://images.pexels.com/photos/7799601/pexels-photo-7799601.jpeg?auto=compress&cs=tinysrgb&w=400',
              },
            ].map((item, i) => (
              <RevealItem key={item.title} index={i}>
                <div className="bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm h-full">
                  <div className="aspect-[16/9] overflow-hidden">
                    <img src={item.img} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>{item.title}</h3>
                    <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== DIPLOMA PATH ========== */}
      <section ref={diplomaRef} className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <RevealSection>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              Turn Learning Into Official Credit
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              When your family is ready, Optio can turn all that learning into real, accredited credentials that colleges and employers recognize.
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { title: 'Individual Classes', desc: 'Turn your learning on Optio into official credit that transfers to your current school. $150 per class (one semester, 0.5 credit).', img: 'https://images.pexels.com/photos/33780218/pexels-photo-33780218.jpeg?auto=compress&cs=tinysrgb&w=400' },
              { title: 'Full-Time Diploma', desc: 'Personalize your entire education through Optio Academy with a dedicated teacher.', img: 'https://images.pexels.com/photos/7692559/pexels-photo-7692559.jpeg?auto=compress&cs=tinysrgb&w=400' },
              { title: 'Dual Enrollment', desc: 'Earn college credit while completing high school requirements. Save thousands on tuition.', img: 'https://images.pexels.com/photos/5211472/pexels-photo-5211472.jpeg?auto=compress&cs=tinysrgb&w=400' },
            ].map((item, i) => (
              <RevealItem key={item.title} index={i}>
                <div className="bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm h-full">
                  <div className="aspect-[16/9] overflow-hidden">
                    <img src={item.img} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>{item.title}</h3>
                    <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item.desc}</p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ========== OPTIO FAMILY ========== */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 rounded-2xl p-8 sm:p-10 text-center border border-optio-purple/20">
              <p className="text-sm font-semibold text-optio-pink uppercase tracking-wider mb-3" style={{ fontFamily: 'Poppins' }}>Optio Family</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Everything Your Family Needs
              </h2>
              <p className="text-3xl sm:text-4xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                $50<span className="text-lg font-medium text-gray-500">/month</span>
              </p>
              <p className="text-gray-500 text-sm mb-8" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Per family. All kids included.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 max-w-lg mx-auto mb-8 text-left">
                {['Parent dashboard for all your kids', 'Connect and manage dependents', 'Observer invitations for family', 'Activity feed and portfolio access', 'Bounty system for family engagement', 'Discounts on official credits'].map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-optio-pink flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>{item}</p>
                  </div>
                ))}
              </div>
              <a
                href="#get-info"
                onClick={() => trackCta('pro_get_info')}
                className="inline-flex items-center justify-center bg-gradient-to-r from-optio-purple to-optio-pink text-white px-8 py-3 rounded-lg font-bold text-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
                style={{ fontFamily: 'Poppins' }}
              >
                Get More Info
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
        source="families"
        heading="Tell Us About Your Family"
        subheading="Drop your info and we'll reach out with everything you need."
        placeholder="How many kids do you have? What does your homeschool look like? What are you hoping Optio can help with?"
      />

    </MarketingLayout>
  )
}

export default ForFamiliesPage
