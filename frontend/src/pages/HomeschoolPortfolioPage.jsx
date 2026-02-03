import { CalendarIcon, EyeIcon, DocumentTextIcon, FolderOpenIcon, ViewColumnsIcon, LinkIcon, SparklesIcon, UsersIcon } from '@heroicons/react/24/outline'
import LandingPageHero from '../components/landing/LandingPageHero'
import LandingPageForm from '../components/landing/LandingPageForm'
import FeatureGrid from '../components/landing/FeatureGrid'
import ProcessSteps from '../components/landing/ProcessSteps'
import FAQSection from '../components/landing/FAQSection'

const HomeschoolPortfolioPage = () => {
  const scrollToForm = () => {
    document.getElementById('signup-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  const goToDemo = () => {
    window.location.href = '/demo'
  }

  const features = [
    {
      icon: <ViewColumnsIcon className="w-8 h-8 text-white" />,
      title: 'Unified Learning Dashboard',
      description: 'One beautiful place to track all learning activities, from Khan Academy to nature walks to piano lessons.',
    },
    {
      icon: <LinkIcon className="w-8 h-8 text-white" />,
      title: 'Multi-Source Integration',
      description: 'Combine online courses, textbooks, field trips, volunteer work, and real-world projects into one coherent portfolio.',
    },
    {
      icon: <FolderOpenIcon className="w-8 h-8 text-white" />,
      title: 'Evidence Upload System',
      description: 'Upload photos, videos, documents, and links as evidence. Build rich documentation of your child\'s learning journey.',
    },
    {
      icon: <EyeIcon className="w-8 h-8 text-white" />,
      title: 'Parent Oversight Tools',
      description: 'Monitor progress, review completed work, and guide your student\'s learning without micromanaging.',
    },
    {
      icon: <DocumentTextIcon className="w-8 h-8 text-white" />,
      title: 'Automatic Transcript Generation',
      description: 'Generate professional transcripts that translate your diverse homeschool curriculum into traditional credits.',
    },
    {
      icon: <SparklesIcon className="w-8 h-8 text-white" />,
      title: 'Beautiful Public Portfolio',
      description: 'Share a stunning portfolio with colleges showcasing projects, skills, and evidence of learning.',
    },
    {
      icon: <BarChart3 className="w-8 h-8 text-white" />,
      title: 'Progress Tracking',
      description: 'Visualize learning across five skill pillars (STEM, Arts, Communication, Wellness, Civics) with XP and badges.',
    },
    {
      icon: <CalendarIcon className="w-8 h-8 text-white" />,
      title: 'Learning Calendar',
      description: 'Plan upcoming activities, set goals, and track completion of quests and projects over time.',
    },
    {
      icon: <UsersIcon className="w-8 h-8 text-white" />,
      title: 'Family Engagement',
      description: 'Invite grandparents, advisors, and tutors to follow along and celebrate your student\'s progress.',
    },
  ]

  const steps = [
    {
      title: 'Create Your Free Account',
      description: 'Set up your family profile in minutes. No credit card required to start tracking learning.',
    },
    {
      title: 'Add Learning Activities',
      description: 'Create quests for any learning experience: online courses, books, projects, field trips, or skills practice.',
    },
    {
      title: 'Document & Build Portfolio',
      description: 'As your student learns, upload evidence and watch their portfolio grow. Generate transcripts anytime.',
    },
  ]

  const faqs = [
    {
      question: 'How is Optio different from other homeschool tracking tools?',
      answer: 'Optio combines portfolio building, transcript generation, and gamification in one platform. Unlike basic logbooks, we help you create a professional college-ready portfolio with visual progress tracking, evidence documentation, and shareable links.',
    },
    {
      question: 'Can I track multiple children on one account?',
      answer: 'Yes! Your parent account can link to multiple student accounts. Each child gets their own portfolio, transcript, and progress tracking.',
    },
    {
      question: 'What if we\'re already mid-year? Can we add past work?',
      answer: 'Absolutely. You can backdate activities and upload evidence for work already completed. Many families start by documenting their current semester, then gradually add historical work.',
    },
    {
      question: 'Do I need to use specific curricula for this to work?',
      answer: 'No! Optio works with any curriculum: purchased programs (Khan Academy, Time4Learning), textbooks, unit studies, unschooling, Charlotte Mason, Classical, or eclectic approaches. You define what counts as learning.',
    },
    {
      question: 'How does the transcript work for college applications?',
      answer: 'Optio generates official-looking transcripts showing courses, credit hours, and grades (if you choose to assign them). You can customize course names and descriptions to align with college expectations. Many colleges accept parent-issued transcripts from homeschoolers.',
    },
    {
      question: 'Is my student\'s information private and secure?',
      answer: 'Yes. Student portfolios are private by default. You control what\'s shared publicly. We never sell data or show ads to students. Your homeschool records are yours.',
    },
    {
      question: 'What\'s included in the free account?',
      answer: 'Free accounts include full platform access with no restrictions: unlimited quests, evidence uploads, progress tracking, transcript generation, portfolio building, and all core features. Create your account and start using the complete system today.',
    },
  ]

  const formFields = [
    {
      name: 'parentName',
      type: 'text',
      label: 'Your Name',
      placeholder: 'Jane Smith',
      required: true,
    },
    {
      name: 'email',
      type: 'email',
      label: 'Your Email',
      placeholder: 'parent@example.com',
      required: true,
    },
  ]

  return (
    <div className="min-h-screen bg-white">
      <LandingPageHero
        title="TRACK ALL YOUR LEARNING IN"
        gradientTitle="ONE BEAUTIFUL PORTFOLIO"
        staticSubtitle="The complete homeschool documentation system that grows with your student"
        ctaText="CREATE FREE ACCOUNT"
        onCtaClick={scrollToForm}
        backgroundImage="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/promo/ParentsHero.jpg"
        mobileBackgroundImage="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/promo/Mobile_ParentsHero.jpg"
        removeOverlay={true}
        textAlign="left"
        secondaryCta={{
          text: "TRY IT OUT",
          onClick: goToDemo
        }}
      />

      <LandingPageForm
        campaignSource="homeschool-portfolio"
        fields={formFields}
        submitText="Start Building Your Portfolio"
        successMessage="Welcome to Optio!"
        successSubtitle="Check your email to set up your family's learning portfolio and start documenting your homeschool journey."
      />

      <FeatureGrid
        title="Everything You Need to Document Your Homeschool Journey"
        subtitle="Stop juggling spreadsheets, folders, and notebooks. Optio brings all your homeschool tracking into one professional system."
        features={features}
      />

      <ProcessSteps
        title="Getting Started Is Easy"
        steps={steps}
      />

      <FAQSection faqs={faqs} />

      {/* Final CTA */}
      <div className="py-16 px-4 bg-gradient-to-br from-optio-purple to-optio-pink text-center">
        <div className="max-w-4xl mx-auto">
          <h2
            className="text-3xl md:text-4xl text-white mb-6"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Start Building Your Portfolio Today
          </h2>
          <p
            className="text-xl text-white/90 mb-8"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Join hundreds of homeschool families documenting their learning journey with Optio.
          </p>
          <button
            onClick={scrollToForm}
            className="bg-white text-optio-pink hover:bg-gray-100 text-lg px-8 py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Create Your Free Account
          </button>
        </div>
      </div>
    </div>
  )
}

export default HomeschoolPortfolioPage
