import React, { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Music, Code, PenTool, Trophy, Calculator, CheckCircle } from 'lucide-react'

const ActivityCard = ({ activity, icon: Icon, color, quote, skills, credit, subject }) => (
  <div className="flex-shrink-0 w-80 h-72 bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-all duration-300 p-6">
    {/* Header with Icon */}
    <div className="flex items-center mb-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-3`} style={{ backgroundColor: `${color}20` }}>
        <Icon className="w-6 h-6" style={{ color }} />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-600">{subject}</div>
        <div className="text-lg font-bold" style={{ color }}>{credit} Credit</div>
      </div>
    </div>

    {/* Parent Quote */}
    <div className="mb-4">
      <blockquote className="text-gray-800 font-medium text-sm leading-relaxed">
        "{quote}"
      </blockquote>
    </div>

    {/* Key Skills */}
    <div className="mb-4">
      <div className="text-xs text-gray-600 mb-2">Key Skills Demonstrated:</div>
      <div className="flex flex-wrap gap-1">
        {skills.map((skill, index) => (
          <span 
            key={index}
            className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-xs"
          >
            {skill}
          </span>
        ))}
      </div>
    </div>

    {/* Trust Indicator */}
    <div className="flex items-center justify-between mt-auto">
      <div className="flex items-center text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full">
        <CheckCircle className="w-3 h-3 mr-1" />
        State Approved
      </div>
      <div className="text-xs text-gray-500">Portfolio Required</div>
    </div>
  </div>
)

const ScrollingCreditsSection = () => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const scrollRef = useRef(null)

  const activities = [
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

  const scroll = (direction) => {
    const container = scrollRef.current
    const cardWidth = 320 + 16 // card width + gap
    const scrollAmount = cardWidth * 2 // scroll 2 cards at a time
    
    if (direction === 'left') {
      container.scrollLeft -= scrollAmount
      setCurrentIndex(Math.max(0, currentIndex - 2))
    } else {
      container.scrollLeft += scrollAmount  
      setCurrentIndex(Math.min(activities.length - 1, currentIndex + 2))
    }
  }

  const updateScrollButtons = () => {
    const container = scrollRef.current
    if (container) {
      setCanScrollLeft(container.scrollLeft > 0)
      setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth)
    }
  }

  useEffect(() => {
    const container = scrollRef.current
    if (container) {
      container.addEventListener('scroll', updateScrollButtons)
      updateScrollButtons() // Initial check
      
      return () => container.removeEventListener('scroll', updateScrollButtons)
    }
  }, [])

  return (
    <div className="py-16 bg-gradient-to-br from-purple-50 to-blue-50" role="main">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Real Activities = Real Credits
          </h2>
          <p className="text-lg sm:text-xl text-gray-700 mb-8 max-w-3xl mx-auto">
            Turn what you're already doing into official high school credits with clear formulas.
          </p>
        </div>

        {/* Scrolling Cards Container */}
        <div className="relative">
          {/* Left Scroll Button */}
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center transition-all ${
              canScrollLeft 
                ? 'hover:shadow-xl hover:scale-110 text-gray-700' 
                : 'text-gray-300 cursor-not-allowed'
            }`}
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Right Scroll Button */}
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center transition-all ${
              canScrollRight 
                ? 'hover:shadow-xl hover:scale-110 text-gray-700' 
                : 'text-gray-300 cursor-not-allowed'
            }`}
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Cards Container */}
          <div 
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth px-12"
            style={{ 
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitScrollbar: { display: 'none' }
            }}
          >
            {activities.map((activity, index) => (
              <ActivityCard key={index} {...activity} />
            ))}
          </div>
        </div>

        {/* Progress Indicators */}
        <div className="flex justify-center mt-6 space-x-2">
          {activities.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                const container = scrollRef.current
                const cardWidth = 320 + 16
                container.scrollLeft = index * cardWidth
                setCurrentIndex(index)
              }}
              className={`w-2 h-2 rounded-full transition-all ${
                Math.floor(currentIndex) === index 
                  ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b]' 
                  : 'bg-gray-300'
              }`}
              aria-label={`Go to activity ${index + 1}`}
            />
          ))}
        </div>

        {/* Trust Indicators Bar */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex flex-wrap justify-center items-center gap-8 text-sm text-gray-600">
            <div className="flex items-center">
              <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
              Educator-Reviewed
            </div>
            <div className="flex items-center">
              <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
              College-Accepted
            </div>
            <div className="flex items-center">
              <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
              Portfolio Evidence Required
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-8">
          <Link 
            to="/demo"
            className="inline-flex items-center text-[#ef597b] hover:text-[#e54469] font-medium text-lg group"
          >
            <Play className="mr-2 w-5 h-5 group-hover:scale-110 transition-transform" />
            See more examples in demo
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ScrollingCreditsSection