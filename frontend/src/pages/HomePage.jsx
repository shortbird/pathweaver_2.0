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
              Optio Quest empowers students to create their own educational journey through 
              interest-led learning, gamified quests, and community collaboration.
            </p>
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
                Share your learning journey through projects, research, and real-world activities.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-primary text-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                3
              </div>
              <h3 className="text-xl font-semibold mb-2">Celebrate Your Growth</h3>
              <p className="text-gray-600">
                Gain XP, build a portfolio of achievements, and create a diploma that reflects your unique educational journey.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Your Diploma, Your Journey</h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              At Optio Quest, you already have your diploma from day one! Our quests help you build a portfolio of quality learning 
              experiences that make your diploma meaningful and showcase your unique educational journey.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="font-semibold text-primary mb-2">Quality Learning</h3>
              <p className="text-sm text-gray-600">
                Build a portfolio of meaningful experiences that demonstrate real growth
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="font-semibold text-primary mb-2">Flexible Learning</h3>
              <p className="text-sm text-gray-600">
                Complete coursework at your own pace through engaging, interest-based quests
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="font-semibold text-primary mb-2">Portfolio & Transcripts</h3>
              <p className="text-sm text-gray-600">
                Create a rich portfolio and transcript that tells your unique learning story
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
              <p className="text-gray-600 mb-4">For students seeking a diploma</p>
              <ul className="space-y-2 text-sm">
                <li>✓ Everything in Explorer</li>
                <li>✓ Build your quality diploma portfolio</li>
                <li>✓ Accredited transcript generation</li>
                <li>✓ Email educator support (1 business day response)</li>
                <li>✓ Community XP bonuses</li>
              </ul>
            </div>
            <div className="card">
              <h3 className="text-xl font-semibold mb-2">Visionary ($200/month)</h3>
              <p className="text-gray-600 mb-4">Premium educational partnership</p>
              <ul className="space-y-2 text-sm">
                <li>✓ Everything in Creator</li>
                <li>✓ Access to one dedicated educator</li>
                <li>✓ Custom learning plan tailored to your goals</li>
                <li>✓ Access to our extensive network of mentors & business leaders</li>
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