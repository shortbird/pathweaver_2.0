import { TrophyIcon, BookOpenIcon, DocumentTextIcon, BoltIcon } from '@heroicons/react/24/outline'
import LandingPageHero from '../components/landing/LandingPageHero'
import LandingPageForm from '../components/landing/LandingPageForm'
import FeatureGrid from '../components/landing/FeatureGrid'
import ProcessSteps from '../components/landing/ProcessSteps'
import FAQSection from '../components/landing/FAQSection'

const CreditTrackerLandingPage = () => {
  const rotatingCurricula = [
    'DUOLINGO',
    'KHAN ACADEMY',
    'YOUTUBE TUTORIALS',
    'REAL-WORLD EXPERIENCE',
    'COURSERA',
    'BRILLIANT',
    'CODECADEMY',
    'UDEMY',
  ]

  const scrollToForm = () => {
    document.getElementById('signup-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  const goToDemo = () => {
    window.location.href = '/demo'
  }

  const features = [
    {
      icon: <TrophyIcon className="w-8 h-8 text-white" />,
      title: 'Automatic Credit Tracking',
      description: 'Turn your online learning into official high school credits. No matter where you learn, we help you track and document it all.',
    },
    {
      icon: <BookOpenIcon className="w-8 h-8 text-white" />,
      title: 'Beautiful Portfolio',
      description: 'Build a stunning portfolio showcasing your learning journey with evidence, projects, and achievements that impress colleges.',
    },
    {
      icon: <DocumentTextIcon className="w-8 h-8 text-white" />,
      title: 'Official Transcripts',
      description: 'Generate professional transcripts that translate your diverse learning into traditional credit hours colleges recognize.',
    },
    {
      icon: <GraduationCap className="w-8 h-8 text-white" />,
      title: 'Multi-Source Integration',
      description: 'Combine learning from Khan Academy, Coursera, YouTube, textbooks, and real-world experiences in one place.',
    },
    {
      icon: <Trophy className="w-8 h-8 text-white" />,
      title: 'Achievement System',
      description: 'Earn XP, unlock badges, and level up as you complete courses. Make learning addictive and rewarding.',
    },
    {
      icon: <BoltIcon className="w-8 h-8 text-white" />,
      title: 'Instant Recognition',
      description: 'Get your first credit free to see how easy it is. Start building your transcript today, not years from now.',
    },
  ]

  const steps = [
    {
      title: 'Enter Your Email',
      description: 'Sign up for free and get your first credit at no cost. No credit card required.',
    },
    {
      title: 'Connect Your Learning',
      description: 'Tell us what you\'re learning (Khan Academy, Coursera, YouTube, etc.) and upload your evidence.',
    },
    {
      title: 'Earn Your First Credit',
      description: 'Complete the work, submit evidence, and get your first official high school credit added to your transcript.',
    },
  ]

  const faqs = [
    {
      question: 'What counts as "evidence" for earning credits?',
      answer: 'Evidence can include completed course certificates, quiz scores, project photos/videos, written reflections, or anything that shows you completed the learning. We make it easy to upload screenshots, documents, links, or photos.',
    },
    {
      question: 'How do I get my "first credit free"?',
      answer: 'Simply sign up with your email and we\'ll guide you through documenting one completed course or learning experience. Once approved, you\'ll have your first 0.5 credit on your official Optio transcript at no charge.',
    },
    {
      question: 'What online curricula can I get credit for?',
      answer: 'Any reputable learning platform works: Khan Academy, Coursera, Brilliant, edX, YouTube educational channels, Codecademy, Duolingo, and more. Even textbooks, real-world projects, and apprenticeships count.',
    },
    {
      question: 'Will colleges accept these credits?',
      answer: 'Optio provides an official transcript showing your coursework, learning hours, and competencies demonstrated. Many homeschool students successfully use similar documentation for college admissions. Check with your target colleges for their specific requirements.',
    },
    {
      question: 'How long does it take to get credit approved?',
      answer: 'Most credit reviews happen within 24-48 hours. For your first free credit, we prioritize fast approval so you can see how the system works.',
    },
    {
      question: 'What happens after my first free credit?',
      answer: 'You can continue using Optio to track all your learning with full platform access. Free accounts include unlimited credits, portfolio features, and transcript generation with no restrictions. Start building your complete learning record today.',
    },
  ]

  const formFields = [
    {
      name: 'name',
      type: 'text',
      label: 'Your Name',
      placeholder: 'Your full name',
      required: true,
    },
    {
      name: 'email',
      type: 'email',
      label: 'Your Email',
      placeholder: 'your.email@example.com',
      required: true,
    },
    {
      name: 'currentCurriculum',
      type: 'select',
      label: 'What are you currently learning with? (Optional)',
      placeholder: 'Select a platform...',
      required: false,
      options: [
        'Khan Academy',
        'Coursera',
        'Brilliant',
        'Duolingo',
        'YouTube',
        'Codecademy',
        'edX',
        'Udemy',
        'FreeCodeCamp',
        'Textbooks',
        'Other',
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-white">
      <LandingPageHero
        title="GET HIGH SCHOOL CREDIT FOR"
        rotatingWords={rotatingCurricula}
        ctaText="GET YOUR FIRST CREDIT FREE"
        onCtaClick={scrollToForm}
        backgroundImage="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/promo/StudentHero.jpg"
        mobileBackgroundImage="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/promo/Mobile_StudentsHero.jpg"
        removeOverlay={true}
        textAlign="left"
        secondaryCta={{
          text: "TRY THE DEMO",
          onClick: goToDemo
        }}
      />

      <LandingPageForm
        campaignSource="credit-tracker"
        fields={formFields}
        submitText="Claim My Free Credit"
        successMessage="Welcome to Optio!"
        successSubtitle="Check your email for next steps to earn your first free credit."
      />

      <FeatureGrid
        title="Turn Any Learning Into Official Credits"
        subtitle="Whether you're learning on Khan Academy, YouTube, Coursera, or anywhere else, Optio helps you document it and earn real high school credits."
        features={features}
      />

      <ProcessSteps steps={steps} />

      <FAQSection faqs={faqs} />

      {/* Final CTA */}
      <div className="py-16 px-4 bg-gradient-to-br from-optio-purple to-optio-pink text-center">
        <div className="max-w-4xl mx-auto">
          <h2
            className="text-3xl md:text-4xl text-white mb-6"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Ready to Get Your First Credit Free?
          </h2>
          <p
            className="text-xl text-white/90 mb-8"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Join thousands of students turning their online learning into official high school credits.
          </p>
          <button
            onClick={scrollToForm}
            className="bg-white text-optio-pink hover:bg-gray-100 text-lg px-8 py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Claim Your Free Credit Now
          </button>
        </div>
      </div>
    </div>
  )
}

export default CreditTrackerLandingPage
