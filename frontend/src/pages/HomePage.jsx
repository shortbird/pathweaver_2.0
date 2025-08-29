import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const HomePage = () => {
  const { isAuthenticated } = useAuth()
  const [scrolled, setScrolled] = useState(false)

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

      {/* Enhanced Hero Section with Diploma Preview */}
      <div 
        className="bg-gradient-to-br from-primary to-purple-700 text-white relative overflow-hidden"
        role="banner"
        aria-label="Hero section introducing Optio Quest Platform"
      >
        {/* Animated background elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-32 h-32 border-2 border-white/20 rounded-full animate-pulse"></div>
          <div className="absolute bottom-20 right-10 w-24 h-24 border-2 border-white/20 rounded-full animate-pulse" style={{animationDelay: '1s'}}></div>
          <div className="absolute top-1/2 left-1/3 w-20 h-20 border-2 border-white/10 rounded-full animate-pulse" style={{animationDelay: '2s'}}></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left column - Value proposition */}
            <div className="text-center lg:text-left">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                Your Learning Journey
                <span className="block sm:inline bg-gradient-to-r from-yellow-300 to-orange-300 bg-clip-text text-transparent">
                  {" "}Starts Today
                </span>
              </h1>
              <p className="text-lg sm:text-xl mb-8 leading-relaxed opacity-90 px-2 sm:px-0">
                Complete real-world quests that interest you. Document your process. 
                Build skills through actual practice.
              </p>
              
              {/* Placeholder metrics - will be dynamic in Phase 2 */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 mb-8">
                <div className="text-center">
                  <div className="text-2xl font-bold">100+</div>
                  <div className="text-sm opacity-75">Adventures Await</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">5</div>
                  <div className="text-sm opacity-75">Skill Pillars</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">∞</div>
                  <div className="text-sm opacity-75">Growth Potential</div>
                </div>
              </div>

              {/* Enhanced CTAs */}
              {!isAuthenticated && (
                <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center">
                  <Link 
                    to="/register" 
                    className="bg-pink-500 hover:bg-pink-600 text-white text-lg px-8 py-4 rounded-lg font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center group w-full sm:w-auto justify-center"
                    aria-describedby="start-journey-description"
                  >
                    Begin Your Adventure
                    <svg className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                  <span id="start-journey-description" className="sr-only">
                    Create a free account to begin your learning adventure
                  </span>
                  
                  <Link 
                    to="#demo" 
                    className="bg-white/20 backdrop-blur-sm text-white px-8 py-4 rounded-lg font-medium inline-flex items-center hover:bg-white/30 transition-all w-full sm:w-auto justify-center"
                  >
                    <svg className="mr-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Explore What's Possible
                  </Link>
                </div>
              )}
            </div>
            
            {/* Right column - Visual diploma preview mockup */}
            <div className="relative mt-8 lg:mt-0">
              {/* Main diploma card */}
              <div className="bg-white rounded-xl shadow-2xl p-6 sm:p-8 transform lg:rotate-3 hover:rotate-0 transition-transform duration-500 max-w-md mx-auto">
                <div className="border-4 border-primary/20 rounded-lg p-4 sm:p-6">
                  <div className="text-center">
                    <div className="text-primary mb-2">
                      <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-primary mb-2">Optio Portfolio Diploma</h3>
                    <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent mb-4"></div>
                    <div className="space-y-2 text-gray-700">
                      <p className="font-semibold text-lg">Example Learner</p>
                      <p className="text-sm text-gray-600">Journey ID: #OPT-2025-DEMO</p>
                      <div className="flex flex-wrap justify-center gap-2 mt-4">
                        <span className="bg-gradient-to-r from-coral to-coral-dark text-white px-3 py-1 rounded-full text-xs font-medium">
                          Creative Explorer
                        </span>
                        <span className="bg-gradient-to-r from-primary to-primary-dark text-white px-3 py-1 rounded-full text-xs font-medium">
                          Problem Solver
                        </span>
                        <span className="bg-gradient-to-r from-purple-500 to-purple-700 text-white px-3 py-1 rounded-full text-xs font-medium">
                          Community Builder
                        </span>
                      </div>
                      <div className="mt-6 pt-4 border-t border-gray-200">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Quests Completed</span>
                          <span className="font-bold text-primary">12</span>
                        </div>
                        <div className="flex justify-between text-sm mt-2">
                          <span className="text-gray-600">XP Earned</span>
                          <span className="font-bold text-primary">1,450</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Share button and verification badge */}
                <div className="mt-4 flex items-center justify-between px-2">
                  <div className="flex items-center text-xs text-gray-600">
                    <svg className="w-4 h-4 mr-1 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Verified & Shareable
                  </div>
                  <button className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium hover:bg-primary hover:text-white transition-colors flex items-center">
                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.032 4.026a9.001 9.001 0 01-7.432 0m9.032-4.026A9.001 9.001 0 0112 3c-4.474 0-8.268 2.943-9.543 7a9.97 9.97 0 011.827 3.342" />
                    </svg>
                    Share
                  </button>
                </div>
              </div>
              
              {/* Floating achievement indicators */}
              <div className="absolute -top-4 -left-4 bg-coral text-white rounded-full px-4 py-2 shadow-lg animate-bounce hidden sm:block">
                <span className="text-sm font-bold">Quest Complete!</span>
              </div>
              <div className="absolute -bottom-4 -right-4 bg-gradient-to-r from-secondary to-yellow-400 text-primary rounded-full px-4 py-2 shadow-lg animate-pulse hidden sm:block">
                <span className="text-sm font-bold">Show the world!</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Demo Section */}
      <div id="demo" className="py-16 bg-gradient-to-br from-purple-50 to-blue-50" role="main">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">A Diploma That Tells <u>Your</u> Story</h2>
            <p className="text-lg sm:text-xl text-gray-700 mb-8 max-w-3xl mx-auto">
              Share your verified learning journey with employers, schools, and your community. 
              Every quest you complete adds real evidence to your shareable portfolio.
            </p>
            
            {/* Interactive portfolio preview */}
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-xl shadow-xl overflow-hidden">
                <div className="bg-gradient-to-r from-primary to-primary-dark text-white p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-left">
                      <h3 className="text-xl font-semibold">Your Validated Optio Portfolio Diploma</h3>
                      <p className="text-sm opacity-90 mt-1">Shareable link: optioeducation.com/learner/demo-2025</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.032 4.026a9.001 9.001 0 01-7.432 0m9.032-4.026A9.001 9.001 0 0112 3c-4.474 0-8.268 2.943-9.543 7a9.97 9.97 0 011.827 3.342" />
                        </svg>
                        Share Portfolio
                      </button>
                      <button className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Verified
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="p-6 sm:p-8">
                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h4 className="text-xl font-bold mb-4 text-gray-800">Verified Quest Evidence</h4>
                      <div className="space-y-3">
                        {/* Sample quest entries */}
                        <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                          <div className="w-10 h-10 bg-gradient-to-r from-coral to-coral-dark rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-sm font-bold">✓</span>
                          </div>
                          <div className="flex-grow text-left">
                            <p className="font-medium text-gray-800">Trained for a 5K race</p>
                            <p className="text-sm text-gray-600">Evidence: Training journal & finish line photo</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs bg-coral/10 text-coral px-2 py-0.5 rounded">Practical Skills</span>
                              <span className="text-xs text-green-600 flex items-center">
                                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                Verified
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                          <div className="w-10 h-10 bg-gradient-to-r from-primary to-primary-dark rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-sm font-bold">✓</span>
                          </div>
                          <div className="flex-grow text-left">
                            <p className="font-medium text-gray-800">Explored data patterns</p>
                            <p className="text-sm text-gray-600">Evidence: Analysis notebook with visualizations</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Critical Thinking</span>
                              <span className="text-xs text-green-600 flex items-center">
                                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                Verified
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                          <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-purple-700 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-sm font-bold">✓</span>
                          </div>
                          <div className="flex-grow text-left">
                            <p className="font-medium text-gray-800">Composed original music</p>
                            <p className="text-sm text-gray-600">Evidence: Piano solo recording & sheet music</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs bg-purple-500/10 text-purple-700 px-2 py-0.5 rounded">Creativity</span>
                              <span className="text-xs text-green-600 flex items-center">
                                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                Verified
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-800 flex items-start">
                          <svg className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                          Share this portfolio diploma with employers, colleges, or anyone who wants to see your real learning journey
                        </p>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-xl font-bold mb-4 text-gray-800">Your Growth Map</h4>
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">Critical Thinking</span>
                            <span className="text-sm text-gray-600">Flourishing</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div className="bg-gradient-to-r from-primary to-primary-dark h-2.5 rounded-full transition-all duration-500" style={{width: '75%'}}></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">Practical Skills</span>
                            <span className="text-sm text-gray-600">Taking shape</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div className="bg-gradient-to-r from-coral to-coral-dark h-2.5 rounded-full transition-all duration-500" style={{width: '60%'}}></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">Communication</span>
                            <span className="text-sm text-gray-600">Discovering voice</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div className="bg-gradient-to-r from-purple-500 to-purple-700 h-2.5 rounded-full transition-all duration-500" style={{width: '50%'}}></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">Creativity</span>
                            <span className="text-sm text-gray-600">Blooming</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 h-2.5 rounded-full transition-all duration-500" style={{width: '70%'}}></div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-6 p-4 bg-gradient-to-r from-primary/5 to-purple-500/5 rounded-lg">
                        <p className="text-sm text-gray-700 font-medium">Current Progress</p>
                        <p className="text-2xl font-bold text-primary mt-1">1,450 XP</p>
                        <p className="text-xs text-gray-600 mt-1">12 quests completed</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Process Visualization */}
      <div className="py-16 sm:py-20 bg-white relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%236366f1' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12 sm:mb-16">
            <div className="inline-flex items-center bg-gradient-to-r from-primary to-primary-dark text-white rounded-full px-6 py-3 mb-6">
              <span className="text-sm font-semibold tracking-wide uppercase">Our Philosophy</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">The Process is the Goal</h2>
            <p className="text-lg sm:text-xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
              Your Optio Portfolio Diploma isn't just a certificate; it's a living record of your real learning journey. 
              Each quest you complete becomes verified evidence that you can share with employers, colleges, and your community.
            </p>
          </div>
          
          {/* Interactive process flow */}
          <div className="max-w-5xl mx-auto">
            <div className="relative">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 relative">
                {[
                  {
                    step: "1",
                    title: "Follow Your Curiosity",
                    description: "Pick something that sparks your interest and dive in",
                    icon: "🎯",
                    color: "from-primary to-primary-dark"
                  },
                  {
                    step: "2", 
                    title: "Create & Discover",
                    description: "Make something new and capture what you learn",
                    icon: "📝",
                    color: "from-purple-500 to-purple-700"
                  },
                  {
                    step: "3",
                    title: "Reflect & Grow", 
                    description: "Notice how each experience changes your perspective",
                    icon: "🏗️",
                    color: "from-coral to-coral-dark"
                  },
                  {
                    step: "4",
                    title: "Share Your Joy",
                    description: "Celebrate your growth and inspire others to explore",
                    icon: "🎓",
                    color: "from-yellow-400 to-orange-500"
                  }
                ].map((item, index) => (
                  <div key={index} className="text-center relative group">
                    <div className={`bg-white border-4 border-gray-200 group-hover:border-primary/30 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4 text-3xl shadow-lg relative z-10 transition-all duration-300 group-hover:scale-110`}>
                      {item.icon}
                    </div>
                    <div className={`absolute top-6 left-1/2 transform -translate-x-1/2 bg-gradient-to-r ${item.color} text-white text-xs font-bold px-2 py-1 rounded-full`}>
                      Step {item.step}
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold mb-2 mt-8 text-gray-800">{item.title}</h3>
                    <p className="text-sm sm:text-base text-gray-600 leading-relaxed px-2">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
            
            {/* CTA after process */}
            <div className="text-center mt-12">
              {!isAuthenticated && (
                <Link 
                  to="/register" 
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-lg px-8 py-4 rounded-lg font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center group w-full sm:w-auto justify-center"
                  aria-describedby="start-journey-description"
                >
                  Begin Your Adventure
                  <svg className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Pricing Section with Philosophy */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Choose Your Learning Rhythm</h2>
            <p className="text-lg text-gray-700 max-w-3xl mx-auto">
              We give you a diploma on day one. 
              What makes it valuable is the real work you put in by completing quests and building skills.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-semibold mb-2">Explorer</h3>
              <p className="text-3xl font-bold mb-1">Free</p>
              <p className="text-gray-600 mb-6">Perfect for curiosity and personal enrichment</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">Access quest library</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">Track ongoing quests</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-500 line-through">Earn XP for completing quests</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-500 line-through">Shareable, verified Optio Portfolio Diploma</span>
                </li>
              </ul>
              <Link 
                to="/register" 
                className="block w-full bg-gray-100 text-gray-700 hover:bg-gray-200 py-3 px-6 rounded-lg font-semibold transition-colors text-center"
              >
                Start Exploring
              </Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 hover:shadow-lg transition-shadow border-2 border-primary relative">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-primary text-white text-xs px-3 py-1 rounded-full inline-block">
                  RECOMMENDED
                </span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Creator</h3>
              <p className="text-3xl font-bold mb-1">$50<span className="text-lg font-normal text-gray-600">/month</span></p>
              <p className="text-gray-600 mb-4">For dedicated learners ready to grow</p>
              <p className="text-sm text-gray-500 mb-4">Creators get everything in Explorer, plus:</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">Shareable, verified Optio Portfolio Diploma</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">Earn XP for completing quests</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">Access to a support team of Optio educators</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">Team up with other Creators for XP bonuses</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-500 line-through">Earn an accredited high school diploma</span>
                </li>
              </ul>
              <Link 
                to="/register" 
                className="block w-full bg-gradient-to-r from-primary to-primary-dark text-white hover:shadow-lg py-3 px-6 rounded-lg font-semibold transition-all text-center"
              >
                Start Creating
              </Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8 hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-semibold mb-2">Visionary</h3>
              <p className="text-3xl font-bold mb-1">$500<span className="text-lg font-normal text-gray-600">/month</span></p>
              <p className="text-gray-600 mb-4">A personalized private school experience</p>
              <p className="text-sm text-gray-500 mb-4">Visionaries get everything in Creator, plus:</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">Personal learning guide</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">Regular check-ins with an Optio licensed educator</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">Earn an accredited high school diploma</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">Connect with Optio's extensive network of business leaders and industry experts</span>
                </li>
              </ul>
              <Link 
                to="/register" 
                className="block w-full bg-purple-600 text-white hover:bg-purple-700 py-3 px-6 rounded-lg font-semibold transition-colors text-center"
              >
                Become a Visionary
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Placeholder for Future Social Proof Section */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Create Something Meaningful</h2>
            <p className="text-lg text-gray-700 mb-8 max-w-3xl mx-auto">
              Join a community where learning is celebrated for its own sake. 
              Your curiosity and creativity are about to flourish!
            </p>
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-8 max-w-2xl mx-auto">
              <p className="text-xl font-semibold text-gray-800 mb-4">
                Your Journey Awaits
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                Take on quests that interest you. Build real skills. Document your progress. 
                There's no right or wrong way - just your way.
              </p>
              <Link 
                to="/register" 
                className="btn-primary inline-flex items-center"
              >
                Take Your First Step
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Floating CTA for desktop (appears on scroll) */}
      {!isAuthenticated && scrolled && (
        <div className="fixed bottom-6 right-6 z-50 hidden lg:block animate-fade-in">
          <Link 
            to="/register" 
            className="bg-gradient-to-r from-coral to-coral-dark hover:from-coral-dark hover:to-coral text-white px-6 py-3 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 flex items-center"
          >
            <span className="mr-2">🚀</span>
            Start Learning Today
          </Link>
        </div>
      )}
    </div>
  )
}

export default HomePage