import { BookOpen, Calendar, CheckCircle, Clock, MessageSquare, Target, UserCheck, Users } from 'lucide-react'
import LandingPageHero from '../components/landing/LandingPageHero'
import LandingPageForm from '../components/landing/LandingPageForm'
import FeatureGrid from '../components/landing/FeatureGrid'
import ProcessSteps from '../components/landing/ProcessSteps'
import FAQSection from '../components/landing/FAQSection'

const TeacherConsultationPage = () => {
  const scrollToForm = () => {
    document.getElementById('signup-form')?.scrollIntoView({ behavior: 'smooth' })
  }

  const goToDemo = () => {
    window.location.href = '/demo'
  }

  const features = [
    {
      icon: <UserCheck className="w-8 h-8 text-white" />,
      title: 'Licensed Teacher Expertise',
      description: 'Work with experienced, state-licensed educators who understand both traditional and alternative learning approaches.',
    },
    {
      icon: <Target className="w-8 h-8 text-white" />,
      title: 'Personalized Curriculum Planning',
      description: 'Get a custom learning plan tailored to your child\'s interests, goals, learning style, and family schedule.',
    },
    {
      icon: <BookOpen className="w-8 h-8 text-white" />,
      title: 'Resource Recommendations',
      description: 'Discover the best curricula, online courses, books, and activities for your student\'s unique needs.',
    },
    {
      icon: <Calendar className="w-8 h-8 text-white" />,
      title: 'Flexible Scheduling',
      description: 'Create realistic learning schedules that work with your family\'s lifestyle, not against it.',
    },
    {
      icon: <CheckCircle className="w-8 h-8 text-white" />,
      title: 'Progress Monitoring Support',
      description: 'Learn strategies to track progress, assess learning, and adjust your plan as your student grows.',
    },
    {
      icon: <MessageSquare className="w-8 h-8 text-white" />,
      title: 'Ongoing Advisor Access',
      description: 'Continue working with your advisor through Optio for check-ins, adjustments, and continued support (premium feature).',
    },
  ]

  const steps = [
    {
      title: 'Book Your Free Consultation',
      description: 'Schedule a 30-minute video call at a time that works for your family. No commitment required.',
    },
    {
      title: 'Meet With Your Teacher Advisor',
      description: 'Discuss your child\'s learning style, goals, challenges, and what you\'re hoping to achieve together.',
    },
    {
      title: 'Receive Your Custom Plan',
      description: 'Get a personalized education roadmap with curriculum recommendations, learning goals, and next steps.',
    },
  ]

  const faqs = [
    {
      question: 'What happens during the free 30-minute consultation?',
      answer: 'You\'ll meet via video with a licensed teacher to discuss your child\'s current learning situation, goals, interests, and challenges. They\'ll ask questions about your family\'s schedule, learning philosophy, and what success looks like for you. It\'s a judgment-free conversation focused on understanding your needs.',
    },
    {
      question: 'Are your teachers actually licensed and experienced?',
      answer: 'Yes! All our advisors are state-licensed teachers with experience in both traditional classroom settings and alternative education models (homeschool, online learning, project-based learning). Many have advanced degrees in education.',
    },
    {
      question: 'Do I have to use Optio\'s platform after the consultation?',
      answer: 'Not at all! The consultation is completely free with no strings attached. If you find the conversation valuable and want continued advisor support, we offer premium plans where your advisor stays involved. But there\'s no pressure or obligation.',
    },
    {
      question: 'What if my child has special learning needs?',
      answer: 'Our advisors have experience with diverse learners including students with ADHD, dyslexia, autism, giftedness, and anxiety. During the consultation, let us know about any learning differences so we can match you with the right advisor.',
    },
    {
      question: 'Can you help us transition from traditional school to homeschool?',
      answer: 'Absolutely! Many families we work with are making this transition. Your advisor can help you deschool, choose curricula, set realistic expectations, and create a plan that doesn\'t replicate the problems you left behind.',
    },
    {
      question: 'What if we\'re already homeschooling and just need a refresh?',
      answer: 'Perfect! Advisors help established homeschoolers too. Whether you\'re hitting a rough patch, your child is changing developmental stages, or you just want fresh ideas, a consultation can provide new perspective.',
    },
    {
      question: 'What comes after the free consultation?',
      answer: 'After the call, you\'ll receive a written summary of recommendations and next steps via email. If you want ongoing support, we\'ll explain how advisor access works through Optio\'s paid plans. But again, the consultation itself is completely free and you can implement the advice however you choose.',
    },
  ]

  const formFields = [
    {
      name: 'parentName',
      type: 'text',
      label: 'Your Name',
      placeholder: 'Your full name',
      required: true,
    },
    {
      name: 'email',
      type: 'email',
      label: 'Your Email',
      placeholder: 'parent@example.com',
      required: true,
    },
    {
      name: 'phone',
      type: 'tel',
      label: 'Phone Number (Optional)',
      placeholder: '(555) 123-4567',
      required: false,
      helpText: 'We\'ll use this to send appointment reminders',
    },
    {
      name: 'goals',
      type: 'textarea',
      label: 'What are you hoping to accomplish? (Optional)',
      placeholder: 'Share any specific goals, challenges, or questions you\'d like to discuss during the consultation...',
      required: false,
      helpText: 'This helps us match you with the right advisor',
    },
  ]

  return (
    <div className="min-h-screen bg-white">
      <LandingPageHero
        title="TRANSFORM YOUR"
        gradientTitle="CHILD'S LEARNING"
        staticSubtitle="INTO A PROFESSIONAL PORTFOLIO"
        ctaText="BOOK FREE CONSULTATION"
        onCtaClick={scrollToForm}
        backgroundImage="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/promo/HomepageHero.jpg"
        mobileBackgroundImage="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/promo/Mobile_HomepageHero.jpg"
        removeOverlay={true}
        textAlign="center"
        secondaryCta={{
          text: "TRY THE DEMO",
          onClick: goToDemo
        }}
      />

      <LandingPageForm
        campaignSource="teacher-consultation"
        fields={formFields}
        submitText="Request Free Consultation"
        successMessage="Consultation Request Received!"
        successSubtitle="We'll email you within 24 hours to schedule your free 30-minute consultation with a licensed teacher."
      />

      {/* What You'll Get Section */}
      <div className="py-16 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2
            className="text-3xl md:text-4xl text-center text-gray-900 mb-4"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            What You'll Get From Your Free Consultation
          </h2>
          <p
            className="text-lg text-center text-gray-600 mb-12 max-w-3xl mx-auto"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            A 30-minute video call with a licensed teacher who understands alternative education and will create a personalized plan for your family.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <Clock className="w-12 h-12 text-optio-purple mb-4" />
              <h3
                className="text-xl text-gray-900 mb-3"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Learning Style Assessment
              </h3>
              <p
                className="text-gray-600 leading-relaxed"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                Identify how your child learns best and what approaches will keep them engaged and motivated.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <Target className="w-12 h-12 text-optio-pink mb-4" />
              <h3
                className="text-xl text-gray-900 mb-3"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Custom Curriculum Roadmap
              </h3>
              <p
                className="text-gray-600 leading-relaxed"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                Receive specific curriculum recommendations tailored to your child's interests, goals, and learning level.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <Users className="w-12 h-12 text-optio-purple mb-4" />
              <h3
                className="text-xl text-gray-900 mb-3"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Family Scheduling Strategy
              </h3>
              <p
                className="text-gray-600 leading-relaxed"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                Create a realistic daily/weekly rhythm that honors your family's lifestyle and commitments.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <CheckCircle className="w-12 h-12 text-optio-pink mb-4" />
              <h3
                className="text-xl text-gray-900 mb-3"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                Next Steps Action Plan
              </h3>
              <p
                className="text-gray-600 leading-relaxed"
                style={{ fontFamily: 'Poppins', fontWeight: 500 }}
              >
                Leave with clear, actionable steps to implement your new education plan immediately.
              </p>
            </div>
          </div>
        </div>
      </div>

      <FeatureGrid
        title="Why Work With an Optio Teacher Advisor?"
        features={features}
      />

      <ProcessSteps
        title="How It Works"
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
            Ready to Create Your Custom Education Plan?
          </h2>
          <p
            className="text-xl text-white/90 mb-8"
            style={{ fontFamily: 'Poppins', fontWeight: 500 }}
          >
            Book your free 30-minute consultation with a licensed teacher today. No obligations, just expert guidance.
          </p>
          <button
            onClick={scrollToForm}
            className="bg-white text-optio-pink hover:bg-gray-100 text-lg px-8 py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            Book Your Free Consultation
          </button>
        </div>
      </div>
    </div>
  )
}

export default TeacherConsultationPage
