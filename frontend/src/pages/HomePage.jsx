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
              Your Diploma Starts Today
            </h1>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              At Optio Quest, we award you your diploma on day one. Now it's up to you to make it 
              extraordinary through real-world quests, meaningful projects, and authentic learning.
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
              <h3 className="text-xl font-semibold mb-2">Get Your Diploma</h3>
              <p className="text-gray-600">
                You receive your diploma immediately - now choose quests to make it impressive.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-primary text-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                2
              </div>
              <h3 className="text-xl font-semibold mb-2">Build Your Portfolio</h3>
              <p className="text-gray-600">
                Complete quests and document your achievements to prove your diploma's value.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-primary text-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                3
              </div>
              <h3 className="text-xl font-semibold mb-2">Make It Impressive</h3>
              <p className="text-gray-600">
                Transform your diploma into something remarkable through quality work and real accomplishments.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Your Diploma, Your Responsibility</h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              We award you your diploma on day one - but it's just a piece of paper until you make it meaningful. 
              It's your responsibility to build an impressive portfolio through our quest library that proves your 
              diploma represents real learning, genuine skills, and authentic growth.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="font-semibold text-primary mb-2">Your Responsibility</h3>
              <p className="text-sm text-gray-600">
                You own your education - make your diploma impressive through quality work
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="font-semibold text-primary mb-2">Real Achievement</h3>
              <p className="text-sm text-gray-600">
                Complete challenging quests to self-validate your learning
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="font-semibold text-primary mb-2">Prove Your Worth</h3>
              <p className="text-sm text-gray-600">
                Build a portfolio that shows your diploma is more than just a piece of paper
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
              <p className="text-gray-600 mb-4">For individuals seeking a quality education</p>
              <ul className="space-y-2 text-sm">
                <li>✓ Everything in Explorer</li>
                <li>✓ Quests are counted toward your diploma</li>
                <li>✓ Access to our support team of experienced educators</li>
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