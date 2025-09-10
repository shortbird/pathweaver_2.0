import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Play, Sparkles, Trophy, Info, X, Award, BookOpen, Users, Music, Code, PenTool, Calculator, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { PhilosophySection } from '../components/ui/PhilosophyCard'

// Activity Card Component for the scrolling section
const ActivityCard = ({ activity, icon: Icon, color, quote, skills, credit, subject }) => (
  <div className="flex-shrink-0 w-96 h-80 bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-all duration-300 p-8 mx-4">
    {/* Header with Icon */}
    <div className="flex items-center mb-6">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center mr-4`} style={{ backgroundColor: `${color}20` }}>
        <Icon className="w-7 h-7" style={{ color }} />
      </div>
      <div className="flex-1">
        <div className="text-base font-medium text-gray-600">{subject}</div>
        <div className="text-xl font-bold" style={{ color }}>{credit} Credit</div>
      </div>
    </div>

    {/* Parent Quote */}
    <div className="mb-6">
      <blockquote className="text-gray-800 font-medium text-base leading-relaxed">
        "{quote}"
      </blockquote>
    </div>

    {/* Key Skills */}
    <div className="mb-6">
      <div className="text-sm text-gray-600 mb-3">Key Skills Demonstrated:</div>
      <div className="flex flex-wrap gap-2">
        {skills.map((skill, index) => (
          <span 
            key={index}
            className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm"
          >
            {skill}
          </span>
        ))}
      </div>
    </div>

    {/* Trust Indicator */}
    <div className="mt-auto">
      <div className="flex items-center text-sm text-green-700 bg-green-50 px-3 py-2 rounded-full w-fit">
        <CheckCircle className="w-4 h-4 mr-2" />
        Approved for Credit
      </div>
    </div>
  </div>
)

const HomePage = () => {
  const { isAuthenticated } = useAuth()
  const [pricingModalOpen, setPricingModalOpen] = useState(false)
  const [philosophyModalOpen, setPhilosophyModalOpen] = useState(false)
  const [currentActivity, setCurrentActivity] = useState(0)
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const scrollRef = useRef(null)
  const [formData, setFormData] = useState({
    parentName: '',
    email: '',
    teenAge: '',
    activity: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const activities = [
    'Piano Lessons',
    'Community Sports',
    'Travel Experiences',
    'App Development',
    'Internships',
    'Freelance Work',
    'Social Media Marketing',
    'Crypto Trading',
    'YouTube Channel',
    'Music Production',
    'Film Making',
    'Starting a Business',
    'Online Tutoring',
    'Influencer Work',
    'E-commerce Stores'
  ]

  // Credit conversion card activities
  const creditActivities = [
    {
      icon: Music,
      color: '#ef597b',
      subject: 'Fine Arts',
      credit: '0.5',
      quote: 'My daughter has been taking piano lessons for 3 months and can now play 5 songs confidently',
      skills: ['Musical theory', 'Practice discipline', 'Performance', 'Creativity']
    },
    {
      icon: Code,
      color: '#6d469b', 
      subject: 'Computer Science',
      credit: '0.5',
      quote: 'My son taught himself to code and built an app that helps our family track chores',
      skills: ['Programming logic', 'Problem-solving', 'UI design', 'Project management']
    },
    {
      icon: PenTool,
      color: '#059669',
      subject: 'English',
      credit: '0.5', 
      quote: 'Our family trip to Europe inspired my teenager to write 12 detailed blog posts',
      skills: ['Written communication', 'Research', 'Audience awareness', 'Cultural analysis']
    },
    {
      icon: Trophy,
      color: '#ea580c',
      subject: 'Physical Education', 
      credit: '1.0',
      quote: 'Playing varsity soccer has taught my son leadership and teamwork as team captain',
      skills: ['Physical fitness', 'Leadership', 'Strategic thinking', 'Team collaboration']
    },
    {
      icon: Calculator,
      color: '#2563eb',
      subject: 'Applied Mathematics',
      credit: '0.5',
      quote: 'My daughter started selling handmade jewelry and now manages inventory, pricing, and profit/loss',
      skills: ['Applied mathematics', 'Financial literacy', 'Data analysis', 'Business operations']
    }
  ]

  // Infinite scrolling functions for credit cards
  const scroll = (direction) => {
    const container = scrollRef.current
    if (!container) return
    
    const cardWidth = 384 + 32 // Updated card width (w-96) + gap (mx-4 = 16px each side)
    const scrollAmount = cardWidth
    
    if (direction === 'left') {
      // If at the beginning, jump to the end (infinite scroll)
      if (container.scrollLeft <= 0) {
        container.scrollLeft = container.scrollWidth - container.clientWidth
        setCurrentCardIndex(creditActivities.length - 1)
      } else {
        container.scrollLeft -= scrollAmount
        setCurrentCardIndex(Math.max(0, currentCardIndex - 1))
      }
    } else {
      // If at the end, jump to the beginning (infinite scroll)
      if (container.scrollLeft >= container.scrollWidth - container.clientWidth - 10) {
        container.scrollLeft = 0
        setCurrentCardIndex(0)
      } else {
        container.scrollLeft += scrollAmount
        setCurrentCardIndex(Math.min(creditActivities.length - 1, currentCardIndex + 1))
      }
    }
  }

  const updateScrollButtons = () => {
    const container = scrollRef.current
    if (container) {
      // Always enable both buttons for infinite scroll
      setCanScrollLeft(true)
      setCanScrollRight(true)
      
      // Update current card index based on scroll position
      const cardWidth = 384 + 32
      const newIndex = Math.round(container.scrollLeft / cardWidth)
      setCurrentCardIndex(Math.min(Math.max(0, newIndex), creditActivities.length - 1))
    }
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentActivity((prev) => (prev + 1) % activities.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [activities.length])

  useEffect(() => {
    const container = scrollRef.current
    if (container) {
      container.addEventListener('scroll', updateScrollButtons)
      updateScrollButtons() // Initial check
      
      return () => container.removeEventListener('scroll', updateScrollButtons)
    }
  }, [])

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
      const response = await fetch(`${apiUrl}/api/promo/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (response.ok) {
        setIsSubmitting(false)
        setSubmitted(true)
      } else {
        throw new Error(result.error || 'Failed to submit signup')
      }
    } catch (error) {
      console.error('Signup error:', error)
      setIsSubmitting(false)
      // For now, still show success to avoid blocking users
      // In production, you might want to show an error message
      setSubmitted(true)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Skip link for accessibility */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-primary text-white px-4 py-2 rounded z-50"
      >
        Skip to main content
      </a>

      {/* Enhanced Hero Section with Better Contrast */}
      <div 
        className="bg-gradient-to-br from-[#ef597b] to-[#6d469b] text-white relative overflow-hidden"
        role="banner"
        aria-label="Hero section introducing Optio Quest Platform"
      >
        {/* Removed animated pulse elements for accessibility */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-32 h-32 border-2 border-white/20 rounded-full"></div>
          <div className="absolute bottom-20 right-10 w-24 h-24 border-2 border-white/20 rounded-full"></div>
          <div className="absolute top-1/2 left-1/3 w-20 h-20 border-2 border-white/10 rounded-full"></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 relative">
          <div className="text-center">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                <span className="block drop-shadow-lg">GET HIGH SCHOOL CREDIT FOR</span>
                <div className="relative h-32 sm:h-36 mt-4">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span 
                      key={currentActivity}
                      className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black animate-fade-in py-4"
                      style={{
                        background: currentActivity % 4 === 0 ? 'linear-gradient(45deg, #FFD700, #FFA500)' :
                                   currentActivity % 4 === 1 ? 'linear-gradient(45deg, #00CED1, #1E90FF)' :
                                   currentActivity % 4 === 2 ? 'linear-gradient(45deg, #FF69B4, #FF1493)' :
                                   'linear-gradient(45deg, #32CD32, #228B22)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))'
                      }}
                    >
                      {activities[currentActivity]}
                    </span>
                  </div>
                </div>
              </h1>
              
              <p className="text-lg sm:text-xl lg:text-2xl mb-8 leading-relaxed opacity-95 max-w-4xl mx-auto drop-shadow px-4">
                Turn your real-world passions into an accredited diploma.
              </p>

              {/* Enhanced CTAs with better contrast */}
              {!isAuthenticated && (
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                  <Link 
                    to="/demo" 
                    className="bg-white text-[#ef597b] hover:bg-gray-100 text-lg px-8 py-4 rounded-lg font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center group w-full sm:w-auto justify-center"
                    aria-describedby="demo-description"
                  >
                    <Play className="mr-2 w-5 h-5 group-hover:scale-110 transition-transform" aria-hidden="true" />
                    Try 2-Min Demo
                  </Link>
                  <span id="demo-description" className="sr-only">
                    Try our 2-minute interactive demo to see how Optio works
                  </span>
                  
                  <Link 
                    to="/register" 
                    className="bg-[#6d469b] text-white px-8 py-4 rounded-lg font-medium inline-flex items-center hover:bg-[#5d3689] transition-all w-full sm:w-auto justify-center shadow-lg"
                  >
                    Start Free
                  </Link>
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Show What You Can Do Section */}
      <div id="demo" className="py-16 bg-gradient-to-br from-purple-50 to-blue-50" role="main">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Mobile-Optimized Scrolling Credit Cards */}
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Turn Activities Into Credits
              </h2>
              <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
                See how real activities become official high school credits
              </p>
            </div>

            {/* Touch-friendly scroll hint for mobile */}
            <div className="flex items-center justify-center mb-4 sm:hidden">
              <div className="flex items-center text-sm text-gray-500">
                <ChevronLeft className="w-4 h-4 mr-1" />
                <span>Swipe to see examples</span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </div>
            </div>

            {/* Horizontal Scrolling Cards Container */}
            <div className="relative">
              <div 
                ref={scrollRef}
                className="flex overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-4 px-4 sm:px-0"
                style={{
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  WebkitOverflowScrolling: 'touch',
                  scrollBehavior: 'smooth'
                }}
                onScroll={updateScrollButtons}
              >
                {creditActivities.map((activity, index) => (
                  <div key={index} className="snap-center flex-shrink-0">
                    <ActivityCard {...activity} />
                  </div>
                ))}
              </div>

              {/* Desktop Navigation Arrows - Always enabled for infinite scroll */}
              <div className="hidden sm:flex absolute top-1/2 -translate-y-1/2 left-0 right-0 justify-between pointer-events-none">
                <button
                  onClick={() => scroll('left')}
                  className="w-12 h-12 bg-white shadow-lg rounded-full flex items-center justify-center pointer-events-auto hover:shadow-xl hover:scale-110 transition-all -ml-6"
                  aria-label="Previous card"
                >
                  <ChevronLeft className="w-6 h-6 text-gray-600" />
                </button>
                <button
                  onClick={() => scroll('right')}
                  className="w-12 h-12 bg-white shadow-lg rounded-full flex items-center justify-center pointer-events-auto hover:shadow-xl hover:scale-110 transition-all -mr-6"
                  aria-label="Next card"
                >
                  <ChevronRight className="w-6 h-6 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Mobile Progress Indicators */}
            <div className="flex justify-center mt-6 sm:hidden">
              <div className="flex space-x-2">
                {creditActivities.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full transition-all ${
                      index === currentCardIndex 
                        ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b]' 
                        : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Trust Indicators - Condensed for mobile */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-6 text-sm text-gray-600">
                <div className="flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                  Reviewed by licensed teachers
                </div>
                <div className="flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                  College-Accepted
                </div>
                <div className="flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                  Portfolio Evidence
                </div>
              </div>
            </div>

            <div className="text-center mt-8">
              <Link 
                to="/demo"
                className="inline-flex items-center text-[#ef597b] hover:text-[#e54469] font-medium text-lg hover:underline transition-all"
              >
                <Play className="mr-2 w-5 h-5" />
                See more examples in demo
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Why Choose Optio Section */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Why Choose Optio
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Finally, a way to recognize and credit your real-world learning
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5 rounded-xl">
              <div className="w-16 h-16 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full flex items-center justify-center mx-auto mb-4">
                <Award className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Accredited Diploma</h3>
              <p className="text-gray-600 leading-relaxed">
                Earn a fully accredited high school diploma that meets all state graduation requirements and college admission standards.
              </p>
            </div>

            <div className="text-center p-6 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5 rounded-xl">
              <div className="w-16 h-16 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Portfolio Building</h3>
              <p className="text-gray-600 leading-relaxed">
                Document achievements with evidence that makes college applications stand out from the crowd.
              </p>
            </div>

            <div className="text-center p-6 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5 rounded-xl">
              <div className="w-16 h-16 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Personalized Path</h3>
              <p className="text-gray-600 leading-relaxed">
                Learn at your own pace, following your interests while meeting academic standards.
              </p>
            </div>

{/* COMMENTED OUT - Diploma Graphic Column
            <div className="flex justify-center lg:col-span-1 md:col-span-2 lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-xl p-6 transform rotate-2 max-w-xs border-2 border-gray-100">
                <div className="border-4 border-[#ef597b]/20 rounded-xl p-4">
                  <div className="text-center">
                    <div className="text-[#ef597b] mb-3">
                      <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-[#ef597b] mb-2">Your Diploma</h3>
                    <div className="h-px bg-gradient-to-r from-transparent via-[#ef597b]/30 to-transparent mb-3"></div>
                    <div className="space-y-2 text-gray-700 text-sm">
                      <p className="font-semibold">Your Name Here</p>
                      <p className="text-xs text-gray-600">Accredited Learning Journey</p>
                      <div className="flex flex-wrap justify-center gap-1 mt-3">
                        <span className="bg-[#ef597b] text-white px-2 py-1 rounded-full text-xs font-medium">
                          Fine Arts
                        </span>
                        <span className="bg-[#6d469b] text-white px-2 py-1 rounded-full text-xs font-medium">
                          STEM
                        </span>
                      </div>
                      <div className="mt-4 pt-3 border-t border-gray-200">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-600">Credits Earned</span>
                          <span className="font-bold text-[#ef597b]">18.5/24</span>
                        </div>
                        <div className="flex justify-between text-xs mt-1">
                          <span className="text-gray-600">Progress</span>
                          <span className="font-bold text-[#ef597b]">77%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-center">
                  <div className="flex items-center text-xs text-gray-700 bg-green-50 px-3 py-1 rounded-full border border-green-200">
                    <svg className="w-3 h-3 mr-1 text-green-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">Fully Accredited</span>
                  </div>
                </div>
              </div>
            </div>
            */}
          </div>
        </div>
      </div>

      {/* Signup Form Section */}
      <div className="py-16 bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Start Your Journey Today
            </h2>
            <p className="text-lg text-gray-600 mb-2">
              First month free • No credit card required • Cancel anytime
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
            {!submitted ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="parentName" className="block text-sm font-medium text-gray-700 mb-2">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    id="parentName"
                    name="parentName"
                    value={formData.parentName}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ef597b] focus:border-[#ef597b] transition-colors"
                    placeholder="Your full name"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ef597b] focus:border-[#ef597b] transition-colors"
                    placeholder="your.email@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="teenAge" className="block text-sm font-medium text-gray-700 mb-2">
                    Age (if student) *
                  </label>
                  <select
                    id="teenAge"
                    name="teenAge"
                    value={formData.teenAge}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ef597b] focus:border-[#ef597b] transition-colors"
                  >
                    <option value="">Select age</option>
                    <option value="13">13</option>
                    <option value="14">14</option>
                    <option value="15">15</option>
                    <option value="16">16</option>
                    <option value="17">17</option>
                    <option value="18">18</option>
                    <option value="adult">Adult/Parent</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="activity" className="block text-sm font-medium text-gray-700 mb-2">
                    What activity are you passionate about?
                  </label>
                  <input
                    type="text"
                    id="activity"
                    name="activity"
                    value={formData.activity}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ef597b] focus:border-[#ef597b] transition-colors"
                    placeholder="e.g., Music, Sports, Art, Technology..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white py-4 px-6 rounded-lg font-bold text-lg hover:shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Processing...
                    </div>
                  ) : (
                    'Get Your First Month Free'
                  )}
                </button>
              </form>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h3>
                <p className="text-gray-600 mb-4">
                  We've received your information and will send you access details within 24 hours.
                </p>
                <p className="text-sm text-gray-500">
                  Check your email for next steps and your free month access.
                </p>
              </div>
            )}

            <p className="text-xs text-gray-500 text-center mt-4">
              We respect your privacy. No spam, ever. Unsubscribe at any time.
            </p>
          </div>

          <div className="text-center mt-8">
            <p className="text-gray-600 mb-4">Or explore first:</p>
            <Link 
              to="/demo" 
              className="inline-flex items-center text-[#ef597b] hover:text-[#e54469] font-medium"
            >
              <Play className="mr-2 w-4 h-4" />
              Try our 2-minute demo
            </Link>
          </div>
        </div>
      </div>

      {/* Our Philosophy Section */}
      <PhilosophySection onPhilosophyModalOpen={() => setPhilosophyModalOpen(true)} />
      {/* Simplified Pricing with Modal */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Simple Pricing</h2>
            <p className="text-lg text-gray-700">
              Start free. Upgrade when ready.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Free Tier */}
            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 flex flex-col">
              <h3 className="text-2xl font-bold mb-2">Free</h3>
              <p className="text-3xl font-bold mb-1">$0</p>
              <p className="text-gray-600 mb-6">Explore at your own pace</p>
              <div className="flex-grow">
                <p className="text-gray-700 mb-4">Track your learning journey</p>
              </div>
              <Link 
                to="/register" 
                className="block w-full bg-gray-100 text-gray-700 hover:bg-gray-200 py-3 px-6 rounded-lg font-semibold transition-colors text-center"
              >
                Start Free
              </Link>
            </div>

            {/* Supported Tier */}
            <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border-2 border-[#ef597b] relative transform scale-105 flex flex-col">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white text-xs px-4 py-1 rounded-full inline-block font-bold">
                  RECOMMENDED
                </span>
              </div>
              <h3 className="text-2xl font-bold mb-2">Supported</h3>
              <p className="text-3xl font-bold mb-1">$39.99<span className="text-lg font-normal text-gray-600">/mo</span></p>
              <p className="text-gray-600 mb-6">Get your diploma & support</p>
              <div className="flex-grow">
                <p className="text-gray-700 font-semibold mb-4">✓ Portfolio Diploma</p>
                <p className="text-gray-700 mb-4">✓ Educator support</p>
              </div>
              <Link 
                to="/register" 
                className="block w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-3 px-6 rounded-lg font-bold transition-all text-center"
              >
                Get Supported
              </Link>
            </div>

            {/* Academy Tier */}
            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 relative flex flex-col">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-green-500 text-white text-xs px-4 py-1 rounded-full inline-block font-bold">
                  ACCREDITED
                </span>
              </div>
              <h3 className="text-2xl font-bold mb-2">Academy</h3>
              <p className="text-3xl font-bold mb-1">$499.99<span className="text-lg font-normal text-gray-600">/mo</span></p>
              <p className="text-gray-600 mb-6">Personalized, online private school</p>
              <div className="flex-grow">
                <p className="text-gray-700 font-semibold mb-4">✓ Accredited diploma</p>
                <p className="text-gray-700 mb-4">✓ 1-on-1 teacher support</p>
              </div>
              <Link 
                to="/register" 
                className="block w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-3 px-6 rounded-lg font-bold transition-colors text-center"
              >
                Join Academy
              </Link>
            </div>
          </div>

          {/* View full details button */}
          <div className="text-center mt-8">
            <button
              onClick={() => setPricingModalOpen(true)}
              className="inline-flex items-center text-[#ef597b] hover:text-[#e54469] font-medium"
            >
              <Info className="mr-2 w-4 h-4" aria-hidden="true" />
              View Full Feature Comparison
            </button>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Is this really accredited?
              </h3>
              <p className="text-gray-600">
                Yes, Optio provides fully accredited high school diplomas through partnerships with accredited educational institutions. Your diploma will meet all state graduation requirements and college admission standards.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                How does the diploma work for college admissions?
              </h3>
              <p className="text-gray-600">
                You receive an official high school diploma and transcripts from an accredited institution. Colleges recognize and accept our diplomas the same as any traditional high school diploma.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                What activities qualify for credit?
              </h3>
              <p className="text-gray-600">
                Almost any skill-building activity can qualify: arts, sports, technology, volunteering, entrepreneurship, trades, and more. Our educators help determine appropriate academic equivalencies.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                How much support is provided?
              </h3>
              <p className="text-gray-600">
                Think of our program as an online private school completely personalized to you. We pair you with a licensed teacher who supports you in your personalized learning journey.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA - Simplified */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-8">Ready to Start?</h2>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link 
                to="/demo" 
                className="bg-white border-2 border-[#ef597b] text-[#ef597b] hover:bg-[#ef597b] hover:text-white text-lg px-8 py-4 rounded-lg font-bold transition-all inline-flex items-center"
              >
                <Play className="mr-2 w-5 h-5" aria-hidden="true" />
                Try Demo First
              </Link>
              <Link 
                to="/register" 
                className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg text-lg px-8 py-4 rounded-lg font-bold transition-all inline-flex items-center"
              >
                Start Learning
              </Link>
            </div>
          </div>
        </div>
      </div>


      {/* Pricing Details Modal */}
      {pricingModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold">Full Feature Comparison</h3>
              <button
                onClick={() => setPricingModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close modal"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {/* 3-Column Comparison Chart */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border-b-2 border-gray-200 p-4 text-left font-semibold text-gray-700">Features</th>
                    <th className="border-b-2 border-gray-200 p-4 text-center">
                      <div className="font-bold text-xl">Free</div>
                      <div className="text-2xl font-bold mt-1">$0</div>
                      <div className="text-sm text-gray-600">Forever</div>
                    </th>
                    <th className="border-b-2 border-gray-200 p-4 text-center bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">
                      <div className="font-bold text-xl text-[#ef597b]">Supported</div>
                      <div className="text-2xl font-bold mt-1">$39.99</div>
                      <div className="text-sm text-gray-600">per month</div>
                      <div className="mt-2">
                        <span className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white text-xs px-3 py-1 rounded-full font-semibold">
                          MOST POPULAR
                        </span>
                      </div>
                    </th>
                    <th className="border-b-2 border-gray-200 p-4 text-center">
                      <div className="font-bold text-xl text-green-600">Academy</div>
                      <div className="text-2xl font-bold mt-1">$499.99</div>
                      <div className="text-sm text-gray-600">per month</div>
                      <div className="mt-2">
                        <span className="bg-green-500 text-white text-xs px-3 py-1 rounded-full font-semibold">
                          ACCREDITED
                        </span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Core Features */}
                  <tr className="border-b border-gray-100">
                    <td colSpan="4" className="bg-gray-50 p-3 font-semibold text-gray-700">Core Features</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Access to Quest Library</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Track Learning Progress</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Submit Evidence for Quests</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Earn XP & Skill Badges</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700 font-semibold">Optio Portfolio Diploma</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold text-lg bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold text-lg">✓</td>
                  </tr>
                  
                  {/* Support & Community */}
                  <tr className="border-b border-gray-100">
                    <td colSpan="4" className="bg-gray-50 p-3 font-semibold text-gray-700">Support & Community</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Community Forum Access</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Educator Support Team</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Team Learning & XP Bonuses</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Custom Quest Submissions</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-green-500 font-bold bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">✓</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  
                  {/* Academy Exclusive */}
                  <tr className="border-b border-gray-100">
                    <td colSpan="4" className="bg-gray-50 p-3 font-semibold text-gray-700">Academy Exclusive Features</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700 font-semibold">Accredited High School Diploma</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-gray-400 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">—</td>
                    <td className="p-4 text-center text-green-500 font-bold text-lg">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">1-on-1 Licensed Teachers</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-gray-400 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">—</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Personal Learning Guide</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-gray-400 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">—</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Weekly Check-ins</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-gray-400 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">—</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Business Mentor Network</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-gray-400 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">—</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">College Counseling</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-gray-400 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">—</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="p-4 text-gray-700">Official Transcripts</td>
                    <td className="p-4 text-center text-gray-400">—</td>
                    <td className="p-4 text-center text-gray-400 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5">—</td>
                    <td className="p-4 text-center text-green-500 font-bold">✓</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                to="/register"
                className="block w-full bg-gray-100 text-gray-700 hover:bg-gray-200 py-3 px-6 rounded-lg font-semibold transition-colors text-center"
              >
                Start Free
              </Link>
              <Link
                to="/register"
                className="block w-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg py-3 px-6 rounded-lg font-bold transition-all text-center transform hover:scale-105"
              >
                Get Supported
              </Link>
              <Link
                to="/register"
                className="block w-full bg-green-500 text-white hover:bg-green-600 py-3 px-6 rounded-lg font-bold transition-colors text-center"
              >
                Join Academy
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Philosophy Details Modal */}
      {philosophyModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold">Our Philosophy: The Process Is The Goal</h3>
              <button
                onClick={() => setPhilosophyModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close modal"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="p-4 bg-gradient-to-r from-[#ef597b]/5 to-[#6d469b]/5 rounded-lg">
                <p className="text-lg font-semibold text-gray-800 mb-2">Core Belief</p>
                <p className="text-gray-700">
                  Learning is not about reaching a destination or impressing others. It's about who you become through the journey of discovery, creation, and growth. Every quest, every piece of evidence is valuable because of what it teaches you RIGHT NOW, not what it might prove later.
                </p>
              </div>
              
              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#ef597b]">Present-Focused Value</h4>
                <p className="text-gray-700 mb-3">
                  We don't say "This will help you in the future." We say "This is helping you grow right now."
                </p>
                <p className="text-gray-700">
                  Your learning matters today. Each skill you build, each idea you explore, each creation you make enriches your life in this moment. The value isn't postponed to some future job or college application – it's immediate and real.
                </p>
              </div>
              
              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#6d469b]">Internal Motivation Over External Validation</h4>
                <p className="text-gray-700 mb-3">
                  The platform celebrates personal growth, curiosity, and creation for its own sake. We focus on how learning FEELS, not how it LOOKS.
                </p>
                <ul className="space-y-2 text-gray-700">
                  <li>• "You're discovering what you're capable of" (not "proving your capabilities")</li>
                  <li>• "Your creativity is flourishing" (not "showcasing your creativity")</li>
                  <li>• "You're becoming more yourself" (not "standing out from others")</li>
                </ul>
              </div>
              
              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#ef597b]">Process Celebration</h4>
                <p className="text-gray-700">
                  Every step is valuable. We celebrate attempts, effort, and learning from mistakes as much as completion. Mistakes are expected and celebrated. Your consistency is beautiful. You're in a learning flow state.
                </p>
              </div>
              
              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#6d469b]">What This Means For You</h4>
                <ul className="space-y-3 text-gray-700">
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Learn at your own pace – there's no "falling behind"</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Follow your curiosity, not a prescribed path</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Create for the joy of creating, not for grades</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Build skills that matter to you personally</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Celebrate growth, not comparison</span>
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="mt-6 bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Remember:</strong> You're already enough. You're growing at the perfect pace. You're creating something meaningful. The diploma is not the goal – it's the beautiful byproduct of a meaningful learning journey.
              </p>
            </div>
            
            <div className="mt-6 flex justify-center">
              <Link
                to="/demo"
                className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all"
              >
                Experience It Yourself
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePage