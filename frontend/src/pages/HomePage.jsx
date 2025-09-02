import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Play, Sparkles, Trophy, Info, X } from 'lucide-react'

const HomePage = () => {
  const { isAuthenticated } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [pricingModalOpen, setPricingModalOpen] = useState(false)
  const [processModalOpen, setProcessModalOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 400)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

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
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left column - Simplified Value Proposition */}
            <div className="text-center lg:text-left">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                <span className="drop-shadow-lg">Your Learning,</span>
                <span className="block drop-shadow-lg">Your Diploma</span>
              </h1>
              <p className="text-lg sm:text-xl mb-8 leading-relaxed opacity-95 px-2 sm:px-0 drop-shadow">
                Build a portfolio that showcases real skills.
              </p>

              {/* Enhanced CTAs with better contrast */}
              {!isAuthenticated && (
                <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center">
                  <Link 
                    to="/demo" 
                    className="bg-white text-[#ef597b] hover:bg-gray-100 text-lg px-8 py-4 rounded-lg font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center group w-full sm:w-auto justify-center"
                    aria-describedby="demo-description"
                  >
                    <Play className="mr-2 w-5 h-5 group-hover:scale-110 transition-transform" aria-hidden="true" />
                    Try 2-Min Demo
                    <Sparkles className="ml-2 w-5 h-5 group-hover:rotate-12 transition-transform" aria-hidden="true" />
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
            
            {/* Right column - Static diploma preview (no hover effects) */}
            <div className="relative mt-8 lg:mt-0">
              {/* Main diploma card - removed misleading hover effect */}
              <div className="bg-white rounded-xl shadow-2xl p-6 sm:p-8 transform lg:rotate-3 max-w-md mx-auto">
                <div className="border-4 border-primary/20 rounded-lg p-4 sm:p-6">
                  <div className="text-center">
                    <div className="text-primary mb-2">
                      <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-[#ef597b] mb-2">Portfolio Diploma</h3>
                    <div className="h-px bg-gradient-to-r from-transparent via-[#ef597b]/30 to-transparent mb-4"></div>
                    <div className="space-y-2 text-gray-700">
                      <p className="font-semibold text-lg">Your Name Here</p>
                      <p className="text-sm text-gray-600">Verified Learning Journey</p>
                      <div className="flex flex-wrap justify-center gap-2 mt-4">
                        <span className="bg-[#ef597b] text-white px-3 py-1 rounded-full text-xs font-medium">
                          Creative Explorer
                        </span>
                        <span className="bg-[#6d469b] text-white px-3 py-1 rounded-full text-xs font-medium">
                          Problem Solver
                        </span>
                      </div>
                      <div className="mt-6 pt-4 border-t border-gray-200">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Real Projects</span>
                          <span className="font-bold text-[#ef597b]">12+</span>
                        </div>
                        <div className="flex justify-between text-sm mt-2">
                          <span className="text-gray-600">Skills Verified</span>
                          <span className="font-bold text-[#ef597b]">5</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Verification badge - not interactive */}
                <div className="mt-4 flex items-center justify-center px-2">
                  <div className="flex items-center text-xs text-gray-600">
                    <svg className="w-4 h-4 mr-1 text-green-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Shareable & Verified
                  </div>
                </div>
              </div>
              
              {/* Removed animated "Quest Complete" badge */}
            </div>
          </div>
        </div>
      </div>

      {/* Simplified Demo Section */}
      <div id="demo" className="py-16 bg-gradient-to-br from-purple-50 to-blue-50" role="main">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Show What You Can Do</h2>
            <p className="text-lg sm:text-xl text-gray-700 mb-8 max-w-3xl mx-auto">
              Not just grades. Real evidence of real learning.
            </p>
            
            {/* Simplified portfolio preview */}
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-xl shadow-xl overflow-hidden">
                <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-left">
                      <h3 className="text-xl font-semibold drop-shadow">Your Optio Portfolio</h3>
                      <p className="text-sm opacity-95 mt-1">Share with anyone: colleges, employers, mentors</p>
                    </div>
                    <div className="bg-green-500 px-4 py-2 rounded-lg text-sm font-medium flex items-center">
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Verified
                    </div>
                  </div>
                </div>
                
                <div className="p-6 sm:p-8">
                  <div className="grid md:grid-cols-2 gap-8">
                    {/* Simplified quest examples */}
                    <div>
                      <h4 className="text-xl font-bold mb-4 text-gray-800">Example Projects</h4>
                      <div className="space-y-3">
                        <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                          <div className="w-10 h-10 bg-[#ef597b] rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-sm font-bold" aria-hidden="true">✓</span>
                          </div>
                          <div className="flex-grow text-left">
                            <p className="font-medium text-gray-800">Built a weather app</p>
                            <span className="text-xs bg-[#ef597b]/10 text-[#ef597b] px-2 py-0.5 rounded">Coding</span>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                          <div className="w-10 h-10 bg-[#6d469b] rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-sm font-bold" aria-hidden="true">✓</span>
                          </div>
                          <div className="flex-grow text-left">
                            <p className="font-medium text-gray-800">Composed original music</p>
                            <span className="text-xs bg-[#6d469b]/10 text-[#6d469b] px-2 py-0.5 rounded">Creativity</span>
                          </div>
                        </div>
                      </div>
                      <Link 
                        to="/demo"
                        className="mt-4 inline-flex items-center text-[#ef597b] hover:text-[#e54469] font-medium text-sm"
                      >
                        See more in demo
                        <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                    
                    {/* Simplified skills display */}
                    <div>
                      <h4 className="text-xl font-bold mb-4 text-gray-800">Skills You'll Build</h4>
                      <div className="space-y-4">
                        {['Critical Thinking', 'Creativity', 'Communication'].map((skill, index) => (
                          <div key={skill}>
                            <div className="flex justify-between mb-2">
                              <span className="text-sm font-medium text-gray-700">{skill}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                              <div 
                                className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] h-2.5 rounded-full transition-all duration-500" 
                                style={{width: `${70 - (index * 10)}%`}}
                                role="progressbar"
                                aria-valuenow={70 - (index * 10)}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`${skill} progress`}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Simplified Process with Modal */}
      <div className="py-16 sm:py-20 bg-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">How It Works</h2>
            <p className="text-lg sm:text-xl text-gray-700 max-w-3xl mx-auto">
              Four simple steps to build your portfolio.
            </p>
          </div>
          
          {/* Simple process steps */}
          <div className="max-w-5xl mx-auto">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { step: "1", title: "Pick a Quest", icon: "🎯" },
                { step: "2", title: "Complete Tasks", icon: "✨" },
                { step: "3", title: "Upload Evidence", icon: "📸" },
                { step: "4", title: "Earn Your Badge", icon: "🏆" }
              ].map((item, index) => (
                <div key={index} className="text-center">
                  <div className="bg-white border-4 border-gray-200 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <span className="text-2xl" aria-hidden="true">{item.icon}</span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold mb-2 text-gray-800">{item.title}</h3>
                </div>
              ))}
            </div>
            
            {/* Learn more button */}
            <div className="text-center mt-8">
              <button
                onClick={() => setProcessModalOpen(true)}
                className="inline-flex items-center text-[#ef597b] hover:text-[#e54469] font-medium"
              >
                <Info className="mr-2 w-4 h-4" aria-hidden="true" />
                Learn More About Our Process
              </button>
            </div>
          </div>
        </div>
      </div>

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
              <p className="text-gray-600 mb-6">Full private school</p>
              <div className="flex-grow">
                <p className="text-gray-700 font-semibold mb-4">✓ Accredited diploma</p>
                <p className="text-gray-700 mb-4">✓ 1-on-1 teachers</p>
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

      {/* Floating CTA - removed emoji, better contrast */}
      {!isAuthenticated && scrolled && (
        <div className="fixed bottom-6 right-6 z-50 hidden lg:block animate-fade-in">
          <Link 
            to="/register" 
            className="bg-[#ef597b] hover:bg-[#e54469] text-white px-6 py-3 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 flex items-center font-semibold"
          >
            Start Learning Today
          </Link>
        </div>
      )}

      {/* Pricing Details Modal */}
      {pricingModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8">
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
            
            <div className="space-y-6">
              <div>
                <h4 className="text-xl font-semibold mb-3">Free Tier</h4>
                <ul className="space-y-2 text-gray-700">
                  <li>✓ Access to quest library</li>
                  <li>✓ Track your progress</li>
                  <li>✗ No portfolio diploma</li>
                  <li>✗ No evidence submission</li>
                </ul>
              </div>
              
              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#ef597b]">Supported Tier ($39.99/mo)</h4>
                <ul className="space-y-2 text-gray-700">
                  <li>✓ Everything in Free</li>
                  <li>✓ Optio Portfolio Diploma</li>
                  <li>✓ Submit evidence for quests</li>
                  <li>✓ Educator support team</li>
                  <li>✓ Team up with other learners</li>
                  <li>✓ XP and skill tracking</li>
                </ul>
              </div>
              
              <div>
                <h4 className="text-xl font-semibold mb-3 text-green-600">Academy Tier ($499.99/mo)</h4>
                <ul className="space-y-2 text-gray-700">
                  <li>✓ Everything in Supported</li>
                  <li>✓ Accredited high school diploma</li>
                  <li>✓ 1-on-1 licensed teachers</li>
                  <li>✓ Personal learning guide</li>
                  <li>✓ Regular check-ins</li>
                  <li>✓ Business mentor network</li>
                  <li>✓ College counseling</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-6 flex justify-center">
              <Link
                to="/register"
                className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all"
              >
                Get Started Now
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Process Details Modal */}
      {processModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold">Our Learning Process</h3>
              <button
                onClick={() => setProcessModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close modal"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#ef597b]">1. Pick a Quest</h4>
                <p className="text-gray-700">Choose from our library of quests that match your interests. From coding to cooking, music to mathematics - follow your curiosity.</p>
              </div>
              
              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#6d469b]">2. Complete Tasks</h4>
                <p className="text-gray-700">Each quest has specific tasks to complete. Work at your own pace, taking as much time as you need to truly understand and create.</p>
              </div>
              
              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#ef597b]">3. Upload Evidence</h4>
                <p className="text-gray-700">Document your work with photos, videos, code repositories, or written reflections. This becomes part of your permanent portfolio.</p>
              </div>
              
              <div>
                <h4 className="text-xl font-semibold mb-3 text-[#6d469b]">4. Earn Your Badge</h4>
                <p className="text-gray-700">Complete all tasks to earn XP and badges. Your achievements are permanently recorded on your diploma, ready to share with the world.</p>
              </div>
            </div>
            
            <div className="mt-6 bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Remember:</strong> The process is the goal. It's not about rushing through quests, but about genuine learning and growth.
              </p>
            </div>
            
            <div className="mt-6 flex justify-center">
              <Link
                to="/demo"
                className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all"
              >
                See It In Action
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePage