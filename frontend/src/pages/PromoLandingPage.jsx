import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, ArrowRight, Users, Award, BookOpen, Star, MessageCircle, ChevronRight } from 'lucide-react'

const PromoLandingPage = () => {
  const [currentActivity, setCurrentActivity] = useState(0)
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
    'Skiing',
    'Coding',
    'Cooking',
    'Baking',
    'Art Projects',
    'Volunteering',
    'Photography',
    'Martial Arts',
    'Theater',
    'Robotics',
    'Gardening',
    'Writing'
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentActivity((prev) => (prev + 1) % activities.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [activities.length])

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    setIsSubmitting(false)
    setSubmitted(true)
    
    // Reset form after 3 seconds
    setTimeout(() => {
      setSubmitted(false)
      setFormData({ parentName: '', email: '', teenAge: '', activity: '' })
    }, 5000)
  }

  const ScrollToForm = () => {
    document.getElementById('signup-form').scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-[#ef597b] to-[#6d469b] text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-32 h-32 border-2 border-white/20 rounded-full"></div>
          <div className="absolute bottom-20 right-10 w-24 h-24 border-2 border-white/20 rounded-full"></div>
          <div className="absolute top-1/2 left-1/3 w-20 h-20 border-2 border-white/10 rounded-full"></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 relative">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              <span className="block drop-shadow-lg">GET HIGH SCHOOL CREDIT FOR</span>
              <div className="relative h-16 sm:h-20 mt-4">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span 
                    key={currentActivity}
                    className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white/95 drop-shadow-lg animate-fade-in"
                  >
                    {activities[currentActivity]}
                  </span>
                </div>
              </div>
            </h1>
            
            <p className="text-lg sm:text-xl lg:text-2xl mb-8 leading-relaxed opacity-95 max-w-4xl mx-auto drop-shadow px-4">
              Turn your teen's real-world passions into accredited academic credit
            </p>

            <button 
              onClick={ScrollToForm}
              className="bg-white text-[#ef597b] hover:bg-gray-100 text-lg px-8 py-4 rounded-lg font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center"
            >
              Get Your First Month Free
              <ArrowRight className="ml-2 w-5 h-5" />
            </button>

            <div className="mt-8 animate-bounce">
              <ChevronDown className="w-6 h-6 mx-auto opacity-75" />
            </div>
          </div>
        </div>
      </div>

      {/* Signup Form Section */}
      <div id="signup-form" className="py-16 bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Start Your Teen's Journey Today
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
                    Parent's Name *
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
                    Teen's Age *
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
                  </select>
                </div>

                <div>
                  <label htmlFor="activity" className="block text-sm font-medium text-gray-700 mb-2">
                    What activity is your teen passionate about?
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
                  <Check className="w-8 h-8 text-white" />
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

          {/* Trust Badges */}
          <div className="flex justify-center items-center space-x-8 mt-8 text-gray-500">
            <div className="flex items-center">
              <Award className="w-5 h-5 mr-2" />
              <span className="text-sm">Accredited</span>
            </div>
            <div className="flex items-center">
              <Users className="w-5 h-5 mr-2" />
              <span className="text-sm">Trusted by 1000+ Families</span>
            </div>
            <div className="flex items-center">
              <MessageCircle className="w-5 h-5 mr-2" />
              <span className="text-sm">24/7 Support</span>
            </div>
          </div>
        </div>
      </div>

      {/* Value Propositions */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Why Parents Choose Optio
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Finally, a way to recognize and credit your teen's real-world learning
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5 rounded-xl">
              <div className="w-16 h-16 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full flex items-center justify-center mx-auto mb-4">
                <Award className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Accredited Credits</h3>
              <p className="text-gray-600 leading-relaxed">
                Real high school credit that transfers to colleges and counts toward graduation requirements.
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
                Let your teen learn at their pace, following their interests while meeting academic standards.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-lg text-gray-600">
              Simple steps to turn passion into academic credit
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-lg">1</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Sign Up for Free Trial</h3>
              <p className="text-gray-600 leading-relaxed">
                Create your family account and explore our platform risk-free for one month.
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-lg">2</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Document Activities</h3>
              <p className="text-gray-600 leading-relaxed">
                Upload photos, videos, and descriptions of your teen's real-world learning experiences.
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-lg">3</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Earn Verified Credits</h3>
              <p className="text-gray-600 leading-relaxed">
                Receive official high school credits and a portfolio diploma to share with colleges.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Testimonials Placeholder */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              What Parents Are Saying
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Testimonial 1 */}
            <div className="bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5 p-6 rounded-xl">
              <div className="flex items-center mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-current text-yellow-400" />
                ))}
              </div>
              <p className="text-gray-700 mb-4 italic">
                "Finally, a way to get my daughter credit for her advanced photography skills. She's been taking professional photos for two years!"
              </p>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center mr-3">
                  <span className="text-sm font-semibold text-gray-600">SM</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Sarah M.</p>
                  <p className="text-sm text-gray-600">California</p>
                </div>
              </div>
            </div>

            {/* Testimonial 2 */}
            <div className="bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5 p-6 rounded-xl">
              <div className="flex items-center mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-current text-yellow-400" />
                ))}
              </div>
              <p className="text-gray-700 mb-4 italic">
                "My son's robotics team experience is now part of his official transcript. This is revolutionary for homeschool families."
              </p>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center mr-3">
                  <span className="text-sm font-semibold text-gray-600">MJ</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Michael J.</p>
                  <p className="text-sm text-gray-600">Texas</p>
                </div>
              </div>
            </div>

            {/* Testimonial 3 */}
            <div className="bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5 p-6 rounded-xl">
              <div className="flex items-center mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-current text-yellow-400" />
                ))}
              </div>
              <p className="text-gray-700 mb-4 italic">
                "The portfolio diploma helped my daughter get into her dream college. Admissions officers loved seeing her real-world projects."
              </p>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center mr-3">
                  <span className="text-sm font-semibold text-gray-600">LH</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Lisa H.</p>
                  <p className="text-sm text-gray-600">New York</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FAQs */}
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
                Yes, Optio partners with accredited educational institutions to provide legitimate high school credit that transfers to colleges and counts toward graduation requirements.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                How does credit transfer work?
              </h3>
              <p className="text-gray-600">
                Our credits are issued by accredited institutions and appear on official transcripts. We provide documentation that meets college admission standards and state graduation requirements.
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
                How much parent involvement is needed?
              </h3>
              <p className="text-gray-600">
                Minimal ongoing involvement. You'll help with initial setup and documentation, but teens can manage their own learning portfolios with our guidance and support.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="py-16 bg-gradient-to-br from-[#ef597b] to-[#6d469b] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to Transform Your Teen's Education?
          </h2>
          <p className="text-lg mb-8 opacity-95">
            Join hundreds of families already earning credit for real-world learning.
          </p>
          <p className="text-sm mb-6 opacity-90">
            Limited spots available for founding families
          </p>
          
          <button 
            onClick={ScrollToForm}
            className="bg-white text-[#ef597b] hover:bg-gray-100 text-lg px-8 py-4 rounded-lg font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center"
          >
            Start Your Free Month Now
            <ChevronRight className="ml-2 w-5 h-5" />
          </button>

          <p className="text-xs mt-4 opacity-75">
            No credit card required • Full access • Cancel anytime
          </p>
        </div>
      </div>
    </div>
  )
}

export default PromoLandingPage