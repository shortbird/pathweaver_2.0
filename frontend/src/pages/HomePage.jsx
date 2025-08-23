import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const HomePage = () => {
  const { isAuthenticated } = useAuth()

  return (
    <div className="min-h-screen">
      <div className="bg-gradient-to-br from-primary to-purple-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-5xl font-bold mb-6">
              Turn Your Passions Into Learning
            </h1>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              PathWeaver™ empowers students to create their own educational journey through 
              interest-led learning, gamified quests, and community collaboration.
            </p>
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4 max-w-3xl mx-auto mb-8">
              <p className="text-lg font-semibold">
                🎓 Earn Official High School Credit
              </p>
              <p className="text-base mt-2">
                Complete quests to earn recognized academic credits that count toward your high school diploma
              </p>
            </div>
            {!isAuthenticated && (
              <div className="space-x-4">
                <Link to="/register" className="btn-secondary inline-block">
                  Start Your Journey
                </Link>
                <Link to="/login" className="bg-white/20 text-white px-6 py-3 rounded-lg font-medium inline-block hover:bg-white/30 transition-colors">
                  Login
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-primary text-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                1
              </div>
              <h3 className="text-xl font-semibold mb-2">Choose Your Quests</h3>
              <p className="text-gray-600">
                Browse our library of engaging quests that match your interests and learning goals.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-primary text-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                2
              </div>
              <h3 className="text-xl font-semibold mb-2">Complete Challenges</h3>
              <p className="text-gray-600">
                Submit evidence of your learning through projects, research, and real-world activities.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-primary text-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                3
              </div>
              <h3 className="text-xl font-semibold mb-2">Earn Official Credit</h3>
              <p className="text-gray-600">
                Gain XP, build your transcript with official high school credits, and showcase your unique educational journey.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">High School Credit Through Quest-Based Learning</h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              PathWeaver™ is approved for official high school credit banking. Complete quests aligned with 
              academic standards to earn credits that count toward graduation requirements.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="font-semibold text-primary mb-2">Accredited Credits</h3>
              <p className="text-sm text-gray-600">
                Earn credits recognized by schools and education departments nationwide
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="font-semibold text-primary mb-2">Flexible Learning</h3>
              <p className="text-sm text-gray-600">
                Complete coursework at your own pace through engaging, interest-based quests
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="font-semibold text-primary mb-2">Official Transcripts</h3>
              <p className="text-sm text-gray-600">
                Generate official transcripts documenting your earned credits for college applications
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="py-16 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">Choose Your Path</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="card">
              <h3 className="text-xl font-semibold mb-2">Explorer (Free)</h3>
              <p className="text-gray-600 mb-4">Perfect for enrichment and personal growth</p>
              <ul className="space-y-2 text-sm">
                <li>✓ Access to quest library</li>
                <li>✓ Track personal progress</li>
                <li>✓ Join the community</li>
              </ul>
            </div>
            <div className="card border-2 border-primary">
              <div className="bg-primary text-white text-xs px-2 py-1 rounded-full inline-block mb-2">
                MOST POPULAR
              </div>
              <h3 className="text-xl font-semibold mb-2">Creator ($20/month)</h3>
              <p className="text-gray-600 mb-4">For students earning high school credit</p>
              <ul className="space-y-2 text-sm">
                <li>✓ Everything in Explorer</li>
                <li>✓ <strong>Official high school credit banking</strong></li>
                <li>✓ Accredited transcript generation</li>
                <li>✓ Credits count toward graduation</li>
                <li>✓ Email educator support (1 business day response)</li>
                <li>✓ Community XP bonuses</li>
              </ul>
            </div>
            <div className="card">
              <h3 className="text-xl font-semibold mb-2">Visionary ($200/month)</h3>
              <p className="text-gray-600 mb-4">Premium educational partnership</p>
              <ul className="space-y-2 text-sm">
                <li>✓ Everything in Creator</li>
                <li>✓ <strong>One dedicated educator for your family</strong></li>
                <li>✓ Long-term relationship & personalized guidance</li>
                <li>✓ Custom learning plan tailored to your goals</li>
                <li>✓ Priority review & support</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HomePage